// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded structural inspection of a UMF Protobuf descriptor payload.
//!
//! This preserves descriptor wire and representation content through the
//! existing codec. It does not compile `.proto` sources or certify schema
//! semantics that need the native Protobuf compiler.

use crate::{
    context::Context,
    error::{Diagnostic, EngineError, Severity, Validation},
    protobuf_descriptor,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::collections::HashSet;

const EXTENSION: &str = "umf.protobuf";
const PROFILE: &str = "protobuf-es-2.15.0";
const VERSION: &str = "0.1.0";

/// Inspect a complete UMF document carrying the pinned descriptor profile.
///
/// The function reports representation and unknown-wire findings in source
/// order, then a registry/codec interpretation warning if applicable, and
/// always ends with a compiler-required warning. Consequently a structurally
/// readable descriptor remains `valid` but never `complete` without a native
/// compiler operation.
pub fn inspect_protobuf_document(
    document: &Value,
    context: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    let document = copy_json(document, context)?;
    let (payload, payload_path) = find_payload(&document, context)?;
    inspect_protobuf_payload_admitted(payload, &payload_path, context)
}

/// Inspect a payload value which has already been copied and admitted by its
/// host. This preserves the source adapter's payload-only checkpoint without
/// revalidating a containing document that may have changed after inspection.
pub(crate) fn inspect_protobuf_payload_admitted(
    payload: &Value,
    payload_path: &Utf16,
    context: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    let payload_fields = object(payload)
        .ok_or_else(|| error("PROTOBUF_PAYLOAD", "Expected Protobuf payload object"))?;
    let mut diagnostics = Vec::new();

    for (key, _) in payload_fields {
        context.charge_work(1, payload_path.clone())?;
        let name = key.to_utf8().ok();
        if !matches!(
            name.as_deref(),
            Some("descriptorProfile" | "descriptorSet" | "sourceArchive")
        ) {
            push(
                &mut diagnostics,
                "PROTOBUF_REPRESENTATION",
                &child(&Utf16::default(), key),
                "Unknown representation field retained; native export blocked",
                Severity::Warning,
            );
        }
    }

    if !string_is(get(payload_fields, "descriptorProfile"), PROFILE) {
        push(
            &mut diagnostics,
            "PROTOBUF_PROFILE",
            &child_name(&payload_path, "descriptorProfile"),
            "Expected the pinned protobuf-es-2.15.0 descriptor profile",
            Severity::Error,
        );
    }
    let descriptor = get(payload_fields, "descriptorSet")
        .ok_or_else(|| error("PROTOBUF_PAYLOAD", "Descriptor set is missing"))?;
    if let Some(archive) = get(payload_fields, "sourceArchive") {
        inspect_archive(
            archive,
            &child_name(&payload_path, "sourceArchive"),
            &mut diagnostics,
            context,
        )?;
    }

    walk_unknown(
        descriptor,
        &Utf16::from("/descriptorSet"),
        &mut diagnostics,
        context,
        0,
    )?;
    if let Err(problem) = protobuf_descriptor::write_descriptor_set(descriptor, context) {
        if problem.is_control_failure() || problem.code == "LIMIT" {
            return Err(problem);
        }
        let message = problem
            .message
            .to_utf8()
            .unwrap_or_else(|_| "Malformed descriptor representation".to_owned());
        push(
            &mut diagnostics,
            &problem.code,
            &Utf16::from("/descriptorSet"),
            &message,
            Severity::Error,
        );
    } else {
        match check_registry_shape(descriptor, context) {
            Ok(()) => (),
            Err(RegistryProblem::Control(problem)) => return Err(problem),
            Err(RegistryProblem::Shape(message)) => {
                push(
                    &mut diagnostics,
                    "PROTOBUF_INTERPRETATION",
                    &Utf16::from("/descriptorSet"),
                    &format!("Error: {message}"),
                    Severity::Warning,
                );
            }
        }
    }
    push(
        &mut diagnostics,
        "PROTOBUF_COMPILER_REQUIRED",
        &Utf16::from("/descriptorSet"),
        "Browser descriptor checks do not certify native compiler validity; validate emitted artifacts with the pinned native compiler",
        Severity::Warning,
    );
    let valid = diagnostics
        .iter()
        .all(|item| item.severity != Severity::Error);
    Ok(Validation {
        valid,
        complete: false,
        diagnostics,
    })
}

/// Apply the pinned extension-package Draft 2020-12 schema to a selected,
/// already-copied payload without running descriptor interpretation or writing
/// bytes. Source export uses this as the predecessor's `structure(value)`
/// checkpoint; descriptor encoding remains a later, distinct phase.
pub(crate) fn validate_protobuf_payload_schema_admitted(
    payload: &Value,
    context: &mut Context<'_>,
) -> Result<bool, EngineError> {
    static PAYLOAD_SCHEMA: std::sync::OnceLock<Result<CompiledSchema, EngineError>> =
        std::sync::OnceLock::new();
    let compiled = PAYLOAD_SCHEMA
        .get_or_init(compile_protobuf_payload_schema)
        .as_ref()
        .map_err(Clone::clone)?;
    Ok(compiled.validate(payload, context)?.is_empty())
}

fn compile_protobuf_payload_schema() -> Result<CompiledSchema, EngineError> {
    // The TypeScript predecessor compiles its Ajv validator at module load.
    // Compile this immutable embedded schema once, outside per-call controls;
    // each payload instance remains admitted under its source operation Context.
    let mut context = Context::ordinary();
    let package_text = include_str!("../../../spec/extensions/protobuf/package.json");
    let package = serialization::read_json_value(
        &package_text.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut context,
    )?;
    let package_fields = object(&package)
        .ok_or_else(|| error("PROTOBUF_SCHEMA", "Embedded extension package is malformed"))?;
    let schema = get(package_fields, "schema")
        .ok_or_else(|| error("PROTOBUF_SCHEMA", "Embedded Protobuf schema is missing"))?;
    CompiledSchema::compile_consumer(schema, &SchemaResources::default(), false, &mut context)
}

fn find_payload<'a>(
    document: &'a Value,
    context: &mut Context<'_>,
) -> Result<(&'a Value, Utf16), EngineError> {
    let root = object(document)
        .ok_or_else(|| error("PROTOBUF_DOCUMENT", "Expected UMF document object"))?;
    let version =
        get(
            object(get(root, "vocabularies").ok_or_else(|| {
                error("PROTOBUF_DOCUMENT", "Document vocabularies are unavailable")
            })?)
            .ok_or_else(|| {
                error(
                    "PROTOBUF_DOCUMENT",
                    "Document vocabularies must be an object",
                )
            })?,
            EXTENSION,
        )
        .and_then(object)
        .and_then(|fields| get(fields, "version"));
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
    for (module_index, module) in modules.iter().enumerate() {
        context.charge_work(1, Utf16::default())?;
        let Some(fields) = object(module) else {
            continue;
        };
        if get(fields, "id") != Some(&Value::string_utf8("schema")) {
            continue;
        }
        let Some(elements) = get(fields, "elements").and_then(array) else {
            continue;
        };
        for (element_index, element) in elements.iter().enumerate() {
            context.charge_work(1, Utf16::default())?;
            let Some(fields) = object(element) else {
                continue;
            };
            if get(fields, "id") != Some(&Value::string_utf8("schema")) {
                continue;
            }
            let Some(extensions) = get(fields, "extensions").and_then(object) else {
                continue;
            };
            if let Some(payload) = get(extensions, EXTENSION) {
                return Ok((
                    payload,
                    Utf16::from(format!(
                        "/modules/{module_index}/elements/{element_index}/extensions/{EXTENSION}"
                    )),
                ));
            }
        }
    }
    Err(error(
        "PROTOBUF_PAYLOAD",
        "Schema element has no umf.protobuf payload",
    ))
}

fn inspect_archive(
    archive: &Value,
    path: &Utf16,
    diagnostics: &mut Vec<Diagnostic>,
    context: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Some(fields) = object(archive) else {
        push(
            diagnostics,
            "PROTOBUF_REPRESENTATION",
            path,
            "Malformed source archive retained; native source operation unavailable",
            Severity::Error,
        );
        return Ok(());
    };
    for (key, _) in fields {
        context.charge_work(1, path.clone())?;
        let key_name = key.to_utf8().ok();
        if !matches!(
            key_name.as_deref(),
            Some("role" | "compiler" | "files" | "roots")
        ) {
            push(
                diagnostics,
                "PROTOBUF_REPRESENTATION",
                &child(path, key),
                "Unknown source archive field retained; native source operation unavailable",
                Severity::Warning,
            );
        }
    }
    let mut valid = string_is(get(fields, "role"), "original")
        && matches!(get(fields, "compiler"), Some(Value::String(identity)) if !identity.is_empty());
    if let Some(files) = get(fields, "files").and_then(object) {
        for (_, source) in files {
            context.charge_work(1, path.clone())?;
            valid &= matches!(source, Value::String(_));
        }
    } else {
        valid = false;
    }
    if let Some(roots) = get(fields, "roots").and_then(array) {
        let mut seen = HashSet::<Utf16>::new();
        valid &= !roots.is_empty();
        for root in roots {
            context.charge_work(1, path.clone())?;
            let Value::String(value) = root else {
                valid = false;
                continue;
            };
            context.charge_work(value.len(), path.clone())?;
            if value.is_empty() || !seen.insert(value.clone()) {
                valid = false;
            }
        }
    } else {
        valid = false;
    }
    if !valid {
        push(
            diagnostics,
            "PROTOBUF_SOURCE_ARCHIVE",
            path,
            "Source archive does not match the retained original-source shape",
            Severity::Error,
        );
    }
    Ok(())
}

fn walk_unknown(
    node: &Value,
    path: &Utf16,
    diagnostics: &mut Vec<Diagnostic>,
    context: &mut Context<'_>,
    depth: usize,
) -> Result<(), EngineError> {
    if depth > context.limits().max_depth {
        return Err(EngineError::new(
            "LIMIT",
            path.clone(),
            "Descriptor inspection nesting exceeds limit",
        ));
    }
    context.charge_work(1, path.clone())?;
    let Some(fields) = object(node) else {
        return Ok(());
    };
    if let Some(Value::Array(items)) = get(fields, "unknown") {
        if !items.is_empty() {
            push(
                diagnostics,
                "PROTOBUF_UNKNOWN",
                &child_name(path, "unknown"),
                "Unknown native wire fields/options retained without semantic interpretation",
                Severity::Warning,
            );
        }
    }
    let Some(children) = get(fields, "fields").and_then(object) else {
        return Ok(());
    };
    for (name, value) in children {
        context.charge_work(1, path.clone())?;
        let item_path = child(&child_name(path, "fields"), name);
        match value {
            Value::Array(items) => {
                for item in items {
                    if is_descriptor_node(item) {
                        walk_unknown(item, &item_path, diagnostics, context, depth + 1)?;
                    }
                }
            }
            item if is_descriptor_node(item) => {
                walk_unknown(item, &item_path, diagnostics, context, depth + 1)?
            }
            _ => (),
        }
    }
    Ok(())
}

enum RegistryProblem {
    Control(EngineError),
    Shape(&'static str),
}

fn check_registry_shape(
    descriptor: &Value,
    context: &mut Context<'_>,
) -> Result<(), RegistryProblem> {
    let Some(root) = object(descriptor) else {
        return Err(RegistryProblem::Shape("Descriptor root is not an object"));
    };
    let Some(fields) = get(root, "fields").and_then(object) else {
        return Err(RegistryProblem::Shape(
            "Descriptor root fields are unavailable",
        ));
    };
    let Some(files) = get(fields, "file").and_then(array) else {
        return Ok(());
    };
    let mut names = HashSet::<Utf16>::new();
    for file in files {
        context
            .charge_work(1, Utf16::default())
            .map_err(RegistryProblem::Control)?;
        let Some(file_fields) = object(file)
            .and_then(|node| get(node, "fields"))
            .and_then(object)
        else {
            return Err(RegistryProblem::Shape(
                "File descriptor fields are unavailable",
            ));
        };
        let Some(Value::String(name)) = get(file_fields, "name") else {
            return Err(RegistryProblem::Shape("File descriptor name is missing"));
        };
        context
            .charge_work(name.len(), Utf16::default())
            .map_err(RegistryProblem::Control)?;
        if name.is_empty() || !names.insert(name.clone()) {
            return Err(RegistryProblem::Shape("Missing or duplicate file name"));
        }
    }
    Ok(())
}

fn is_descriptor_node(value: &Value) -> bool {
    object(value).is_some_and(|fields| {
        get(fields, "type").and_then(string).is_some()
            && get(fields, "fields").and_then(object).is_some()
    })
}
fn object(value: &Value) -> Option<&[(Utf16, Value)]> {
    if let Value::Object(items) = value {
        Some(items)
    } else {
        None
    }
}
fn array(value: &Value) -> Option<&[Value]> {
    if let Value::Array(items) = value {
        Some(items)
    } else {
        None
    }
}
fn string(value: &Value) -> Option<String> {
    match value {
        Value::String(v) => v.to_utf8().ok(),
        _ => None,
    }
}
fn string_is(value: Option<&Value>, expected: &str) -> bool {
    matches!(value, Some(Value::String(v)) if v.to_utf8().is_ok_and(|s| s == expected))
}
fn get<'a>(fields: &'a [(Utf16, Value)], key: &str) -> Option<&'a Value> {
    fields
        .iter()
        .find(|(k, _)| k.to_utf8().is_ok_and(|name| name == key))
        .map(|(_, value)| value)
}
fn child_name(path: &Utf16, name: &str) -> Utf16 {
    child(path, &Utf16::from(name))
}
fn child(path: &Utf16, name: &Utf16) -> Utf16 {
    let mut units = Vec::with_capacity(path.len().saturating_add(name.len()).saturating_add(1));
    units.extend_from_slice(path.units());
    units.push(b'/' as u16);
    units.extend_from_slice(name.units());
    Utf16::new(units)
}
fn error(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn push(out: &mut Vec<Diagnostic>, code: &str, path: &Utf16, message: &str, severity: Severity) {
    out.push(Diagnostic {
        code: Utf16::from(code),
        path: path.clone(),
        python_source_path: false,
        message: Utf16::from(message),
        severity,
        python_text_origin: None,
    });
}

#[cfg(test)]
mod payload_schema_tests {
    use super::*;

    fn payload() -> Value {
        Value::Object(vec![
            (
                Utf16::from("descriptorProfile"),
                Value::string_utf8("protobuf-es-2.15.0"),
            ),
            (
                Utf16::from("descriptorSet"),
                Value::Object(vec![
                    (
                        Utf16::from("type"),
                        Value::string_utf8("google.protobuf.FileDescriptorSet"),
                    ),
                    (Utf16::from("fields"), Value::Object(Vec::new())),
                    (Utf16::from("unknown"), Value::Array(Vec::new())),
                ]),
            ),
        ])
    }

    #[test]
    fn schema_checkpoint_is_separate_from_descriptor_writer() {
        let mut valid = payload();
        assert!(
            validate_protobuf_payload_schema_admitted(&valid, &mut Context::ordinary()).unwrap()
        );

        let Value::Object(payload_fields) = &mut valid else {
            unreachable!()
        };
        let descriptor_value = &mut payload_fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("descriptorSet"))
            .unwrap()
            .1;
        let Value::Object(descriptor_fields) = descriptor_value else {
            unreachable!()
        };
        descriptor_fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("unknown"))
            .unwrap()
            .1 = Value::Array(vec![Value::Object(vec![
            (Utf16::from("number"), Value::Number(1.0)),
            (Utf16::from("wireType"), Value::Number(2.0)),
            (Utf16::from("data"), Value::string_utf8("ff")),
        ])]);

        assert!(
            validate_protobuf_payload_schema_admitted(&valid, &mut Context::ordinary()).unwrap()
        );
        let error =
            crate::protobuf_document::export_descriptor_payload(&valid, &mut Context::ordinary())
                .unwrap_err();
        assert_eq!(error.code, "PROTOBUF_DESCRIPTOR");
    }

    #[test]
    fn schema_checkpoint_rejects_malformed_payload_and_accepts_unknown_archive_member() {
        let mut malformed = payload();
        let Value::Object(fields) = &mut malformed else {
            unreachable!()
        };
        fields.retain(|(key, _)| key != &Utf16::from("descriptorProfile"));
        assert!(
            !validate_protobuf_payload_schema_admitted(&malformed, &mut Context::ordinary())
                .unwrap()
        );

        let mut with_archive = payload();
        let Value::Object(fields) = &mut with_archive else {
            unreachable!()
        };
        fields.push((
            Utf16::from("sourceArchive"),
            Value::Object(vec![
                (Utf16::from("role"), Value::string_utf8("original")),
                (Utf16::from("compiler"), Value::string_utf8("protoc")),
                (Utf16::from("files"), Value::Object(Vec::new())),
                (
                    Utf16::from("roots"),
                    Value::Array(vec![Value::string_utf8("a.proto")]),
                ),
                (Utf16::from("future"), Value::Bool(true)),
            ]),
        ));
        assert!(
            validate_protobuf_payload_schema_admitted(&with_archive, &mut Context::ordinary())
                .unwrap()
        );
        let error = crate::protobuf_document::export_descriptor_payload(
            &with_archive,
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "PROTOBUF_REPRESENTATION");
    }
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned logical Arrow FlatBuffer model operations.
use crate::{
    context::Context,
    engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    native_json::native_pointer,
    registry::Registry,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
const EXT: &str = "umf.arrow.flatbuffer";
const TOKEN: u64 = 0x4152_5246_424d_0001;
const PROFILE: &str = "arrow-flatbuffer-model";
const SEMANTICS: &str = "Metadata structure only; Arrow semantic invariants, unknown fields and binary/data conversion remain unverified";
fn key(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn error(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn field<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v)
    } else {
        None
    }
}
fn field_mut<'a>(v: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    if let Value::Object(m) = v {
        m.iter_mut().find(|(k, _)| k == &key(name)).map(|(_, v)| v)
    } else {
        None
    }
}
fn object(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(k, v)| (key(k), v)).collect())
}
fn strv(s: &str) -> Value {
    Value::string_utf8(s)
}
fn diag(code: &str, path: &str, message: &str, severity: Severity) -> Diagnostic {
    Diagnostic {
        code: key(code),
        path: key(path),
        python_source_path: false,
        message: key(message),
        severity,
        python_text_origin: None,
    }
}

pub struct ArrowFlatbufferResources {
    engine: Engine,
    registry: Registry,
}
impl ArrowFlatbufferResources {
    pub fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        fn read(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
            serialization::read_json_value(
                &source.encode_utf16().collect::<Vec<_>>(),
                Format::Json,
                ctx,
            )
        }
        let engine = Engine::new(
            ResourceSet::new(
                read(include_str!("../../../spec/core/schema.json"), ctx)?,
                read(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
                read(
                    include_str!("../../../spec/core/extension-package.schema.json"),
                    ctx,
                )?,
                read(
                    include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                    ctx,
                )?,
                read(
                    include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                    ctx,
                )?,
            ),
            ctx,
        )?;
        let package = read(
            include_str!("../../../spec/extensions/arrow-flatbuffer/package.json"),
            ctx,
        )?;
        let schemas = engine.schema_resources_with_context(ctx)?;
        let mut registry = Registry::new();
        registry.register(
            &package,
            Some(TOKEN),
            engine.package_schema(),
            &schemas,
            ctx,
        )?;
        Ok(Self { engine, registry })
    }
}
struct Noop;
impl Capabilities for Noop {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
    fn validate_extension_with_context(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
        _: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        Ok(Vec::new())
    }
}
fn payload<'a>(doc: &'a Value) -> Option<&'a Value> {
    let modules = match field(doc, "modules")? {
        Value::Array(v) => v,
        _ => return None,
    };
    for module in modules {
        if field(module, "id") != Some(&strv("metadata")) {
            continue;
        }
        let elements = match field(module, "elements")? {
            Value::Array(v) => v,
            _ => continue,
        };
        for element in elements {
            if field(element, "id") == Some(&strv("root")) {
                return field(field(element, "extensions")?, EXT);
            }
        }
    }
    None
}
fn payload_mut(doc: &mut Value) -> Option<&mut Value> {
    let modules = match field_mut(doc, "modules")? {
        Value::Array(v) => v,
        _ => return None,
    };
    for module in modules {
        if field(module, "id") != Some(&strv("metadata")) {
            continue;
        }
        let elements = match field_mut(module, "elements")? {
            Value::Array(v) => v,
            _ => continue,
        };
        for element in elements {
            if field(element, "id") == Some(&strv("root")) {
                return field_mut(field_mut(element, "extensions")?, EXT);
            }
        }
    }
    None
}
fn validate(
    doc: &Value,
    r: &mut ArrowFlatbufferResources,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    let mut caps = Noop;
    let mut v = r
        .engine
        .validate_document(doc, &r.registry, &mut caps, ctx)?;
    v.complete = false;
    v.diagnostics.push(diag(
        "ARROW_FLATBUFFER_SEMANTICS",
        "",
        SEMANTICS,
        Severity::Warning,
    ));
    Ok(v)
}
fn validation_value(v: Validation) -> Value {
    object(vec![
        ("valid", Value::Bool(v.valid)),
        ("complete", Value::Bool(false)),
        (
            "diagnostics",
            Value::Array(
                v.diagnostics
                    .into_iter()
                    .map(|d| {
                        object(vec![
                            ("code", Value::String(d.code)),
                            ("path", Value::String(d.path)),
                            (
                                "severity",
                                strv(if d.severity == Severity::Error {
                                    "error"
                                } else {
                                    "warning"
                                }),
                            ),
                            ("message", Value::String(d.message)),
                        ])
                    })
                    .collect(),
            ),
        ),
    ])
}
pub fn inspect_arrow_flatbuffer_model(
    doc: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut r = ArrowFlatbufferResources::new(ctx)?;
    Ok(validation_value(validate(doc, &mut r, ctx)?))
}
pub fn import_arrow_flatbuffer_model(
    source: &Utf16,
    id: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let model = serialization::read_json_value(source.units(), Format::Json, ctx)?;
    let document = Value::Object(vec![
        (key("umf"), strv("0.10.0")),
        (key("id"), Value::String(id.clone())),
        (
            key("vocabularies"),
            object(vec![(EXT, object(vec![("version", strv("0.1.0"))]))]),
        ),
        (
            key("modules"),
            Value::Array(vec![object(vec![
                ("id", strv("metadata")),
                ("namespace", strv("")),
                (
                    "elements",
                    Value::Array(vec![object(vec![
                        ("id", strv("root")),
                        (
                            "extensions",
                            object(vec![(
                                EXT,
                                object(vec![("profile", strv(PROFILE)), ("model", model)]),
                            )]),
                        ),
                    ])]),
                ),
            ])]),
        ),
    ]);
    export_arrow_flatbuffer_model(&document, ctx)?;
    Ok(document)
}
fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) | Some(Value::Bool(false)) => false,
        Some(Value::Number(n)) => *n != 0.0,
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true,
    }
}

fn array_index(segment: &Utf16) -> Option<usize> {
    let text = segment.to_utf8().ok()?;
    if text.is_empty() || (text.len() > 1 && text.starts_with('0')) {
        return None;
    }
    let index = text.parse::<usize>().ok()?;
    (index.to_string() == text).then_some(index)
}
pub fn export_arrow_flatbuffer_model(
    doc: &Value,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let mut r = ArrowFlatbufferResources::new(ctx)?;
    let check = validate(doc, &mut r, ctx)?;
    if !check.valid {
        return Err(error(
            "ARROW_FLATBUFFER_MODEL",
            "Invalid logical FlatBuffer model",
        ));
    }
    let p = payload(doc).ok_or_else(|| {
        error(
            "ARROW_FLATBUFFER_MODEL",
            "Expected pinned logical FlatBuffer model",
        )
    })?;
    if field(field(doc, "vocabularies").unwrap_or(&Value::Null), EXT)
        .and_then(|v| field(v, "version"))
        != Some(&strv("0.1.0"))
    {
        return Err(error(
            "ARROW_FLATBUFFER_MODEL",
            "Expected pinned logical FlatBuffer model",
        ));
    }
    if truthy(field(p, "wireOmissions")) {
        return Err(error(
            "ARROW_FLATBUFFER_WIRE_LOSS",
            "Unknown wire fields remain in source; standalone model export cannot preserve them",
        ));
    }
    if let Value::Object(fields) = p {
        if fields
            .iter()
            .any(|(k, _)| k != &key("profile") && k != &key("model"))
        {
            return Err(error(
                "ARROW_FLATBUFFER_REPRESENTATION",
                "Unknown representation fields cannot be discarded",
            ));
        }
    }
    let model = field(p, "model").ok_or_else(|| {
        error(
            "ARROW_FLATBUFFER_MODEL",
            "Expected pinned logical FlatBuffer model",
        )
    })?;
    serialization::write_json_value(model, Format::Json, ctx)
}
pub fn propose_arrow_flatbuffer_edit(
    doc: &Value,
    path: &Utf16,
    replacement: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    // Match the public TypeScript operation: refuse to edit an invalid or
    // non-exportable representation, even when the requested replacement
    // might otherwise conceal the problem.
    export_arrow_flatbuffer_model(doc, ctx)?;
    let mut next = copy_json(doc, ctx)?;
    let p = payload_mut(&mut next)
        .ok_or_else(|| error("ARROW_FLATBUFFER_EDIT", "Expected existing metadata node"))?;
    let model = field_mut(p, "model")
        .ok_or_else(|| error("ARROW_FLATBUFFER_EDIT", "Expected existing metadata node"))?;
    let parts = native_pointer(path, ctx)?;
    let replacement = copy_json(replacement, ctx)?;
    if parts.is_empty() {
        *model = replacement;
    } else {
        let mut at = model;
        for segment in &parts[..parts.len() - 1] {
            at = match at {
                Value::Object(fields) => fields
                    .iter_mut()
                    .find(|(k, _)| k == segment)
                    .map(|(_, v)| v)
                    .ok_or_else(|| {
                        error("ARROW_FLATBUFFER_EDIT", "Expected existing metadata node")
                    })?,
                Value::Array(items) => {
                    let n = array_index(segment).ok_or_else(|| {
                        error("ARROW_FLATBUFFER_EDIT", "Expected existing metadata node")
                    })?;
                    items.get_mut(n).ok_or_else(|| {
                        error("ARROW_FLATBUFFER_EDIT", "Expected existing metadata node")
                    })?
                }
                _ => {
                    return Err(error(
                        "ARROW_FLATBUFFER_EDIT",
                        "Expected existing metadata node",
                    ))
                }
            };
        }
        let last = parts.last().expect("nonempty");
        match at {
            Value::Object(fields) => {
                let slot = fields
                    .iter_mut()
                    .find(|(k, _)| k == last)
                    .map(|(_, v)| v)
                    .ok_or_else(|| {
                        error("ARROW_FLATBUFFER_EDIT", "Expected existing metadata node")
                    })?;
                *slot = replacement;
            }
            Value::Array(items) => {
                let n = array_index(last).ok_or_else(|| {
                    error("ARROW_FLATBUFFER_EDIT", "Expected existing metadata node")
                })?;
                *items.get_mut(n).ok_or_else(|| {
                    error("ARROW_FLATBUFFER_EDIT", "Expected existing metadata node")
                })? = replacement;
            }
            _ => {
                return Err(error(
                    "ARROW_FLATBUFFER_EDIT",
                    "Expected existing metadata node",
                ))
            }
        }
    }
    export_arrow_flatbuffer_model(&next, ctx)?;
    let validation = inspect_arrow_flatbuffer_model(&next, ctx)?;
    Ok(object(vec![("document", next), ("validation", validation)]))
}

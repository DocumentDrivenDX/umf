// SPDX-License-Identifier: MIT OR Apache-2.0
//! Preservation and traversal primitives for the CONTRACT-002 Draft 2020-12
//! native JSON Schema payload. This module deliberately does not compile or
//! execute schemas; interpretation belongs to a later, independently qualified
//! adapter phase.

use std::collections::BTreeSet;

use crate::{
    context::Context,
    engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity},
    native_json::{NativeJsonNode, NativeJsonTree},
    registry::Registry,
    serialization::{self, Format},
    value::{Utf16, Value, copy_json},
};

pub const DIALECT_2020_12: &str = "https://json-schema.org/draft/2020-12/schema";
const EXTENSION: &str = "umf.json-schema";

#[derive(Clone, Debug, PartialEq)]
pub struct JsonSchemaPayload {
    pub dialect: Utf16,
    pub base_uri: Utf16,
    pub root: NativeJsonTree,
    pub resources: Vec<(Utf16, NativeJsonTree)>,
    /// Unknown envelope properties are retained for copied inspection, but
    /// have no native JSON Schema representation and therefore block export.
    pub representation_extras: Vec<(Utf16, Value)>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SchemaPosition {
    pub pointer: Utf16,
    pub node: NativeJsonTree,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ExportBundle {
    pub root_json: Utf16,
    pub resources_json: Vec<(Utf16, Utf16)>,
    pub source: Value,
}

/// Validate the adapter envelope and admit each native tree under the caller's
/// cumulative Context before retaining it. URI checks are intentionally shape
/// checks; there is no resolver or network access in this slice.
pub fn admit_payload(
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<JsonSchemaPayload, EngineError> {
    let fields = object(value, "JSON_SCHEMA_PAYLOAD", "Payload must be an object")?;
    let mut representation_extras = Vec::new();
    ctx.charge_work(fields.len(), Utf16::default())?;
    for (key, value) in fields {
        let known = ["dialect", "baseUri", "root", "resources"]
            .iter()
            .any(|name| name.encode_utf16().eq(key.units().iter().copied()));
        if !known {
            ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
            representation_extras.push((key.clone(), copy_json(value, ctx)?));
        }
    }
    let dialect = string_metered(
        field(fields, "dialect")?,
        "JSON_SCHEMA_DIALECT",
        "dialect must be a string",
        ctx,
    )?;
    if dialect != Utf16::from(DIALECT_2020_12) {
        return Err(err(
            "JSON_SCHEMA_DIALECT",
            "Unsupported JSON Schema payload dialect",
        ));
    }
    let base_uri = string_metered(
        field(fields, "baseUri")?,
        "JSON_SCHEMA_URI",
        "baseUri must be a string",
        ctx,
    )?;
    parse_uri(&base_uri, ctx)?;
    let root = NativeJsonTree::from_tagged_value(field(fields, "root")?, ctx)?;
    if !matches!(
        root.root(),
        NativeJsonNode::Object(_) | NativeJsonNode::Boolean(_)
    ) {
        return Err(err(
            "JSON_SCHEMA_ROOT",
            "Root schema must be an object or boolean",
        ));
    }
    let mut resources = Vec::new();
    let resource_value = field(fields, "resources")?;
    let resource_fields = object(
        resource_value,
        "JSON_SCHEMA_RESOURCES",
        "resources must be an object",
    )?;
    ctx.charge_work(resource_fields.len(), Utf16::default())?;
    let mut retrieval_uris = BTreeSet::new();
    for (uri, tree) in resource_fields {
        ctx.charge_work(uri.len(), Utf16::default())?;
        ctx.charge_work(1, Utf16::default())?;
        parse_uri(uri, ctx)?;
        if !retrieval_uris.insert(uri.clone()) || uri == &base_uri {
            return Err(err(
                "JSON_SCHEMA_RESOURCE_COLLISION",
                "Duplicate retrieval URI",
            ));
        }
        let native = NativeJsonTree::from_tagged_value(tree, ctx)?;
        if !matches!(
            native.root(),
            NativeJsonNode::Object(_) | NativeJsonNode::Boolean(_)
        ) {
            return Err(err(
                "JSON_SCHEMA_RESOURCE",
                "Packaged resource must be an object or boolean schema",
            ));
        }
        resources.push((uri.clone(), native));
    }
    Ok(JsonSchemaPayload {
        dialect,
        base_uri,
        root,
        resources,
        representation_extras,
    })
}

/// Locate exactly one installed extension payload. This keeps document-level
/// representation validation separate from schema-native interpretation.
pub fn payload_from_document(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<JsonSchemaPayload, EngineError> {
    validate_complete_document(document, ctx)?;
    let document_fields = object(document, "INVALID_DOCUMENT", "Document must be an object")?;
    ctx.charge_work(document_fields.len(), Utf16::default())?;
    let core_version = string_metered(
        field(document_fields, "umf")?,
        "INVALID_DOCUMENT",
        "umf must be a string",
        ctx,
    )?;
    if core_version != Utf16::from("0.10.0") {
        return Err(err("INVALID_DOCUMENT", "Unsupported core document version"));
    }
    let vocabularies = object(
        field(document_fields, "vocabularies")?,
        "INVALID_DOCUMENT",
        "vocabularies must be an object",
    )?;
    ctx.charge_work(vocabularies.len(), Utf16::default())?;
    let declared = object(
        field(vocabularies, EXTENSION)?,
        "JSON_SCHEMA_VERSION",
        "JSON Schema vocabulary declaration must be an object",
    )?;
    ctx.charge_work(declared.len(), Utf16::default())?;
    let ext_version = string_metered(
        field(declared, "version")?,
        "JSON_SCHEMA_VERSION",
        "JSON Schema vocabulary version must be a string",
        ctx,
    )?;
    if ext_version != Utf16::from("0.1.0") {
        return Err(err(
            "JSON_SCHEMA_VERSION",
            "Unsupported native extension version",
        ));
    }
    let modules = field(document_fields, "modules")?;
    let Value::Array(modules) = modules else {
        return Err(err("INVALID_DOCUMENT", "modules must be an array"));
    };
    let mut found = None;
    for module in modules {
        ctx.charge_work(1, Utf16::default())?;
        let module_fields = object(module, "INVALID_DOCUMENT", "module must be an object")?;
        ctx.charge_work(module_fields.len(), Utf16::default())?;
        let module_id = string_metered(
            field(module_fields, "id")?,
            "INVALID_DOCUMENT",
            "module id must be a string",
            ctx,
        )?;
        if module_id != Utf16::from("schema") {
            continue;
        }
        let elements = field(module_fields, "elements")?;
        let Value::Array(elements) = elements else {
            return Err(err("INVALID_DOCUMENT", "elements must be an array"));
        };
        for element in elements {
            ctx.charge_work(1, Utf16::default())?;
            let element_fields = object(element, "INVALID_DOCUMENT", "element must be an object")?;
            ctx.charge_work(element_fields.len(), Utf16::default())?;
            let element_id = string_metered(
                field(element_fields, "id")?,
                "INVALID_DOCUMENT",
                "element id must be a string",
                ctx,
            )?;
            if element_id != Utf16::from("schema") {
                continue;
            }
            if let Ok(Value::Object(extensions)) = field(element_fields, "extensions") {
                ctx.charge_work(extensions.len(), Utf16::default())?;
                for (key, payload) in extensions {
                    ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
                    if key == &Utf16::from(EXTENSION) {
                        if found.is_some() {
                            return Err(err("INVALID_DOCUMENT", "Schema identity is ambiguous"));
                        }
                        found = Some(payload);
                    }
                }
            }
        }
    }
    admit_payload(
        found.ok_or_else(|| {
            err(
                "JSON_SCHEMA_PAYLOAD",
                "Schema identity has no umf.json-schema payload",
            )
        })?,
        ctx,
    )
}

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

fn validate_complete_document(document: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    fn resource(text: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        let utf16_units = text.encode_utf16().count();
        ctx.charge_text(utf16_units, Utf16::default())?;
        let source = text.encode_utf16().collect::<Vec<_>>();
        serialization::read_json_value(&source, Format::Json, ctx)
    }
    let engine = Engine::new(
        ResourceSet::new(
            resource(include_str!("../../../spec/core/schema.json"), ctx)?,
            resource(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            resource(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            resource(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            resource(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                ctx,
            )?,
        ),
        ctx,
    )?;
    let validation = engine.validate_document(
        document,
        &Registry::new(),
        &mut NoExtensionCapabilities,
        ctx,
    )?;
    if validation.valid {
        return Ok(());
    }
    let first = validation.diagnostics.first();
    Err(EngineError::new(
        "INVALID_DOCUMENT",
        first.map(|d| d.path.clone()).unwrap_or_default(),
        first
            .map(|d| d.message.clone())
            .unwrap_or_else(|| Utf16::from("Invalid UMF document")),
    ))
}

pub fn get_node(
    payload: &JsonSchemaPayload,
    pointer: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<NativeJsonTree, EngineError> {
    payload.root.subtree_clone(pointer, ctx)
}

/// Return only Draft 2020-12 schema positions. Annotation/value-bearing
/// keywords and all unknown keywords are opaque and are never descended into.
pub fn walk(
    payload: &JsonSchemaPayload,
    ctx: &mut Context<'_>,
) -> Result<Vec<SchemaPosition>, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    let mut out = Vec::new();
    let mut stack = vec![(Utf16::default(), payload.root.root())];
    while let Some((pointer, node)) = stack.pop() {
        ctx.charge_work(1, Utf16::default())?;
        ctx.charge_work(pointer.len(), Utf16::default())?;
        let copied = payload.root.subtree_clone(&pointer, ctx)?;
        out.push(SchemaPosition {
            pointer: pointer.clone(),
            node: copied,
        });
        let NativeJsonNode::Object(members) = node else {
            continue;
        };
        let mut children: Vec<(Utf16, &NativeJsonNode)> = Vec::new();
        for (key, value) in members {
            ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
            match key.to_utf8().ok().as_deref() {
                Some("$defs")
                | Some("definitions")
                | Some("properties")
                | Some("patternProperties")
                | Some("dependentSchemas") => {
                    if let NativeJsonNode::Object(map) = value {
                        ctx.charge_work(map.len(), Utf16::default())?;
                        for (child_key, child) in map {
                            let keyword_path = pointer_child(&pointer, key, ctx)?;
                            let child_path = pointer_child(&keyword_path, child_key, ctx)?;
                            ctx.charge_work(1, Utf16::default())?;
                            children.push((child_path, child));
                        }
                    }
                }
                Some("allOf") | Some("anyOf") | Some("oneOf") | Some("prefixItems") => {
                    if let NativeJsonNode::Array(items) = value {
                        ctx.charge_work(items.len(), Utf16::default())?;
                        let keyword_path = pointer_child(&pointer, key, ctx)?;
                        for (i, child) in items.iter().enumerate() {
                            let index = Utf16::from(i.to_string());
                            let child_path = pointer_child(&keyword_path, &index, ctx)?;
                            ctx.charge_work(1, Utf16::default())?;
                            children.push((child_path, child));
                        }
                    }
                }
                Some("items")
                | Some("contains")
                | Some("not")
                | Some("if")
                | Some("then")
                | Some("else")
                | Some("additionalProperties")
                | Some("unevaluatedProperties")
                | Some("propertyNames")
                | Some("contentSchema")
                | Some("unevaluatedItems") => {
                    let child_path = pointer_child(&pointer, key, ctx)?;
                    ctx.charge_work(1, Utf16::default())?;
                    children.push((child_path, value));
                }
                _ => {}
            }
        }
        ctx.charge_work(children.len(), Utf16::default())?;
        for item in children.into_iter().rev() {
            stack.push(item);
        }
    }
    Ok(out)
}

pub fn export_root(
    payload: &JsonSchemaPayload,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    ensure_exportable(payload, ctx)?;
    let compact = payload.root.render_compact(ctx)?;
    let total = compact.len().saturating_add(1);
    if total > ctx.limits().max_text_units {
        return Err(err("LIMIT", "Serialized text limit exceeded"));
    }
    ctx.charge_work(1, Utf16::default())?;
    let mut units = compact.into_units();
    units.push(b'\n' as u16);
    Ok(Utf16::new(units))
}

pub fn export_resources(
    payload: &JsonSchemaPayload,
    ctx: &mut Context<'_>,
) -> Result<Vec<(Utf16, Utf16)>, EngineError> {
    ctx.charge_work(payload.resources.len().max(1), Utf16::default())?;
    ensure_exportable(payload, ctx)?;
    let mut result = Vec::with_capacity(payload.resources.len());
    for (uri, tree) in &payload.resources {
        ctx.charge_work(uri.len().saturating_add(1), Utf16::default())?;
        let rendered = tree.render_compact(ctx)?;
        let total = rendered.len().saturating_add(1);
        if total > ctx.limits().max_text_units {
            return Err(err("LIMIT", "Serialized text limit exceeded"));
        }
        ctx.charge_work(1, Utf16::default())?;
        let mut units = rendered.into_units();
        units.push(b'\n' as u16);
        result.push((uri.clone(), Utf16::new(units)));
    }
    Ok(result)
}

pub fn export_bundle(
    document: &Value,
    payload: &JsonSchemaPayload,
    ctx: &mut Context<'_>,
) -> Result<ExportBundle, EngineError> {
    ensure_exportable(payload, ctx)?;
    Ok(ExportBundle {
        root_json: export_root(payload, ctx)?,
        resources_json: export_resources(payload, ctx)?,
        source: copy_json(document, ctx)?,
    })
}

/// Replace one native JSON Schema node inside the existing `edit_extension`
/// transaction. The complete document is validated before and after the edit;
/// the caller's document and registry are never modified.
pub fn edit_node(
    document: &Value,
    pointer: &Utf16,
    replacement_source: &[u16],
    registry: &Registry,
    engine: &Engine,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let segments = crate::native_json::native_pointer(pointer, ctx)?;
    let replacement = NativeJsonTree::parse_json(replacement_source, ctx)?;
    if segments.is_empty()
        && !matches!(
            replacement.root(),
            NativeJsonNode::Object(_) | NativeJsonNode::Boolean(_)
        )
    {
        return Err(err(
            "JSON_SCHEMA_ROOT",
            "Root schema must be an object or boolean",
        ));
    }
    let tagged = replacement.render_tagged(ctx)?;
    let replacement_value = serialization::read_json_value(tagged.units(), Format::Json, ctx)?;
    let mut checked_capabilities = EditPreflightCapabilities {
        inner: capabilities,
    };
    crate::edit_extension::edit_extension(
        document,
        registry,
        &Utf16::from("schema"),
        &Utf16::from("schema"),
        &Utf16::from(EXTENSION),
        engine,
        &mut checked_capabilities,
        ctx,
        move |mut payload| {
            let fields = match &mut payload {
                Value::Object(v) => v,
                _ => return Err(err("JSON_SCHEMA_PAYLOAD", "Payload must be an object")),
            };
            let root = fields
                .iter_mut()
                .find(|(k, _)| k == &Utf16::from("root"))
                .map(|(_, v)| v)
                .ok_or_else(|| err("JSON_SCHEMA_PAYLOAD", "Payload root is missing"))?;
            replace_tagged_node(root, &segments, 0, replacement_value).map_err(|_| {
                err(
                    "JSON_SCHEMA_POINTER",
                    "Native JSON Pointer target does not exist",
                )
            })?;
            Ok(payload)
        },
    )
}

struct EditPreflightCapabilities<'a> {
    inner: &'a mut dyn Capabilities,
}

impl Capabilities for EditPreflightCapabilities<'_> {
    fn python_source_document(&self) -> Option<&crate::python_value::PythonConsumerValue> {
        self.inner.python_source_document()
    }

    fn validate_extension(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        self.inner.validate_extension(token, payload, context)
    }

    fn validate_extension_with_context(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        if is_json_schema_context(context) {
            let admitted = match admit_payload(payload, ctx) {
                Ok(value) => value,
                Err(error) => return candidate_preflight_error(error, context),
            };
            let diagnostics = match crate::json_schema_inspect::inspect_payload_for_edit(
                &admitted,
                &context.path,
                ctx,
            ) {
                Ok(value) => value,
                Err(error) => return candidate_preflight_error(error, context),
            };
            if !diagnostics.is_empty() {
                return Ok(diagnostics);
            }
        }
        self.inner
            .validate_extension_with_context(token, payload, context, ctx)
    }
}

fn is_json_schema_context(context: &SemanticContext) -> bool {
    context
        .path
        .units()
        .ends_with(Utf16::from("/extensions/umf.json-schema").units())
}

fn candidate_preflight_error(
    error: EngineError,
    context: &SemanticContext,
) -> Result<Vec<Diagnostic>, CapabilityError> {
    if error.is_control_failure() || error.code == "LIMIT" || error.code == "CANCELLED" {
        return Err(CapabilityError::Engine(error));
    }
    Ok(vec![Diagnostic {
        code: Utf16::from("JSON_SCHEMA_META"),
        path: context.path.clone(),
        message: error.message,
        severity: Severity::Error,
        python_source_path: false,
        python_text_origin: None,
    }])
}

fn replace_tagged_node(
    node: &mut Value,
    segments: &[Utf16],
    depth: usize,
    replacement: Value,
) -> Result<(), ()> {
    if depth == segments.len() {
        *node = replacement;
        return Ok(());
    }
    let segment = &segments[depth];
    let kind = match node {
        Value::Object(fields) => fields
            .iter()
            .find(|(k, _)| k == &Utf16::from("kind"))
            .map(|(_, v)| v),
        _ => None,
    };
    match kind {
        Some(Value::String(kind)) if kind == &Utf16::from("object") => {
            let members = match node {
                Value::Object(fields) => fields
                    .iter_mut()
                    .find(|(k, _)| k == &Utf16::from("members"))
                    .map(|(_, v)| v),
                _ => None,
            };
            let Value::Object(members) = members.ok_or(())? else {
                return Err(());
            };
            let child = members
                .iter_mut()
                .find(|(key, _)| key == segment)
                .map(|(_, value)| value)
                .ok_or(())?;
            replace_tagged_node(child, segments, depth + 1, replacement)
        }
        Some(Value::String(kind)) if kind == &Utf16::from("array") => {
            let index_text = segment.to_utf8().map_err(|_| ())?;
            if index_text.is_empty()
                || (index_text.len() > 1 && index_text.starts_with('0'))
                || !index_text.bytes().all(|b| b.is_ascii_digit())
            {
                return Err(());
            }
            let index = index_text.parse::<usize>().map_err(|_| ())?;
            let items = match node {
                Value::Object(fields) => fields
                    .iter_mut()
                    .find(|(k, _)| k == &Utf16::from("items"))
                    .map(|(_, v)| v),
                _ => None,
            };
            let Value::Array(items) = items.ok_or(())? else {
                return Err(());
            };
            replace_tagged_node(
                items.get_mut(index).ok_or(())?,
                segments,
                depth + 1,
                replacement,
            )
        }
        _ => Err(()),
    }
}

fn ensure_exportable(
    payload: &JsonSchemaPayload,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(payload.representation_extras.len(), Utf16::default())?;
    if !payload.representation_extras.is_empty() {
        return Err(err(
            "JSON_SCHEMA_EXPORT",
            "Unknown representation fields prevent native JSON Schema export",
        ));
    }
    if payload.root.has_representation_extras() {
        return Err(err(
            "JSON_SCHEMA_EXPORT",
            "Unknown representation fields prevent native JSON Schema export",
        ));
    }
    for (_, tree) in &payload.resources {
        ctx.charge_work(1, Utf16::default())?;
        if tree.has_representation_extras() {
            return Err(err(
                "JSON_SCHEMA_EXPORT",
                "Unknown representation fields prevent native JSON Schema export",
            ));
        }
    }
    Ok(())
}

fn object<'a>(
    value: &'a Value,
    code: &str,
    message: &str,
) -> Result<&'a [(Utf16, Value)], EngineError> {
    if let Value::Object(v) = value {
        Ok(v)
    } else {
        Err(err(code, message))
    }
}
fn field<'a>(fields: &'a [(Utf16, Value)], name: &str) -> Result<&'a Value, EngineError> {
    let expected = Utf16::from(name);
    fields
        .iter()
        .find(|(k, _)| k == &expected)
        .map(|(_, v)| v)
        .ok_or_else(|| err("JSON_SCHEMA_PAYLOAD", "Required payload field is missing"))
}
fn string_metered(
    value: &Value,
    code: &str,
    message: &str,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    if let Value::String(s) = value {
        ctx.charge_work(s.len(), Utf16::default())?;
        Ok(s.clone())
    } else {
        Err(err(code, message))
    }
}
fn parse_uri(uri: &Utf16, ctx: &mut Context<'_>) -> Result<url::Url, EngineError> {
    ctx.charge_text(uri.len(), Utf16::default())?;
    ctx.charge_work(uri.len().saturating_mul(12), Utf16::default())?;
    let text = uri.to_utf8().map_err(|_| {
        err(
            "JSON_SCHEMA_URI",
            "Retrieval URI must be absolute and fragment-free",
        )
    })?;
    let parsed = url::Url::parse(&text).map_err(|_| {
        err(
            "JSON_SCHEMA_URI",
            "Retrieval URI must be absolute and fragment-free",
        )
    })?;
    if parsed.fragment().is_some() || text.contains('#') {
        return Err(err(
            "JSON_SCHEMA_URI",
            "Retrieval URI must be absolute and fragment-free",
        ));
    }
    Ok(parsed)
}
fn pointer_child(
    parent: &Utf16,
    segment: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let escaped = segment.units().iter().fold(0usize, |n, unit| {
        n.saturating_add(if *unit == b'~' as u16 || *unit == b'/' as u16 {
            2
        } else {
            1
        })
    });
    let size = parent.len().saturating_add(1).saturating_add(escaped);
    ctx.charge_text(size, Utf16::default())?;
    let mut units = Vec::with_capacity(size);
    units.extend_from_slice(parent.units());
    units.push(b'/' as u16);
    for unit in segment.units() {
        if *unit == b'~' as u16 {
            units.extend_from_slice(&[b'~' as u16, b'0' as u16]);
        } else if *unit == b'/' as u16 {
            units.extend_from_slice(&[b'~' as u16, b'1' as u16]);
        } else {
            units.push(*unit);
        }
    }
    Ok(Utf16::new(units))
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

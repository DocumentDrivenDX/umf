// SPDX-License-Identifier: MIT OR Apache-2.0
//! Preservation and traversal primitives for the CONTRACT-002 Draft 2020-12
//! native JSON Schema payload. This module deliberately does not compile or
//! execute schemas; interpretation belongs to a later, independently qualified
//! adapter phase.

use std::collections::BTreeSet;

use crate::{
    context::Context,
    engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    native_json::{NativeJsonNode, NativeJsonTree},
    registry::Registry,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
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
    pub diagnostics: Vec<Diagnostic>,
}

const CORE_VERSION: &str = "0.10.0";
const EXTENSION_VERSION: &str = "0.1.0";

/// Immutable pinned core and extension validators for a prepared JSON Schema
/// binding. Resource parsing, Engine construction, and extension registration
/// happen once at factory setup; invocation methods use the caller's fresh
/// Context for only the current request and validation work.
pub struct JsonSchemaRuntime {
    engine: Engine,
    plain_registry: Registry,
    inspection_registry: Registry,
}

impl JsonSchemaRuntime {
    /// Admit the fixed repository schemas and JSON Schema extension manifest
    /// under the factory's setup Context. Bindings may attach a dedicated
    /// resource-setup control bridge to that Context; operation controls are
    /// intentionally separate.
    pub fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        let engine = Engine::new(
            ResourceSet::new(
                embedded_resource(include_str!("../../../spec/core/schema.json"), ctx)?,
                embedded_resource(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
                embedded_resource(
                    include_str!("../../../spec/core/extension-package.schema.json"),
                    ctx,
                )?,
                embedded_resource(
                    include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                    ctx,
                )?,
                embedded_resource(
                    include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                    ctx,
                )?,
            ),
            ctx,
        )?;

        let manifest = embedded_resource(
            include_str!("../../../spec/extensions/json-schema/package.json"),
            ctx,
        )?;
        let schema_resources = engine.schema_resources_with_context(ctx)?;
        let mut inspection_registry = Registry::new();
        inspection_registry.register(
            &manifest,
            Some(1),
            engine.package_schema(),
            &schema_resources,
            ctx,
        )?;

        Ok(Self {
            engine,
            plain_registry: Registry::new(),
            inspection_registry,
        })
    }

    /// Validate a complete document with the same extension capability mode
    /// selected by the TypeScript predecessor's inspection path.
    pub fn validate_document(
        &self,
        document: &Value,
        inspect_extensions: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Validation, EngineError> {
        let registry = if inspect_extensions {
            &self.inspection_registry
        } else {
            &self.plain_registry
        };
        let mut inspect_capabilities = JsonSchemaInspectionCapabilities;
        let mut plain_capabilities = NoExtensionCapabilities;
        let capabilities: &mut dyn Capabilities = if inspect_extensions {
            &mut inspect_capabilities
        } else {
            &mut plain_capabilities
        };
        self.engine
            .validate_document(document, registry, capabilities, ctx)
    }

    pub fn inspect_document(
        &self,
        document: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Validation, EngineError> {
        self.validate_document(document, true, ctx)
    }

    /// Edit after pointer and replacement admission has happened in this
    /// operation Context. The retained registry and Engine are read-only.
    pub fn edit_node(
        &self,
        document: &Value,
        pointer: &Utf16,
        replacement_source: &[u16],
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let segments = crate::native_json::native_pointer(pointer, ctx)?;
        let replacement = NativeJsonTree::parse_json(replacement_source, ctx)?;
        let mut capabilities = JsonSchemaInspectionCapabilities;
        edit_node_parsed(
            document,
            segments,
            replacement,
            &self.inspection_registry,
            &self.engine,
            &mut capabilities,
            ctx,
        )
    }
}

fn embedded_resource(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let utf16_units = source.encode_utf16().count();
    ctx.charge_text(utf16_units, Utf16::default())?;
    let source = source.encode_utf16().collect::<Vec<_>>();
    serialization::read_json_value(&source, Format::Json, ctx)
}

/// Import explicit JSON Schema source and resources into one UMF document.
/// Resource inputs are ordered and caller-owned; this operation performs no I/O.
/// Admission order follows the TypeScript predecessor: base URI, each resource
/// URI and source in order, root source, complete document, then interpretation.
pub fn import_json_schema(
    source: &[u16],
    id: &Utf16,
    base_uri: &Utf16,
    resource_sources: &[(Utf16, Vec<u16>)],
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    import_json_schema_inner(source, id, base_uri, resource_sources, None, ctx)
}

/// Prepared-runtime form of [`import_json_schema`]. The runtime owns the
/// pinned validator resources admitted during factory setup.
pub fn import_json_schema_with_runtime(
    source: &[u16],
    id: &Utf16,
    base_uri: &Utf16,
    resource_sources: &[(Utf16, Vec<u16>)],
    runtime: &JsonSchemaRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    import_json_schema_inner(source, id, base_uri, resource_sources, Some(runtime), ctx)
}

fn import_json_schema_inner(
    source: &[u16],
    id: &Utf16,
    base_uri: &Utf16,
    resource_sources: &[(Utf16, Vec<u16>)],
    runtime: Option<&JsonSchemaRuntime>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    parse_uri(base_uri, ctx)?;
    ctx.charge_work(resource_sources.len(), Utf16::default())?;
    let mut resources = Vec::with_capacity(resource_sources.len());
    let mut seen = BTreeSet::new();
    for (uri, source) in resource_sources {
        parse_uri(uri, ctx)?;
        ctx.charge_work(uri.len().saturating_add(1), Utf16::default())?;
        if !seen.insert(uri.clone()) {
            return Err(err(
                "JSON_SCHEMA_RESOURCE_COLLISION",
                "Duplicate retrieval URI",
            ));
        }
        resources.push((uri.clone(), NativeJsonTree::parse_json(source, ctx)?));
    }
    let root = NativeJsonTree::parse_json(source, ctx)?;
    let payload = JsonSchemaPayload {
        dialect: Utf16::from(DIALECT_2020_12),
        base_uri: base_uri.clone(),
        root,
        resources,
        representation_extras: Vec::new(),
    };
    let document = make_document(id, base_uri, &payload, ctx)?;
    let validation = match match runtime {
        Some(runtime) => runtime.inspect_document(&document, ctx),
        None => crate::json_schema_inspect::inspect_document(&document, ctx),
    } {
        Ok(validation) => validation,
        Err(error)
            if !error.is_control_failure()
                && error.code != "LIMIT"
                && error.code != "CANCELLED"
                && matches!(
                    error.code.as_str(),
                    "JSON_SCHEMA_ROOT" | "JSON_SCHEMA_RESOURCE" | "JSON_SCHEMA_RESOURCE_COLLISION"
                ) =>
        {
            let (code, message) = semantic_admission_diagnostic(&error, &payload, ctx)?;
            Validation {
                valid: false,
                complete: false,
                diagnostics: vec![Diagnostic {
                    code: Utf16::from(code),
                    path: Utf16::from("/modules/0/elements/0/extensions/umf.json-schema"),
                    message: Utf16::from(message),
                    severity: Severity::Error,
                    python_source_path: false,
                    python_text_origin: None,
                }],
            }
        }
        Err(error) => return Err(error),
    };
    if !validation.valid {
        return Err(validation_error("JSON_SCHEMA_INVALID", &validation, ctx)?);
    }
    Ok(document)
}

/// Inspect a complete UMF document carrying the pinned JSON Schema extension.
pub fn inspect_json_schema(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    crate::json_schema_inspect::inspect_document(document, ctx)
}

pub fn inspect_json_schema_with_runtime(
    document: &Value,
    runtime: &JsonSchemaRuntime,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    runtime.inspect_document(document, ctx)
}

/// Export the native root schema, preserving exact number lexemes.
pub fn export_json_schema(document: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let payload = exportable_payload(document, None, ctx)?;
    export_root(&payload, ctx)
}

pub fn export_json_schema_with_runtime(
    document: &Value,
    runtime: &JsonSchemaRuntime,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let payload = exportable_payload(document, Some(runtime), ctx)?;
    export_root(&payload, ctx)
}

/// Export packaged resources in their authored order.
pub fn export_json_schema_resources(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<(Utf16, Utf16)>, EngineError> {
    let payload = exportable_payload(document, None, ctx)?;
    export_resources(&payload, ctx)
}

pub fn export_json_schema_resources_with_runtime(
    document: &Value,
    runtime: &JsonSchemaRuntime,
    ctx: &mut Context<'_>,
) -> Result<Vec<(Utf16, Utf16)>, EngineError> {
    let payload = exportable_payload(document, Some(runtime), ctx)?;
    export_resources(&payload, ctx)
}

/// Return a copied native node at a strict RFC 6901 pointer.
pub fn get_json_schema_node(
    document: &Value,
    pointer: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<NativeJsonTree, EngineError> {
    let payload = payload_from_document(document, ctx)?;
    get_node(&payload, pointer, ctx)
}

pub fn get_json_schema_node_with_runtime(
    document: &Value,
    pointer: &Utf16,
    runtime: &JsonSchemaRuntime,
    ctx: &mut Context<'_>,
) -> Result<NativeJsonTree, EngineError> {
    let payload = payload_from_document_with_runtime(document, runtime, ctx)?;
    get_node(&payload, pointer, ctx)
}

/// Return copied Draft 2020-12 schema positions from the root resource.
pub fn walk_json_schema(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<SchemaPosition>, EngineError> {
    let payload = payload_from_document(document, ctx)?;
    walk(&payload, ctx)
}

pub fn walk_json_schema_with_runtime(
    document: &Value,
    runtime: &JsonSchemaRuntime,
    ctx: &mut Context<'_>,
) -> Result<Vec<SchemaPosition>, EngineError> {
    let payload = payload_from_document_with_runtime(document, runtime, ctx)?;
    walk(&payload, ctx)
}

/// Export the complete native bundle and retain the UMF source document.
pub fn export_json_schema_bundle(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<ExportBundle, EngineError> {
    export_json_schema_bundle_inner(document, None, ctx)
}

pub fn export_json_schema_bundle_with_runtime(
    document: &Value,
    runtime: &JsonSchemaRuntime,
    ctx: &mut Context<'_>,
) -> Result<ExportBundle, EngineError> {
    export_json_schema_bundle_inner(document, Some(runtime), ctx)
}

fn export_json_schema_bundle_inner(
    document: &Value,
    runtime: Option<&JsonSchemaRuntime>,
    ctx: &mut Context<'_>,
) -> Result<ExportBundle, EngineError> {
    let payload = exportable_payload(document, runtime, ctx)?;
    let resources_json = export_resources(&payload, ctx)?;
    let root_json = export_root(&payload, ctx)?;
    let source = copy_json(document, ctx)?;
    let validation = match runtime {
        Some(runtime) => inspect_json_schema_with_runtime(document, runtime, ctx)?,
        None => inspect_json_schema(document, ctx)?,
    };
    let mut diagnostics = validation.diagnostics;
    ctx.charge_work(diagnostics.len().saturating_add(1), Utf16::default())?;
    diagnostics.push(Diagnostic {
        code: Utf16::from("SOURCE_ARTIFACT_REQUIRED"),
        path: Utf16::default(),
        message: Utf16::from("Standalone native root does not carry UMF metadata or supplied resource files; retain this bundle for full source recovery."),
        severity: Severity::Warning,
        python_source_path: false,
        python_text_origin: None,
    });
    Ok(ExportBundle {
        root_json,
        resources_json,
        source,
        diagnostics,
    })
}

/// Validate the adapter envelope and admit each native tree under the caller's
/// cumulative Context before retaining it. URI checks are intentionally shape
/// checks; there is no resolver or network access in this slice.
pub fn admit_payload(
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<JsonSchemaPayload, EngineError> {
    admit_payload_inner(value, ctx, false)
}

pub(crate) fn admit_payload_for_inspection(
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<JsonSchemaPayload, EngineError> {
    admit_payload_inner(value, ctx, true)
}

fn admit_payload_inner(
    value: &Value,
    ctx: &mut Context<'_>,
    retain_invalid_schema_roots: bool,
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
    if !retain_invalid_schema_roots
        && !matches!(
            root.root(),
            NativeJsonNode::Object(_) | NativeJsonNode::Boolean(_)
        )
    {
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
        if (!retrieval_uris.insert(uri.clone()) || uri == &base_uri) && !retain_invalid_schema_roots
        {
            return Err(err(
                "JSON_SCHEMA_RESOURCE_COLLISION",
                "Duplicate retrieval URI",
            ));
        }
        let native = NativeJsonTree::from_tagged_value(tree, ctx)?;
        if !retain_invalid_schema_roots
            && !matches!(
                native.root(),
                NativeJsonNode::Object(_) | NativeJsonNode::Boolean(_)
            )
        {
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
    payload_from_document_inner(document, None, ctx)
}

pub fn payload_from_document_with_runtime(
    document: &Value,
    runtime: &JsonSchemaRuntime,
    ctx: &mut Context<'_>,
) -> Result<JsonSchemaPayload, EngineError> {
    payload_from_document_inner(document, Some(runtime), ctx)
}

fn payload_from_document_inner(
    document: &Value,
    runtime: Option<&JsonSchemaRuntime>,
    ctx: &mut Context<'_>,
) -> Result<JsonSchemaPayload, EngineError> {
    let validation = match runtime {
        Some(runtime) => runtime.validate_document(document, false, ctx),
        None => validate_complete_document(document, ctx),
    }?;
    if !validation.valid {
        return Err(validation_error("INVALID_DOCUMENT", &validation, ctx)?);
    }
    payload_from_valid_document(document, ctx)
}

pub(crate) fn payload_from_valid_document(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<JsonSchemaPayload, EngineError> {
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
    admit_payload_for_inspection(
        found.ok_or_else(|| {
            err(
                "JSON_SCHEMA_PAYLOAD",
                "Schema identity has no umf.json-schema payload",
            )
        })?,
        ctx,
    )
}

struct JsonSchemaInspectionCapabilities;
impl Capabilities for JsonSchemaInspectionCapabilities {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }

    fn validate_extension_with_context(
        &mut self,
        _token: u64,
        payload: &Value,
        context: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, crate::engine::CapabilityError> {
        if !context
            .path
            .units()
            .ends_with(Utf16::from("/extensions/umf.json-schema").units())
        {
            return Ok(Vec::new());
        }
        let admitted = match admit_payload_for_inspection(payload, ctx) {
            Ok(payload) => payload,
            Err(error)
                if error.is_control_failure()
                    || error.code == "LIMIT"
                    || error.code == "CANCELLED" =>
            {
                return Err(crate::engine::CapabilityError::Engine(error));
            }
            Err(error) => return Ok(vec![inspection_error_diagnostic(error, &context.path)]),
        };
        match crate::json_schema_inspect::inspect_payload(&admitted, &context.path, ctx) {
            Ok(diagnostics) => Ok(diagnostics),
            Err(error)
                if error.is_control_failure()
                    || error.code == "LIMIT"
                    || error.code == "CANCELLED" =>
            {
                Err(crate::engine::CapabilityError::Engine(error))
            }
            Err(error) => Ok(vec![inspection_error_diagnostic(error, &context.path)]),
        }
    }
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

fn inspection_error_diagnostic(error: EngineError, path: &Utf16) -> Diagnostic {
    let code = match error.code.as_str() {
        "JSON_SCHEMA_URI" => "JSON_SCHEMA_URI",
        "JSON_SCHEMA_ROOT" => "JSON_SCHEMA_ROOT",
        "JSON_SCHEMA_RESOURCE_COLLISION" => "JSON_SCHEMA_RESOURCE_COLLISION",
        _ => "EXTENSION_STRUCTURE",
    };
    let message = if code == "JSON_SCHEMA_URI" {
        // `String(new UmfError(...))` in the TypeScript inspector includes the
        // error name; preserve that frozen diagnostic rendering here.
        Utf16::from("UmfError: Retrieval URI must be absolute and fragment-free")
    } else {
        error.message
    };
    Diagnostic {
        code: Utf16::from(code),
        path: path.clone(),
        message,
        severity: Severity::Error,
        python_source_path: false,
        python_text_origin: None,
    }
}

pub(crate) fn validate_complete_document(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    validate_complete_document_inner(document, ctx, false)
}

pub(crate) fn validate_complete_document_for_inspection(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    validate_complete_document_inner(document, ctx, true)
}

fn validate_complete_document_inner(
    document: &Value,
    ctx: &mut Context<'_>,
    inspect_extensions: bool,
) -> Result<Validation, EngineError> {
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
    let mut registry = Registry::new();
    if inspect_extensions {
        let manifest = resource(
            include_str!("../../../spec/extensions/json-schema/package.json"),
            ctx,
        )?;
        let schema_resources = engine.schema_resources_with_context(ctx)?;
        registry.register(
            &manifest,
            Some(1),
            engine.package_schema(),
            &schema_resources,
            ctx,
        )?;
    }
    let capabilities: &mut dyn Capabilities = if inspect_extensions {
        &mut JsonSchemaInspectionCapabilities
    } else {
        &mut NoExtensionCapabilities
    };
    engine.validate_document(document, &registry, capabilities, ctx)
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
    let diagnostics = crate::json_schema_inspect::inspect_payload(payload, &Utf16::default(), ctx)?;
    if diagnostics.iter().any(|item| {
        item.severity == Severity::Error || item.code == Utf16::from("JSON_SCHEMA_REPRESENTATION")
    }) {
        return Err(diagnostics_error("JSON_SCHEMA_EXPORT", &diagnostics, ctx)?);
    }
    let mut bundle_diagnostics = diagnostics;
    bundle_diagnostics.push(Diagnostic {
        code: Utf16::from("SOURCE_ARTIFACT_REQUIRED"),
        path: Utf16::default(),
        message: Utf16::from("Standalone native root does not carry UMF metadata or supplied resource files; retain this bundle for full source recovery."),
        severity: Severity::Warning,
        python_source_path: false,
        python_text_origin: None,
    });
    let resources_json = export_resources(payload, ctx)?;
    let root_json = export_root(payload, ctx)?;
    Ok(ExportBundle {
        root_json,
        resources_json,
        source: copy_json(document, ctx)?,
        diagnostics: bundle_diagnostics,
    })
}

fn exportable_payload(
    document: &Value,
    runtime: Option<&JsonSchemaRuntime>,
    ctx: &mut Context<'_>,
) -> Result<JsonSchemaPayload, EngineError> {
    let payload = match runtime {
        Some(runtime) => payload_from_document_with_runtime(document, runtime, ctx)?,
        None => payload_from_document(document, ctx)?,
    };
    let diagnostics =
        crate::json_schema_inspect::inspect_payload(&payload, &Utf16::default(), ctx)?;
    if diagnostics.iter().any(|item| {
        item.severity == Severity::Error || item.code == Utf16::from("JSON_SCHEMA_REPRESENTATION")
    }) {
        return Err(diagnostics_error("JSON_SCHEMA_EXPORT", &diagnostics, ctx)?);
    }
    Ok(payload)
}

fn make_document(
    id: &Utf16,
    base_uri: &Utf16,
    payload: &JsonSchemaPayload,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_work(payload.resources.len().saturating_add(3), Utf16::default())?;
    ctx.charge_work(id.len().saturating_add(base_uri.len()), Utf16::default())?;
    let mut resource_members = Vec::with_capacity(payload.resources.len());
    for (uri, tree) in &payload.resources {
        ctx.charge_work(uri.len().saturating_add(1), Utf16::default())?;
        resource_members.push((uri.clone(), tree.tagged_value_preserving_extras(ctx)?));
    }
    let payload_value = Value::Object(vec![
        (
            Utf16::from("dialect"),
            Value::String(payload.dialect.clone()),
        ),
        (
            Utf16::from("baseUri"),
            Value::String(payload.base_uri.clone()),
        ),
        (
            Utf16::from("root"),
            payload.root.tagged_value_preserving_extras(ctx)?,
        ),
        (Utf16::from("resources"), Value::Object(resource_members)),
    ]);
    let extension = Value::Object(vec![(Utf16::from(EXTENSION), payload_value)]);
    let element = Value::Object(vec![
        (Utf16::from("id"), Value::string_utf8("schema")),
        (Utf16::from("extensions"), extension),
    ]);
    let module = Value::Object(vec![
        (Utf16::from("id"), Value::string_utf8("schema")),
        (Utf16::from("namespace"), Value::String(base_uri.clone())),
        (Utf16::from("elements"), Value::Array(vec![element])),
    ]);
    let vocabularies = Value::Object(vec![(
        Utf16::from(EXTENSION),
        Value::Object(vec![(
            Utf16::from("version"),
            Value::string_utf8(EXTENSION_VERSION),
        )]),
    )]);
    copy_json(
        &Value::Object(vec![
            (Utf16::from("umf"), Value::string_utf8(CORE_VERSION)),
            (Utf16::from("id"), Value::String(id.clone())),
            (Utf16::from("vocabularies"), vocabularies),
            (Utf16::from("modules"), Value::Array(vec![module])),
        ]),
        ctx,
    )
}

fn validation_error(
    code: &str,
    validation: &Validation,
    ctx: &mut Context<'_>,
) -> Result<EngineError, EngineError> {
    Ok(diagnostics_error(code, &validation.diagnostics, ctx)?)
}

fn diagnostics_error(
    code: &str,
    diagnostics: &[Diagnostic],
    ctx: &mut Context<'_>,
) -> Result<EngineError, EngineError> {
    fn string_len(value: &Utf16) -> usize {
        let mut length = 2usize;
        let units = value.units();
        let mut index = 0;
        while index < units.len() {
            let unit = units[index];
            if (0xd800..=0xdbff).contains(&unit)
                && units
                    .get(index + 1)
                    .is_some_and(|next| (0xdc00..=0xdfff).contains(next))
            {
                length = length.saturating_add(2);
                index += 2;
                continue;
            }
            length = length.saturating_add(match unit {
                0x22 | 0x5c | 0x08 | 0x0c | 0x0a | 0x0d | 0x09 => 2,
                0x00..=0x1f | 0xd800..=0xdfff => 6,
                _ => 1,
            });
            index += 1;
        }
        length
    }
    fn write_string(value: &Utf16, output: &mut Vec<u16>) {
        output.push(b'"' as u16);
        let units = value.units();
        let mut index = 0;
        while index < units.len() {
            let unit = units[index];
            if (0xd800..=0xdbff).contains(&unit)
                && units
                    .get(index + 1)
                    .is_some_and(|next| (0xdc00..=0xdfff).contains(next))
            {
                output.extend([unit, units[index + 1]]);
                index += 2;
                continue;
            }
            match unit {
                0x22 => output.extend([b'\\' as u16, b'"' as u16]),
                0x5c => output.extend([b'\\' as u16, b'\\' as u16]),
                0x08 => output.extend([b'\\' as u16, b'b' as u16]),
                0x0c => output.extend([b'\\' as u16, b'f' as u16]),
                0x0a => output.extend([b'\\' as u16, b'n' as u16]),
                0x0d => output.extend([b'\\' as u16, b'r' as u16]),
                0x09 => output.extend([b'\\' as u16, b't' as u16]),
                0x00..=0x1f => {
                    const HEX: &[u8; 16] = b"0123456789abcdef";
                    output.extend([
                        b'\\' as u16,
                        b'u' as u16,
                        b'0' as u16,
                        b'0' as u16,
                        HEX[((unit >> 4) & 0xf) as usize] as u16,
                        HEX[(unit & 0xf) as usize] as u16,
                    ]);
                }
                0xd800..=0xdfff => {
                    const HEX: &[u8; 16] = b"0123456789abcdef";
                    output.extend([
                        b'\\' as u16,
                        b'u' as u16,
                        HEX[((unit >> 12) & 0xf) as usize] as u16,
                        HEX[((unit >> 8) & 0xf) as usize] as u16,
                        HEX[((unit >> 4) & 0xf) as usize] as u16,
                        HEX[(unit & 0xf) as usize] as u16,
                    ]);
                }
                other => output.push(other),
            }
            index += 1;
        }
        output.push(b'"' as u16);
    }

    ctx.charge_work(diagnostics.len().saturating_add(1), Utf16::default())?;
    let keys = [
        Utf16::from("code"),
        Utf16::from("path"),
        Utf16::from("message"),
        Utf16::from("severity"),
    ];
    let mut length = 2usize;
    for (index, item) in diagnostics.iter().enumerate() {
        let severity = Utf16::from(match item.severity {
            Severity::Error => "error",
            Severity::Warning => "warning",
        });
        let fields = [
            (&keys[0], &item.code),
            (&keys[1], &item.path),
            (&keys[2], &item.message),
            (&keys[3], &severity),
        ];
        length = length
            .saturating_add(if index == 0 { 0 } else { 1 })
            .saturating_add(2);
        for (field_index, (key, value)) in fields.iter().enumerate() {
            ctx.charge_work(
                key.len().saturating_add(value.len()).saturating_add(1),
                item.path.clone(),
            )?;
            length = length
                .saturating_add(if field_index == 0 { 0 } else { 1 })
                .saturating_add(string_len(key))
                .saturating_add(1)
                .saturating_add(string_len(value));
        }
    }
    if length > ctx.limits().max_text_units {
        return Err(err("LIMIT", "Serialized text limit exceeded"));
    }
    ctx.charge_text(length, Utf16::default())?;
    let mut output = Vec::with_capacity(length);
    output.push(b'[' as u16);
    for (index, item) in diagnostics.iter().enumerate() {
        if index != 0 {
            output.push(b',' as u16);
        }
        output.push(b'{' as u16);
        let severity = Utf16::from(match item.severity {
            Severity::Error => "error",
            Severity::Warning => "warning",
        });
        let values = [
            (&keys[0], &item.code),
            (&keys[1], &item.path),
            (&keys[2], &item.message),
            (&keys[3], &severity),
        ];
        for (field_index, (key, value)) in values.iter().enumerate() {
            if field_index != 0 {
                output.push(b',' as u16);
            }
            write_string(key, &mut output);
            output.push(b':' as u16);
            write_string(value, &mut output);
        }
        output.push(b'}' as u16);
    }
    output.push(b']' as u16);
    Ok(EngineError::new(code, Utf16::default(), Utf16::new(output)))
}

fn semantic_admission_diagnostic(
    error: &EngineError,
    payload: &JsonSchemaPayload,
    ctx: &mut Context<'_>,
) -> Result<(&'static str, String), EngineError> {
    match error.code.as_str() {
        "JSON_SCHEMA_ROOT" => Ok((
            "JSON_SCHEMA_ROOT",
            format!(
                "Resource {} must be object or boolean",
                display_uri(&payload.base_uri, ctx)?
            ),
        )),
        "JSON_SCHEMA_RESOURCE" => {
            let uri = payload
                .resources
                .iter()
                .find(|(_, tree)| {
                    !matches!(
                        tree.root(),
                        NativeJsonNode::Object(_) | NativeJsonNode::Boolean(_)
                    )
                })
                .map(|(uri, _)| uri)
                .unwrap_or(&payload.base_uri);
            Ok((
                "JSON_SCHEMA_ROOT",
                format!(
                    "Resource {} must be object or boolean",
                    display_uri(uri, ctx)?
                ),
            ))
        }
        _ => Ok((
            "JSON_SCHEMA_RESOURCE_COLLISION",
            "Root retrieval URI also appears in resources".to_owned(),
        )),
    }
}

fn display_uri(uri: &Utf16, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    ctx.charge_work(uri.len(), Utf16::default())?;
    Ok(uri
        .to_utf8()
        .unwrap_or_else(|_| format!("{:?}", uri.units())))
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
    edit_node_parsed(
        document,
        segments,
        replacement,
        registry,
        engine,
        capabilities,
        ctx,
    )
}

fn edit_node_parsed(
    document: &Value,
    segments: Vec<Utf16>,
    replacement: NativeJsonTree,
    registry: &Registry,
    engine: &Engine,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
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

/// Edit a node using the repository's pinned core and JSON Schema resources.
/// This is the opt-in binding entry point; it keeps the Registry and
/// capability implementation owned by the adapter instead of exposing a
/// host-created or caller-fabricated prepared edit.
pub fn edit_node_with_embedded_registry(
    document: &Value,
    pointer: &Utf16,
    replacement_source: &[u16],
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    fn resource(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        let units = source.encode_utf16().count();
        ctx.charge_text(units, Utf16::default())?;
        serialization::read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            ctx,
        )
    }

    // Preserve the public operation's pointer-then-replacement admission order
    // before constructing the pinned registry used for source validation.
    let segments = crate::native_json::native_pointer(pointer, ctx)?;
    let replacement = NativeJsonTree::parse_json(replacement_source, ctx)?;

    // These are fixed, trusted repository resources that TypeScript validates
    // from its module-level registry. Parse/build them in an isolated context
    // so a caller's data budget and host control cover only request/edit work.
    let mut resource_ctx = Context::ordinary();

    let engine = Engine::new(
        ResourceSet::new(
            resource(
                include_str!("../../../spec/core/schema.json"),
                &mut resource_ctx,
            )?,
            resource(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                &mut resource_ctx,
            )?,
            resource(
                include_str!("../../../spec/core/extension-package.schema.json"),
                &mut resource_ctx,
            )?,
            resource(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                &mut resource_ctx,
            )?,
            resource(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                &mut resource_ctx,
            )?,
        ),
        &mut resource_ctx,
    )?;
    let manifest = resource(
        include_str!("../../../spec/extensions/json-schema/package.json"),
        &mut resource_ctx,
    )?;
    let schema_resources = engine.schema_resources_with_context(&mut resource_ctx)?;
    let mut registry = Registry::new();
    registry.register(
        &manifest,
        Some(1),
        engine.package_schema(),
        &schema_resources,
        &mut resource_ctx,
    )?;
    let mut capabilities = JsonSchemaInspectionCapabilities;
    edit_node_parsed(
        document,
        segments,
        replacement,
        &registry,
        &engine,
        &mut capabilities,
        ctx,
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
            let admitted = match admit_payload_for_inspection(payload, ctx) {
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

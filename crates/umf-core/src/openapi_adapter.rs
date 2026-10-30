// SPDX-License-Identifier: MIT OR Apache-2.0
//! OpenAPI native-tree operations for CONTRACT-011.
//!
//! It uses the shared core JSON/YAML
//! reader, Engine, Registry and schema evaluator. Official object schemas are
//! embedded from the pinned upstream resources in `spec/extensions/openapi`.

use crate::{
    context::Context,
    engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    native_json::{NativeJsonNode, NativeJsonTree},
    registry::Registry,
    serialization::{self, Format},
    schema::SchemaResources,
    value::{copy_json, Utf16, Value},
};
use std::collections::BTreeSet;
use url::Url;

const EXTENSION: &str = "umf.openapi";
const EXTENSION_VERSION: &str = "0.1.0";
const CORE_VERSION: &str = "0.10.0";
const PROFILE: &str = "openapi-json-yaml-0.1";
const OPENAPI_TOKEN: u64 = 0x4f50_454e_4150_4901;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OpenapiFormat {
    Json,
    Yaml,
}

impl OpenapiFormat {
    fn as_str(self) -> &'static str {
        match self {
            Self::Json => "json",
            Self::Yaml => "yaml",
        }
    }

    fn parse(self, source: &Utf16, ctx: &mut Context<'_>) -> Result<NativeJsonTree, EngineError> {
        match self {
            Self::Json => NativeJsonTree::parse_json(source.units(), ctx),
            Self::Yaml => NativeJsonTree::parse_yaml(source.units(), ctx),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct OpenapiResourceInput {
    pub uri: Utf16,
    pub source: Utf16,
    pub format: OpenapiFormat,
}

#[derive(Clone, Debug, PartialEq)]
pub struct OpenapiResource {
    pub uri: Utf16,
    pub root: NativeJsonTree,
    pub original_source: Utf16,
    pub original_format: OpenapiFormat,
    pub representation_extras: Vec<(Utf16, Value)>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct OpenapiPayload {
    pub root: NativeJsonTree,
    pub original_source: Utf16,
    pub original_format: OpenapiFormat,
    pub base_uri: Option<Utf16>,
    pub resources: Vec<OpenapiResource>,
    /// Extra payload fields survive UMF serialization but have no native
    /// OpenAPI destination and therefore block native export.
    pub representation_extras: Vec<(Utf16, Value)>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct OpenapiBundle {
    pub schema: Utf16,
    pub format: OpenapiFormat,
    pub base_uri: Option<Utf16>,
    pub resources: Vec<(Utf16, Utf16, OpenapiFormat)>,
    pub source: Value,
    pub diagnostics: Vec<Diagnostic>,
}

/// Prepared core engine plus the source extension's generated package schema.
/// The manifest and pinned official object schemas are admitted through the
/// same closed resource boundary used by the native schema evaluator.
pub struct OpenapiRuntime {
    engine: Engine,
    registry: Registry,
    package_schema: crate::schema::CompiledSchema,
    object_schemas: Vec<(String, crate::schema::CompiledSchema)>,
    meta_schemas: Vec<(String, crate::schema::CompiledSchema)>,
    reference_schemas: Vec<(String, String, crate::schema::CompiledSchema)>,
}

impl OpenapiRuntime {
    pub fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        fn read(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
            let units: Vec<u16> = source.encode_utf16().collect();
            ctx.charge_text(units.len(), Utf16::default())?;
            serialization::read_json_value(&units, Format::Json, ctx)
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
        let package = read(include_str!("../../../spec/extensions/openapi/package.json"), ctx)?;
        // Registry admission compiles every supplied resource strictly as a
        // core package schema. Keep its resource set limited to core resources;
        // the official OpenAPI schemas below use several JSON Schema dialects
        // and are compiled separately by the consumer entry points.
        let registry_schema_resources = engine.schema_resources_with_context(ctx)?;
        let mut draft4_resources = SchemaResources::default();
        let mut modern_resources = engine.schema_resources_with_context(ctx)?;
        // Add the exact upstream dialect/meta resources used by the TS
        // adapter. These are fixed artifacts and are never fetched at runtime.
        // OpenAPI 3.1/3.2 dialects inherit the JSON Schema Draft 2020-12
        // metaschema. Reuse the same pinned resource corpus as the native
        // JSON Schema adapter so every standard reference resolves within the
        // closed resource set.
        let standard_meta = read(include_str!("schema_metas.json"), ctx)?;
        if let Some(Value::Array(resources)) = field(&standard_meta, "resources") {
            for resource in resources {
                let Some(Value::String(id)) = field(resource, "id") else {
                    return Err(error("OPENAPI_META_RESOURCE", "Embedded meta-schema resource has no id"));
                };
                let id_text = id.to_utf8().map_err(|_| error("OPENAPI_META_RESOURCE", "Invalid embedded meta-schema id"))?;
                let Some(schema) = field(resource, "schema") else {
                    return Err(error("OPENAPI_META_RESOURCE", "Embedded meta-schema resource has no schema"));
                };
                let target = if id_text.starts_with("https://json-schema.org/draft/2020-12/") {
                    &mut modern_resources
                } else if id_text == "http://json-schema.org/draft-04/schema" {
                    &mut draft4_resources
                } else {
                    continue;
                };
                ctx.charge_work(id.len(), Utf16::default())?;
                let mut schema = copy_json(schema, ctx)?;
                if id_text == "http://json-schema.org/draft-04/schema" {
                    normalize_draft4_empty_fragment_id(&mut schema, ctx)?;
                }
                target.entries.push((id.clone(), schema));
            }
        } else {
            return Err(error("OPENAPI_META_RESOURCE", "Embedded JSON Schema meta-resource set is malformed"));
        }
        for (draft4, standalone, source) in [
            (true, false, include_str!("../../../spec/extensions/openapi/upstream/2.0-schema.json")),
            (true, false, include_str!("../../../spec/extensions/openapi/upstream/3.0-schema.json")),
            (false, true, include_str!("../../../spec/extensions/openapi/upstream/3.1-schema.json")),
            (false, true, include_str!("../../../spec/extensions/openapi/upstream/3.2-schema.json")),
            (false, false, include_str!("../../../spec/extensions/openapi/upstream/3.1-meta.json")),
            (false, false, include_str!("../../../spec/extensions/openapi/upstream/3.2-meta.json")),
            (false, false, include_str!("../../../spec/extensions/openapi/upstream/3.1-dialect.json")),
            (false, false, include_str!("../../../spec/extensions/openapi/upstream/3.2-dialect.json")),
        ] {
            let mut resource = read(source, ctx)?;
            if standalone { rewrite_standalone_dynamic_meta(&mut resource, ctx)?; }
            if draft4 { normalize_draft4_empty_fragment_id(&mut resource, ctx)?; }
            if let Some(Value::String(id)) = field(&resource, "$id").or_else(|| field(&resource, "id")) {
                ctx.charge_work(id.len(), Utf16::default())?;
                let target = if draft4 { &mut draft4_resources } else { &mut modern_resources };
                target.entries.push((id.clone(), copy_json(&resource, ctx)?));
            }
        }
        let mut registry = Registry::new();
        registry.register(
            &package,
            Some(OPENAPI_TOKEN),
            engine.package_schema(),
            &registry_schema_resources,
            ctx,
        )?;
        let schema = field(&package, "schema")
            .ok_or_else(|| error("OPENAPI_PACKAGE", "OpenAPI package has no schema"))?;
        let package_schema = crate::schema::CompiledSchema::compile_consumer(
            schema,
            &modern_resources,
            false,
            ctx,
        )?;
        let mut object_schemas = Vec::new();
        for (version, source) in [
            ("2.0", include_str!("../../../spec/extensions/openapi/upstream/2.0-schema.json")),
            ("3.0", include_str!("../../../spec/extensions/openapi/upstream/3.0-schema.json")),
            ("3.1", include_str!("../../../spec/extensions/openapi/upstream/3.1-schema.json")),
            ("3.2", include_str!("../../../spec/extensions/openapi/upstream/3.2-schema.json")),
        ] {
            let mut schema = read(source, ctx)?;
            if matches!(version, "2.0" | "3.0") {
                normalize_draft4_empty_fragment_id(&mut schema, ctx)?;
            }
            if matches!(version, "3.1" | "3.2") { rewrite_standalone_dynamic_meta(&mut schema, ctx)?; }
            let resources = if matches!(version, "2.0" | "3.0") {
                &draft4_resources
            } else {
                &modern_resources
            };
            let compiled = crate::schema::CompiledSchema::compile_consumer(&schema, resources, false, ctx)?;
            object_schemas.push((version.to_owned(), compiled));
        }
        let mut meta_schemas = Vec::new();
        for (version, source) in [
            ("3.1", include_str!("../../../spec/extensions/openapi/upstream/3.1-meta.json")),
            ("3.2", include_str!("../../../spec/extensions/openapi/upstream/3.2-meta.json")),
        ] {
            let schema = read(source, ctx)?;
            let compiled = crate::schema::CompiledSchema::compile_consumer(
                &schema, &modern_resources, false, ctx,
            )?;
            meta_schemas.push((version.to_owned(), compiled));
        }
        let mut reference_schemas = Vec::new();
        for version in ["3.1", "3.2"] {
            let schema_id = if version == "3.1" {
                "https://spec.openapis.org/oas/3.1/schema/2026-08-03"
            } else {
                "https://spec.openapis.org/oas/3.2/schema/2026-08-30"
            };
            for role in ["parameter", "header", "response", "request-body", "example", "link", "security-scheme", "reference"] {
                let reference = format!("{schema_id}#/$defs/{role}");
                let schema = Value::Object(vec![(key("$ref"), Value::String(Utf16::from(reference)))]);
                let compiled = crate::schema::CompiledSchema::compile_consumer(
                    &schema, &modern_resources, false, ctx,
                )?;
                reference_schemas.push((version.to_owned(), role.to_owned(), compiled));
            }
        }
        Ok(Self {
            engine,
            registry,
            package_schema,
            object_schemas,
            meta_schemas,
            reference_schemas,
        })
    }

    pub fn inspect_document(
        &self,
        document: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Validation, EngineError> {
        self.engine.validate_document(
            document,
            &self.registry,
            &mut OpenapiCapabilities {
                package_schema: &self.package_schema,
                object_schemas: &self.object_schemas,
                meta_schemas: &self.meta_schemas,
            },
            ctx,
        )
    }

    pub fn package_schema(&self) -> &crate::schema::CompiledSchema {
        &self.package_schema
    }
}

struct OpenapiCapabilities<'a> {
    package_schema: &'a crate::schema::CompiledSchema,
    object_schemas: &'a [(String, crate::schema::CompiledSchema)],
    meta_schemas: &'a [(String, crate::schema::CompiledSchema)],
}

impl Capabilities for OpenapiCapabilities<'_> {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Err(Utf16::from(
            "OpenAPI inspection requires the invocation Context",
        ))
    }

    fn validate_extension_with_context(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        if token != OPENAPI_TOKEN {
            return Err(CapabilityError::Host(Utf16::from(
                "Unknown OpenAPI semantic capability token",
            )));
        }
        self.package_schema
            .validate(payload, ctx)
            .map_err(CapabilityError::Engine)?;
        let diagnostics = inspect_payload(payload, self.object_schemas, self.meta_schemas, ctx)
            .map_err(CapabilityError::Engine)?;
        ctx.charge_work(context.path.len(), context.path.clone())
            .map_err(CapabilityError::Engine)?;
        Ok(diagnostics)
    }
}

pub fn import_openapi_document(
    source: &Utf16,
    id: &Utf16,
    format: OpenapiFormat,
    base_uri: Option<&Utf16>,
    resources: &[OpenapiResourceInput],
    runtime: &OpenapiRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_text(source.len(), Utf16::default())?;
    // Match predecessor order: root syntax is observed before the optional
    // base URI and before resource URI/source entries.
    let root = format.parse(source, ctx)?;
    ctx.charge_work(source.len(), Utf16::default())?;
    let retained_source = source.clone();
    let normalized_base = base_uri.map(|uri| canonical_document_uri(uri, ctx)).transpose()?;
    ctx.charge_work(resources.len(), Utf16::default())?;
    let mut seen = BTreeSet::new();
    let mut admitted_resources = Vec::with_capacity(resources.len());
    for resource in resources {
        let uri = canonical_document_uri(&resource.uri, ctx)?;
        ctx.charge_work(uri.len().saturating_add(1), Utf16::default())?;
        if !seen.insert(uri.clone()) || normalized_base.as_ref() == Some(&uri) {
            return Err(error("OPENAPI_RESOURCE_COLLISION", "Duplicate document URI"));
        }
        ctx.charge_text(resource.source.len(), Utf16::default())?;
        let resource_root = resource.format.parse(&resource.source, ctx)?;
        ctx.charge_work(resource.source.len(), Utf16::default())?;
        admitted_resources.push(OpenapiResource {
            uri,
            root: resource_root,
            original_source: resource.source.clone(),
            original_format: resource.format,
            representation_extras: Vec::new(),
        });
    }
    let payload = OpenapiPayload {
        root,
        original_source: retained_source,
        original_format: format,
        base_uri: normalized_base,
        resources: admitted_resources,
        representation_extras: Vec::new(),
    };
    let document = assemble_document(id, &payload, ctx)?;
    let validation = runtime.inspect_document(&document, ctx)?;
    if !validation.valid {
        return Err(validation_error("OPENAPI_DOCUMENT", validation));
    }
    Ok(document)
}

pub fn inspect_openapi_document(
    document: &Value,
    runtime: &OpenapiRuntime,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    runtime.inspect_document(document, ctx)
}

pub fn export_openapi_document(
    document: &Value,
    format: Option<OpenapiFormat>,
    runtime: &OpenapiRuntime,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let payload = read_payload(document, runtime, ctx)?;
    reject_native_representation(&payload)?;
    if !payload.resources.is_empty() {
        return Err(error(
            "OPENAPI_BUNDLE_REQUIRED",
            "Export the full bundle to retain referenced resources",
        ));
    }
    emit_native(
        &payload.root,
        &payload.original_source,
        payload.original_format,
        format.unwrap_or(payload.original_format),
        ctx,
    )
}

pub fn export_openapi_bundle(
    document: &Value,
    runtime: &OpenapiRuntime,
    ctx: &mut Context<'_>,
) -> Result<OpenapiBundle, EngineError> {
    let payload = read_payload(document, runtime, ctx)?;
    reject_native_representation(&payload)?;
    let schema = emit_native(
        &payload.root,
        &payload.original_source,
        payload.original_format,
        payload.original_format,
        ctx,
    )?;
    ctx.charge_work(payload.resources.len(), Utf16::default())?;
    let mut resources = Vec::with_capacity(payload.resources.len());
    for resource in &payload.resources {
        resources.push((
            resource.uri.clone(),
            emit_native(
                &resource.root,
                &resource.original_source,
                resource.original_format,
                resource.original_format,
                ctx,
            )?,
            resource.original_format,
        ));
    }
    let changed = payload.root != payload.original_format.parse(&payload.original_source, ctx)?
        || payload.resources.iter().try_fold(false, |changed, resource| {
            Ok::<_, EngineError>(changed || resource.root != resource.original_format.parse(&resource.original_source, ctx)?)
        })?;
    let mut diagnostics = runtime.inspect_document(document, ctx)?.diagnostics;
    if changed {
        diagnostics.push(warning(
            "OPENAPI_SOURCE_LAYOUT",
            "",
            "Edited native output uses JSON syntax; original layout and comments remain in source archive",
        ));
    }
    diagnostics.push(warning(
        "SOURCE_ARTIFACT_REQUIRED",
        "",
        "Retain source UMF for unrelated metadata and archived native layout",
    ));
    Ok(OpenapiBundle {
        schema,
        format: payload.original_format,
        base_uri: payload.base_uri,
        resources,
        source: copy_json(document, ctx)?,
        diagnostics,
    })
}

pub fn get_openapi_node(
    document: &Value,
    pointer: &Utf16,
    resource_uri: Option<&Utf16>,
    runtime: &OpenapiRuntime,
    ctx: &mut Context<'_>,
) -> Result<NativeJsonTree, EngineError> {
    let payload = read_payload(document, runtime, ctx)?;
    let selected = select_resource(&payload, resource_uri, ctx)?;
    selected.root.subtree_clone(pointer, ctx)
}

/// Literal URI plus JSON Pointer lookup. This does not resolve OpenAPI or
/// JSON Schema identifiers, named anchors, dynamic scope or closure.
pub fn lookup_openapi_resource(
    document: &Value,
    reference: &Utf16,
    from_uri: Option<&Utf16>,
    runtime: &OpenapiRuntime,
    ctx: &mut Context<'_>,
) -> Result<OpenapiLookup, EngineError> {
    let payload = read_payload(document, runtime, ctx)?;
    let base = from_uri
        .or(payload.base_uri.as_ref())
        .ok_or_else(|| error("OPENAPI_BASE_URI", "Explicit document base URI is required"))?;
    let base = canonical_document_uri(base, ctx)?;
    select_resource(&payload, Some(&base), ctx)?;
    ctx.charge_work(reference.len(), Utf16::default())?;
    let reference = lossy(reference);
    let base_text = lossy(&base);
    let mut url = Url::parse(&reference).or_else(|_| {
        Url::parse(&base_text)?.join(&reference)
    }).map_err(|failure| error("OPENAPI_REFERENCE", failure.to_string()))?;
    let pointer = percent_decode_fragment(url.fragment().unwrap_or(""), ctx)?;
    let pointer_text = pointer
        .to_utf8()
        .map_err(|_| error("OPENAPI_REFERENCE", "Pointer fragment is not valid UTF-16"))?;
    if !pointer_text.is_empty() && !pointer_text.starts_with('/') {
        return Err(error(
            "OPENAPI_REFERENCE_SCOPE",
            "Named anchors require schema-aware resolution",
        ));
    }
    url.set_fragment(None);
    ctx.charge_work(url.as_str().encode_utf16().count(), Utf16::default())?;
    let uri = Utf16::from(url.as_str());
    let tree = select_resource(&payload, Some(&uri), ctx)?;
    let node = tree.root.subtree_clone(&pointer, ctx)?;
    Ok(OpenapiLookup {
        uri,
        pointer,
        node,
        interpretation: "literal-document-pointer-only",
    })
}

pub fn extract_openapi_schema(
    document: &Value,
    pointer: &Utf16,
    resource_uri: Option<&Utf16>,
    runtime: &OpenapiRuntime,
    ctx: &mut Context<'_>,
) -> Result<OpenapiSchemaExtraction, EngineError> {
    let validation = runtime.inspect_document(document, ctx)?;
    if !validation.valid { return Err(error("OPENAPI_SCHEMA_SOURCE", "Invalid owning OpenAPI description")); }
    let payload = read_payload(document, runtime, ctx)?;
    let root_tree = select_resource(&payload, resource_uri, ctx)?;
    let root_value = tree_value(root_tree.root, ctx)?;
    let version = field(&root_value, "openapi").and_then(as_text)
        .ok_or_else(|| error("OPENAPI_SCHEMA_VERSION", "Schema extraction requires OpenAPI 3.1 or 3.2"))?;
    if !version.starts_with("3.1.") && !version.starts_with("3.2.") {
        return Err(error("OPENAPI_SCHEMA_VERSION", "Schema extraction requires an owning OpenAPI 3.1 or 3.2 description; fragments require declared context"));
    }
    if !openapi_schema_positions(&root_value, ctx)?.iter().any(|(_, path)| path == pointer) {
        return Err(error("OPENAPI_SCHEMA_POSITION", "Selection is not a declared top-level Schema Object position"));
    }
    let schema = root_tree.root.subtree_clone(pointer, ctx)?;
    let schema_value = tree_value(&schema, ctx)?;
    if !matches!(schema_value, Value::Bool(_) | Value::Object(_)) {
        return Err(error("OPENAPI_SCHEMA_POSITION", "Schema must be an object or boolean"));
    }
    let explicit = field(&schema_value, "$schema");
    let inherited = field(&root_value, "jsonSchemaDialect");
    if explicit.is_some() && !matches!(explicit, Some(Value::String(_))) || inherited.is_some() && !matches!(inherited, Some(Value::String(_))) {
        return Err(error("OPENAPI_SCHEMA_DIALECT", "Schema dialect must be a string"));
    }
    let (dialect, origin) = if let Some(dialect) = explicit.and_then(as_text) { (dialect, "schema") }
    else if let Some(dialect) = inherited.and_then(as_text) { (dialect, "document") }
    else if version.starts_with("3.1.") { ("https://spec.openapis.org/oas/3.1/dialect/base".to_owned(), "openapi-default") }
    else { ("https://spec.openapis.org/oas/3.2/dialect/2026-02-26".to_owned(), "openapi-default") };
    let retrieval = resource_uri.map(|uri| canonical_document_uri(uri, ctx)).transpose()?
        .or(payload.base_uri.clone());
    Ok(OpenapiSchemaExtraction {
        source: copy_json(document, ctx)?, pointer: pointer.clone(), retrieval_uri: retrieval,
        openapi_version: Utf16::from(version), dialect: Utf16::from(dialect), dialect_origin: origin,
        native_schema: schema.render_compact(ctx)?, schema, complete: false,
        limitations: vec![
            "nativeSchema is an exact contextual fragment, not a standalone validation schema".into(),
            "Schema IDs, anchors, dynamic references and OpenAPI $self identity require contextual resolution".into(),
            "The retained source includes supplied resources; absent resources are not fetched".into(),
            "Extraction does not implement HTTP serialization, read/write direction or API runtime semantics".into(),
        ],
    })
}

pub fn index_openapi_schemas(
    document: &Value,
    schema_resources: &[Utf16],
    runtime: &OpenapiRuntime,
    ctx: &mut Context<'_>,
) -> Result<OpenapiSchemaIndex, EngineError> {
    let validation = runtime.inspect_document(document, ctx)?;
    if !validation.valid { return Err(error("OPENAPI_SCOPE_SOURCE", "Invalid owning description")); }
    let payload = read_payload(document, runtime, ctx)?;
    let retrieval = payload.base_uri.clone().ok_or_else(|| error("OPENAPI_SCOPE_BASE", "Schema indexing requires a retrieval URI"))?;
    let mut supplied = vec![retrieval.clone()];
    supplied.extend(payload.resources.iter().map(|r| r.uri.clone()));
    let mut standalone = BTreeSet::new();
    for uri in schema_resources {
        let canonical = canonical_document_uri(uri, ctx)?;
        if !supplied.contains(&canonical) || canonical == retrieval {
            return Err(error("OPENAPI_SCOPE_RESOURCE", "Standalone schema must be an explicitly supplied resource"));
        }
        standalone.insert(canonical);
    }
    let mut index = OpenapiSchemaIndex {
        locations: Vec::new(), identifiers: std::collections::BTreeMap::new(), complete: false,
        limitations: vec![
            "Static schema scope only; dynamic references require evaluation-time scope".into(),
            "Unclassified resource fragments are retained but not indexed".into(),
            "Known dialect schema positions only; HTTP and instance evaluation are not implemented".into(),
        ],
    };
    for uri in supplied {
        let selected = select_resource(&payload, Some(&uri), ctx)?;
        let root = tree_value(selected.root, ctx)?;
        let members = object_fields(&root).unwrap_or_default();
        if standalone.contains(&uri) {
            let dialect = field(&root, "$schema").and_then(as_text)
                .ok_or_else(|| error("OPENAPI_SCOPE_DIALECT", "Standalone schema requires explicit $schema"))?;
            identify_schema(&mut index, &uri, &uri, &Utf16::default())?;
            walk_schema_scope(&mut index, &root, &uri, &Utf16::default(), &uri, &dialect, ctx)?;
            continue;
        }
        let version = field(&root, "openapi").and_then(as_text);
        if !version.as_deref().is_some_and(|v| v.starts_with("3.1.") || v.starts_with("3.2.")) {
            if uri == retrieval { return Err(error("OPENAPI_SCOPE_VERSION", "Schema indexing requires OpenAPI 3.1/3.2")); }
            continue;
        }
        let version = version.unwrap();
        let mut base = uri.clone();
        if version.starts_with("3.2.") {
            if let Some(self_value) = field(&root, "$self") {
                let self_uri = as_text(self_value).ok_or_else(|| error("OPENAPI_SCOPE_SELF", "Invalid $self"))?;
                base = resolve_fragment_free(&self_uri, &lossy(&uri), "OPENAPI_SCOPE_SELF")?;
            }
        }
        identify_schema(&mut index, &uri, &uri, &Utf16::default())?;
        identify_schema(&mut index, &base, &uri, &Utf16::default())?;
        let default_dialect = field(&root, "jsonSchemaDialect").and_then(as_text).unwrap_or_else(|| if version.starts_with("3.1.") { "https://spec.openapis.org/oas/3.1/dialect/base".into() } else { "https://spec.openapis.org/oas/3.2/dialect/2026-02-26".into() });
        for (schema, path) in openapi_schema_positions(&root, ctx)? {
            walk_schema_scope(&mut index, schema, &uri, &path, &base, &default_dialect, ctx)?;
        }
        let _ = members;
    }
    Ok(index)
}

pub fn resolve_openapi_schema_reference(
    document: &Value,
    pointer: &Utf16,
    reference: &Utf16,
    resource_uri: Option<&Utf16>,
    schema_resources: &[Utf16],
    runtime: &OpenapiRuntime,
    ctx: &mut Context<'_>,
) -> Result<OpenapiSchemaResolution, EngineError> {
    let index = index_openapi_schemas(document, schema_resources, runtime, ctx)?;
    let payload = read_payload(document, runtime, ctx)?;
    let retrieval = resource_uri.map(|uri| canonical_document_uri(uri, ctx)).transpose()?.or(payload.base_uri.clone())
        .ok_or_else(|| error("OPENAPI_SCOPE_BASE", "Schema indexing requires a retrieval URI"))?;
    let source = index.locations.iter().find(|item| item.retrieval_uri == retrieval && item.pointer == *pointer)
        .cloned().ok_or_else(|| error("OPENAPI_SCOPE_POSITION", "Source must be an indexed schema position"))?;
    let target_url = resolve_url(&lossy(reference), &lossy(&source.base_uri), "OPENAPI_SCOPE_REFERENCE")?;
    let fragment = percent_decode_fragment(target_url.fragment().unwrap_or(""), ctx)?;
    let mut resource = target_url.clone(); resource.set_fragment(None);
    let resource_uri = Utf16::from(resource.as_str());
    let fragment_text = fragment.to_utf8().map_err(|_| error("OPENAPI_SCOPE_REFERENCE", "Reference fragment is not valid UTF-8"))?;
    let identity = if fragment_text.is_empty() || fragment_text.starts_with('/') { resource_uri.to_utf8().unwrap_or_default() } else { format!("{}#{}", resource_uri.to_utf8().unwrap_or_default(), fragment_text) };
    let mut root = index.identifiers.get(&identity).cloned();
    if root.is_none() && !fragment_text.is_empty() && !fragment_text.starts_with('/') {
        if let Some(resource_identity) = index.identifiers.get(&resource_uri.to_utf8().unwrap_or_default()) {
            for (alias, location) in &index.identifiers {
                if !alias.contains('#') && location == resource_identity && index.identifiers.contains_key(&format!("{alias}#{fragment_text}")) {
                    root = index.identifiers.get(&format!("{alias}#{fragment_text}")).cloned(); break;
                }
            }
        }
    }
    let root = root.ok_or_else(|| error("OPENAPI_SCOPE_MISSING", format!("Reference identity is not indexed: {identity}")))?;
    let path = if fragment_text.starts_with('/') { append_utf16(&root.pointer, &fragment) } else { root.pointer.clone() };
    let target = index.locations.iter().find(|item| item.retrieval_uri == root.retrieval_uri && item.pointer == path)
        .cloned().ok_or_else(|| error("OPENAPI_SCOPE_POSITION", "Target is not an indexed schema position"))?;
    let node = get_openapi_node(document, &target.pointer, Some(&target.retrieval_uri), runtime, ctx)?;
    Ok(OpenapiSchemaResolution { source, target, node, complete: false, limitations: index.limitations })
}

pub fn resolve_openapi_dynamic_reference(
    document: &Value,
    pointer: &Utf16,
    resource_uri: Option<&Utf16>,
    schema_resources: &[Utf16],
    evaluation_scope: &[Utf16],
    runtime: &OpenapiRuntime,
    ctx: &mut Context<'_>,
) -> Result<OpenapiDynamicResolution, EngineError> {
    if evaluation_scope.is_empty() || evaluation_scope.len() > 128 {
        return Err(error("OPENAPI_DYNAMIC_OPTIONS", "A source schema and 1–128 outermost-to-innermost scope resource URIs are required"));
    }
    let index = index_openapi_schemas(document, schema_resources, runtime, ctx)?;
    let mut scope = Vec::new();
    for raw in evaluation_scope {
        let uri = canonical_document_uri(raw, ctx)?;
        let id = uri.to_utf8().unwrap_or_default();
        if !index.identifiers.contains_key(&id) { return Err(error("OPENAPI_DYNAMIC_SCOPE", format!("Scope resource is not indexed: {id}"))); }
        scope.push(uri);
    }
    let source_node = get_openapi_node(document, pointer, resource_uri, runtime, ctx)?;
    let source_value = tree_value(&source_node, ctx)?;
    let reference = field(&source_value, "$dynamicRef").and_then(as_text)
        .ok_or_else(|| error("OPENAPI_DYNAMIC_SOURCE", "Selected schema must contain a string $dynamicRef"))?;
    let initial = resolve_openapi_schema_reference(document, pointer, &Utf16::from(reference.clone()), resource_uri, schema_resources, runtime, ctx)?;
    let payload = read_payload(document, runtime, ctx)?;
    let source_owner = resource_uri.map(|uri| canonical_document_uri(uri, ctx)).transpose()?.or(payload.base_uri.clone())
        .ok_or_else(|| error("OPENAPI_SCOPE_BASE", "Schema indexing requires a retrieval URI"))?;
    let source_location = index.locations.iter().find(|item| item.retrieval_uri == source_owner && item.pointer == *pointer)
        .cloned().ok_or_else(|| error("OPENAPI_SCOPE_POSITION", "Source must be an indexed schema position"))?;
    let last_identity = index.identifiers.get(&scope.last().unwrap().to_utf8().unwrap_or_default())
        .ok_or_else(|| error("OPENAPI_DYNAMIC_SCOPE", "Innermost resource is not indexed"))?;
    let owning = index.identifiers.get(&lossy(&source_location.base_uri))
        .ok_or_else(|| error("OPENAPI_DYNAMIC_SCOPE", "Source resource identity is not indexed"))?;
    if last_identity.retrieval_uri != owning.retrieval_uri || last_identity.pointer != owning.pointer {
        return Err(error("OPENAPI_DYNAMIC_SCOPE", "Innermost scope resource must own the source schema"));
    }
    let resolved_url = resolve_url(&reference, &lossy(&source_location.base_uri), "OPENAPI_DYNAMIC_SOURCE")?;
    let fragment = percent_decode_fragment(resolved_url.fragment().unwrap_or(""), ctx)?.to_utf8()
        .map_err(|_| error("OPENAPI_DYNAMIC_SOURCE", "Reference fragment is not valid UTF-8"))?;
    let initial_value = tree_value(&initial.node, ctx)?;
    let anchor = field(&initial_value, "$dynamicAnchor").and_then(as_text);
    let mut target = initial.target.clone();
    let mut node = initial.node.clone();
    let mut resolution = "static";
    if !fragment.is_empty() && !fragment.starts_with('/') && anchor.as_deref() == Some(fragment.as_str()) {
        for scope_uri in &scope {
            let identity = index.identifiers.get(&lossy(scope_uri)).expect("scope identities checked");
            let mut candidate = index.identifiers.get(&format!("{}#{fragment}", lossy(scope_uri))).cloned();
            if candidate.is_none() {
                for (alias, location) in &index.identifiers {
                    if !alias.contains('#') && location == identity {
                        candidate = index.identifiers.get(&format!("{alias}#{fragment}")).cloned();
                        if candidate.is_some() { break; }
                    }
                }
            }
            let Some(candidate) = candidate else { continue; };
            let value = get_openapi_node(document, &candidate.pointer, Some(&candidate.retrieval_uri), runtime, ctx)?;
            let value = tree_value(&value, ctx)?;
            if field(&value, "$dynamicAnchor").and_then(as_text).as_deref() != Some(fragment.as_str()) { continue; }
            if let Some(location) = index.locations.iter().find(|item| item.retrieval_uri == candidate.retrieval_uri && item.pointer == candidate.pointer) {
                target = location.clone();
                node = get_openapi_node(document, &target.pointer, Some(&target.retrieval_uri), runtime, ctx)?;
                resolution = "dynamic";
                break;
            }
        }
    }
    Ok(OpenapiDynamicResolution {
        source: source_location, initial_target: initial.target, target, node, evaluation_scope: scope,
        resolution, complete: false,
        limitations: vec![
            "Caller supplies evaluation scope; this operation does not derive or certify an instance evaluation path".into(),
            "One dynamic reference is resolved; assertions and annotation propagation are not evaluated".into(),
            "Static projection still rejects dynamic scope because flattening it would change resource boundaries".into(),
        ],
    })
}

pub fn resolve_openapi_object_reference(
    document: &Value,
    pointer: &Utf16,
    kind: &Utf16,
    resource_uri: Option<&Utf16>,
    runtime: &OpenapiRuntime,
    ctx: &mut Context<'_>,
) -> Result<OpenapiReferenceResolution, EngineError> {
    let kind_text = kind.to_utf8().map_err(|_| error("OPENAPI_REFERENCE_KIND", "A supported explicit Reference Object role and pointer are required"))?;
    let kinds = ["parameter", "header", "response", "request-body", "example", "link", "security-scheme"];
    if !kinds.contains(&kind_text.as_str()) { return Err(error("OPENAPI_REFERENCE_KIND", "A supported explicit Reference Object role and pointer are required")); }
    let validation = runtime.inspect_document(document, ctx)?;
    if !validation.valid { return Err(error("OPENAPI_REFERENCE_SOURCE", "Invalid owning description")); }
    let payload = read_payload(document, runtime, ctx)?;
    let base = payload.base_uri.clone().ok_or_else(|| error("OPENAPI_BASE_URI", "Reference resolution requires the owning document base URI"))?;
    let root = get_openapi_node(document, &Utf16::default(), None, runtime, ctx)?;
    let root_value = tree_value(&root, ctx)?;
    let version = field(&root_value, "openapi").and_then(as_text)
        .ok_or_else(|| error("OPENAPI_REFERENCE_VERSION", "This Reference Object resolver requires OpenAPI 3.1 or 3.2"))?;
    let minor = if version.starts_with("3.1.") { "3.1" } else if version.starts_with("3.2.") { "3.2" } else { return Err(error("OPENAPI_REFERENCE_VERSION", "This Reference Object resolver requires OpenAPI 3.1 or 3.2")); };
    let mut uri = resource_uri.map(|uri| canonical_document_uri(uri, ctx)).transpose()?.unwrap_or(base);
    let mut path = pointer.clone();
    let mut node = get_openapi_node(document, &path, Some(&uri), runtime, ctx)?;
    let mut chain=Vec::new();
    let mut seen=BTreeSet::new();
    let mut summary=None;
    let mut description=None;
    for hops in 0..=128 {
        let owner=get_openapi_node(document,&Utf16::default(),Some(&uri),runtime,ctx)?;
        let owner_value=tree_value(&owner,ctx)?;
        let owner_version=field(&owner_value,"openapi").and_then(as_text).unwrap_or_default();
        if owner_version.starts_with("3.2.") && field(&owner_value,"$self").is_some() {
            return Err(error("OPENAPI_REFERENCE_SCOPE", "$self resource identity requires a schema-aware URI index"));
        }
        let identity=(uri.clone(),path.clone());
        if !seen.insert(identity) { return Err(error("OPENAPI_REFERENCE_CYCLE", "Reference Object chain has no concrete target")); }
        let value=tree_value(&node,ctx)?;
        if !matches!(value,Value::Object(_)) { return Err(error("OPENAPI_REFERENCE_TARGET", "Reference Object target must be an object")); }
        if field(&value,"$ref").is_some() {
            if hops==128 { return Err(error("OPENAPI_REFERENCE_LIMIT", "Reference chain exceeds 128 hops")); }
            validate_reference_role(runtime,minor,"reference",&value,ctx,"OPENAPI_REFERENCE_OBJECT")?;
            chain.push(OpenapiReferenceStep { uri:uri.clone(), pointer:path.clone(), reference:node.clone() });
            if summary.is_none() && kind_text=="example" { summary=field(&value,"summary").and_then(as_text).map(Utf16::from); }
            if description.is_none() { description=field(&value,"description").and_then(as_text).map(Utf16::from); }
            let raw=field(&value,"$ref").and_then(as_text).unwrap();
            let next=lookup_openapi_resource(document,&Utf16::from(raw),Some(&uri),runtime,ctx)?;
            uri=next.uri; path=next.pointer; node=next.node;
            continue;
        }
        if chain.is_empty() { return Err(error("OPENAPI_REFERENCE_OBJECT", "The selected source node is not a Reference Object")); }
        validate_reference_role(runtime,minor,&kind_text,&value,ctx,"OPENAPI_REFERENCE_TARGET")?;
        if summary.is_none() && kind_text=="example" { summary=field(&value,"summary").and_then(as_text).map(Utf16::from); }
        if description.is_none() { description=field(&value,"description").and_then(as_text).map(Utf16::from); }
        return Ok(OpenapiReferenceResolution {
            kind:kind.clone(), target:OpenapiReferenceTarget { uri, pointer:path, node },
            chain, effective_annotations: OpenapiEffectiveAnnotations { summary, description }, complete:false,
            limitations:vec![
                "The caller declares the Reference Object role; source position is not inferred".into(),
                "Nested references and embedded schema/dialect scopes are not resolved by this operation".into(),
                "Object syntax validation does not implement HTTP serialization, authorization or runtime behavior".into(),
            ],
        });
    }
    Err(error("OPENAPI_REFERENCE_LIMIT", "Reference chain exceeds 128 hops"))
}

fn validate_reference_role(runtime: &OpenapiRuntime, version: &str, role: &str, value: &Value, ctx: &mut Context<'_>, code: &str) -> Result<(), EngineError> {
    let (_, _, validator)=runtime.reference_schemas.iter().find(|(v,r,_)|v==version&&r==role)
        .ok_or_else(||error("OPENAPI_REFERENCE_SCHEMA","Pinned Reference Object validator is unavailable"))?;
    let errors=validator.validate(value,ctx)?;
    if errors.is_empty() { return Ok(()); }
    let detail=errors.iter().map(|failure| format!("{}: {}",lossy(&failure.instance_path),lossy(&failure.message))).collect::<Vec<_>>().join("; ");
    Err(error(code,detail))
}

fn identify_schema(index: &mut OpenapiSchemaIndex, identity: &Utf16, retrieval: &Utf16, pointer: &Utf16) -> Result<(), EngineError> {
    let key = identity.to_utf8().map_err(|_| error("OPENAPI_SCOPE_ID", "Schema identity is not valid UTF-8"))?;
    if let Some(previous) = index.identifiers.get(&key) {
        if previous.retrieval_uri != *retrieval || previous.pointer != *pointer {
            return Err(error("OPENAPI_SCOPE_COLLISION", format!("Ambiguous schema identity: {key}")));
        }
    } else { index.identifiers.insert(key, OpenapiSchemaIdentity { retrieval_uri: retrieval.clone(), pointer: pointer.clone() }); }
    Ok(())
}

fn walk_schema_scope(index: &mut OpenapiSchemaIndex, schema: &Value, retrieval: &Utf16, pointer: &Utf16, inherited_base: &Utf16, inherited_dialect: &str, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    ctx.charge_work(1, pointer.clone())?;
    if !matches!(schema, Value::Object(_) | Value::Bool(_)) { return Err(error("OPENAPI_SCOPE_SCHEMA", format!("Invalid schema at {}", lossy(pointer)))); }
    let mut base = inherited_base.clone();
    let dialect = if let Some(value) = field(schema, "$schema") { as_text(value).ok_or_else(|| error("OPENAPI_SCOPE_KEYWORD", "Expected string $schema"))? } else { inherited_dialect.to_owned() };
    let allowed = ["https://json-schema.org/draft/2020-12/schema", "https://spec.openapis.org/oas/3.1/dialect/base", "https://spec.openapis.org/oas/3.1/dialect/2024-11-10", "https://spec.openapis.org/oas/3.2/dialect/2026-02-26"];
    if !allowed.contains(&dialect.as_str()) { return Err(error("OPENAPI_SCOPE_DIALECT", format!("Cannot infer schema positions for dialect {dialect}"))); }
    if let Some(id) = field(schema, "$id") {
        let id = as_text(id).ok_or_else(|| error("OPENAPI_SCOPE_KEYWORD", "Expected string $id"))?;
        base = resolve_fragment_free(&id, &inherited_base.to_utf8().unwrap_or_default(), "OPENAPI_SCOPE_ID")?;
        identify_schema(index, &base, retrieval, pointer)?;
    }
    index.locations.push(OpenapiSchemaLocation { retrieval_uri: retrieval.clone(), pointer: pointer.clone(), base_uri: base.clone(), dialect: Utf16::from(dialect.clone()) });
    for anchor_key in ["$anchor", "$dynamicAnchor"] {
        if let Some(anchor) = field(schema, anchor_key) {
            let anchor = as_text(anchor).ok_or_else(|| error("OPENAPI_SCOPE_ANCHOR", "Invalid schema anchor"))?;
            let bytes=anchor.as_bytes();
            if bytes.is_empty() || !(bytes[0].is_ascii_alphabetic() || bytes[0]==b'_') || !bytes[1..].iter().all(|b| b.is_ascii_alphanumeric() || b"-._".contains(b)) { return Err(error("OPENAPI_SCOPE_ANCHOR", "Invalid schema anchor")); }
            identify_schema(index, &Utf16::from(format!("{}#{anchor}", lossy(&base))), retrieval, pointer)?;
        }
    }
    if let Value::Object(fields) = schema {
        let singles=["not","if","then","else","items","contains","additionalProperties","unevaluatedProperties","unevaluatedItems","propertyNames","contentSchema"];
        let arrays=["allOf","anyOf","oneOf","prefixItems"];
        let maps=["$defs","definitions","properties","patternProperties","dependentSchemas"];
        for (name_key, value) in fields {
            let name=lossy(name_key);
            if singles.contains(&name.as_str()) { walk_schema_scope(index,value,retrieval,&join_pointer(pointer,&name),&base,&dialect,ctx)?; }
            else if arrays.contains(&name.as_str()) { if let Value::Array(items)=value { for (i,item) in items.iter().enumerate() { walk_schema_scope(index,item,retrieval,&join_pointer(&join_pointer(pointer,&name),&i.to_string()),&base,&dialect,ctx)?; } } }
            else if maps.contains(&name.as_str()) { if let Value::Object(items)=value { for (child,item) in items { walk_schema_scope(index,item,retrieval,&join_pointer_utf16(&join_pointer(pointer,&name),child),&base,&dialect,ctx)?; } } }
            else if name=="dependencies" { if let Value::Object(items)=value { for (child,item) in items { if !matches!(item,Value::Array(_)) { walk_schema_scope(index,item,retrieval,&join_pointer_utf16(&join_pointer(pointer,"dependencies"),child),&base,&dialect,ctx)?; } } } }
        }
    }
    Ok(())
}

fn resolve_fragment_free(reference: &str, base: &str, code: &str) -> Result<Utf16, EngineError> {
    let url = resolve_url(reference, base, code)?;
    if url.fragment().is_some_and(|fragment| !fragment.is_empty()) { return Err(error(code, "Schema identity cannot contain a nonempty fragment")); }
    let mut url=url; url.set_fragment(None); Ok(Utf16::from(url.as_str()))
}

fn resolve_url(reference: &str, base: &str, code: &str) -> Result<Url, EngineError> {
    if let Ok(url)=Url::parse(reference) { return Ok(url); }
    Url::parse(base).and_then(|url| url.join(reference)).map_err(|failure| error(code, failure.to_string()))
}

fn tree_value(tree: &NativeJsonTree, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let rendered=tree.render_compact(ctx)?;
    serialization::read_json_value(rendered.units(),Format::Json,ctx)
}

/// Mirror `standaloneOpenapiObjectSchema`: an object validator has no outer
/// dynamic binding, so the upstream `#meta` dynamic reference is made static.
fn rewrite_standalone_dynamic_meta(value: &mut Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match value {
        Value::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            for item in items { rewrite_standalone_dynamic_meta(item, ctx)?; }
        }
        Value::Object(fields) => {
            ctx.charge_work(fields.len(), Utf16::default())?;
            for (name, item) in fields {
                if name == &key("$dynamicRef") && text_is(Some(item), "#meta") {
                    *name = key("$ref");
                    *item = Value::String(Utf16::from("#/$defs/schema"));
                } else {
                    rewrite_standalone_dynamic_meta(item, ctx)?;
                }
            }
        }
        _ => {}
    }
    Ok(())
}

/// Draft 4 treats a trailing empty fragment on `id` as the resource URI
/// without a fragment. Canonicalize the two pinned legacy roots in memory so
/// local fragment references and the closed-resource lookup use that same URI.
fn normalize_draft4_empty_fragment_id(value: &mut Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let Some(Value::String(id)) = field(value, "id") else {
        return Ok(());
    };
    let Some(text) = id.to_utf8().ok() else {
        return Ok(());
    };
    let Some(canonical) = text.strip_suffix('#') else {
        return Ok(());
    };
    ctx.charge_work(id.len(), Utf16::default())?;
    set_object_field(value, "id", Value::String(Utf16::from(canonical)))
}

#[derive(Clone, Debug, PartialEq)]
pub struct OpenapiLookup {
    pub uri: Utf16,
    pub pointer: Utf16,
    pub node: NativeJsonTree,
    pub interpretation: &'static str,
}

#[derive(Clone, Debug, PartialEq)]
pub struct OpenapiSchemaLocation {
    pub retrieval_uri: Utf16,
    pub pointer: Utf16,
    pub base_uri: Utf16,
    pub dialect: Utf16,
}

#[derive(Clone, Debug, PartialEq)]
pub struct OpenapiSchemaIdentity {
    pub retrieval_uri: Utf16,
    pub pointer: Utf16,
}

#[derive(Clone, Debug, PartialEq)]
pub struct OpenapiSchemaIndex {
    pub locations: Vec<OpenapiSchemaLocation>,
    pub identifiers: std::collections::BTreeMap<String, OpenapiSchemaIdentity>,
    pub complete: bool,
    pub limitations: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct OpenapiSchemaResolution {
    pub source: OpenapiSchemaLocation,
    pub target: OpenapiSchemaLocation,
    pub node: NativeJsonTree,
    pub complete: bool,
    pub limitations: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct OpenapiSchemaExtraction {
    pub source: Value,
    pub pointer: Utf16,
    pub retrieval_uri: Option<Utf16>,
    pub openapi_version: Utf16,
    pub dialect: Utf16,
    pub dialect_origin: &'static str,
    pub schema: NativeJsonTree,
    pub native_schema: Utf16,
    pub complete: bool,
    pub limitations: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct OpenapiDynamicResolution {
    pub source: OpenapiSchemaLocation,
    pub initial_target: OpenapiSchemaLocation,
    pub target: OpenapiSchemaLocation,
    pub node: NativeJsonTree,
    pub evaluation_scope: Vec<Utf16>,
    pub resolution: &'static str,
    pub complete: bool,
    pub limitations: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct OpenapiReferenceStep {
    pub uri: Utf16,
    pub pointer: Utf16,
    pub reference: NativeJsonTree,
}

#[derive(Clone, Debug, PartialEq)]
pub struct OpenapiReferenceResolution {
    pub kind: Utf16,
    pub target: OpenapiReferenceTarget,
    pub chain: Vec<OpenapiReferenceStep>,
    pub effective_annotations: OpenapiEffectiveAnnotations,
    pub complete: bool,
    pub limitations: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct OpenapiReferenceTarget {
    pub uri: Utf16,
    pub pointer: Utf16,
    pub node: NativeJsonTree,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct OpenapiEffectiveAnnotations {
    pub summary: Option<Utf16>,
    pub description: Option<Utf16>,
}

impl OpenapiReferenceResolution {
    /// Materialize the predecessor's `reference-result.schema` DTO exactly.
    pub fn to_value(&self, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        let target = vec![
            (key("uri"), Value::String(self.target.uri.clone())),
            (key("pointer"), Value::String(self.target.pointer.clone())),
            (key("node"), self.target.node.tagged_value_preserving_extras(ctx)?),
        ];
        let mut chain = Vec::with_capacity(self.chain.len());
        ctx.charge_work(self.chain.len(), Utf16::default())?;
        for item in &self.chain {
            chain.push(Value::Object(vec![
                (key("uri"), Value::String(item.uri.clone())),
                (key("pointer"), Value::String(item.pointer.clone())),
                (key("reference"), item.reference.tagged_value_preserving_extras(ctx)?),
            ]));
        }
        let mut annotations = Vec::new();
        if let Some(summary) = &self.effective_annotations.summary { annotations.push((key("summary"), Value::String(summary.clone()))); }
        if let Some(description) = &self.effective_annotations.description { annotations.push((key("description"), Value::String(description.clone()))); }
        let mut limitations = Vec::with_capacity(self.limitations.len());
        ctx.charge_work(self.limitations.len(), Utf16::default())?;
        for limitation in &self.limitations { limitations.push(Value::string_utf8(limitation)); }
        Ok(Value::Object(vec![
            (key("kind"), Value::String(self.kind.clone())),
            (key("target"), Value::Object(target)),
            (key("chain"), Value::Array(chain)),
            (key("effectiveAnnotations"), Value::Object(annotations)),
            (key("complete"), Value::Bool(false)),
            (key("limitations"), Value::Array(limitations)),
        ]))
    }
}

pub fn propose_openapi_edit(
    document: &Value,
    pointer: &Utf16,
    replacement_json: &Utf16,
    resource_uri: Option<&Utf16>,
    runtime: &OpenapiRuntime,
    ctx: &mut Context<'_>,
) -> Result<(Value, Validation), EngineError> {
    let mut payload = read_payload(document, runtime, ctx)?;
    let replacement = NativeJsonTree::parse_json(replacement_json.units(), ctx)?;
    let target = select_root_mut(&mut payload, resource_uri, ctx)?;
    *target = target.replace_node(pointer, &replacement, ctx)?;
    let candidate = replace_openapi_payload(document, &payload, ctx)?;
    let validation = runtime.inspect_document(&candidate, ctx)?;
    if !validation.valid {
        return Err(validation_error("OPENAPI_EDIT", validation));
    }
    Ok((candidate, validation))
}

fn read_payload(
    document: &Value,
    runtime: &OpenapiRuntime,
    ctx: &mut Context<'_>,
) -> Result<OpenapiPayload, EngineError> {
    let validation = runtime.inspect_document(document, ctx)?;
    if !validation.valid {
        return Err(validation_error("OPENAPI_DOCUMENT", validation));
    }
    if !text_is(field(document, "umf"), CORE_VERSION) {
        return Err(error("OPENAPI_DOCUMENT", "Unsupported core document version"));
    }
    let vocabulary = field(document, "vocabularies").and_then(|v| field(v, EXTENSION));
    if !text_is(vocabulary.and_then(|v| field(v, "version")), EXTENSION_VERSION) {
        return Err(error("OPENAPI_PAYLOAD", "Missing OpenAPI vocabulary declaration"));
    }
    let modules = field(document, "modules").and_then(as_array)
        .ok_or_else(|| error("OPENAPI_PAYLOAD", "Missing schema module"))?;
    let module = modules.iter().find(|module| text_is(field(module, "id"), "schema"))
        .ok_or_else(|| error("OPENAPI_PAYLOAD", "Missing schema module"))?;
    let elements = field(module, "elements").and_then(as_array)
        .ok_or_else(|| error("OPENAPI_PAYLOAD", "Missing schema element"))?;
    let element = elements.iter().find(|element| text_is(field(element, "id"), "schema"))
        .ok_or_else(|| error("OPENAPI_PAYLOAD", "Missing schema element"))?;
    let extension = field(element, "extensions").and_then(|v| field(v, EXTENSION))
        .ok_or_else(|| error("OPENAPI_PAYLOAD", "Missing OpenAPI payload"))?;
    let structural_errors = runtime.package_schema.validate(extension, ctx)?;
    if !structural_errors.is_empty() {
        return Err(error("OPENAPI_PAYLOAD", "Invalid OpenAPI payload structure"));
    }
    payload_from_value(extension, ctx)
}

fn payload_from_value(value: &Value, ctx: &mut Context<'_>) -> Result<OpenapiPayload, EngineError> {
    if !text_is(field(value, "profile"), PROFILE) {
        return Err(error("OPENAPI_PAYLOAD", "Unsupported OpenAPI payload profile"));
    }
    let root = NativeJsonTree::from_tagged_value(
        field(value, "root").ok_or_else(|| error("OPENAPI_PAYLOAD", "Missing root tree"))?,
        ctx,
    )?;
    let original_source = text_copy(field(value, "originalSource"), ctx)?
        .ok_or_else(|| error("OPENAPI_PAYLOAD", "Missing original source"))?;
    let original_format = parse_format(field(value, "originalFormat"))?;
    let base_uri = text_copy(field(value, "baseUri"), ctx)?;
    let mut resources = Vec::new();
    if let Some(Value::Array(items)) = field(value, "resources") {
        ctx.charge_work(items.len(), Utf16::default())?;
        for item in items {
            let uri = text_copy(field(item, "uri"), ctx)?
                .ok_or_else(|| error("OPENAPI_RESOURCE", "Resource URI must be a string"))?;
            resources.push(OpenapiResource {
                uri,
                root: NativeJsonTree::from_tagged_value(
                    field(item, "root").ok_or_else(|| error("OPENAPI_RESOURCE", "Missing resource tree"))?,
                    ctx,
                )?,
                original_source: text_copy(field(item, "originalSource"), ctx)?
                    .ok_or_else(|| error("OPENAPI_RESOURCE", "Missing resource source"))?,
                original_format: parse_format(field(item, "originalFormat"))?,
                representation_extras: extras(item, &["uri", "root", "originalSource", "originalFormat"], ctx)?,
            });
        }
    }
    let representation_extras = extras(value, &["profile", "root", "originalSource", "originalFormat", "baseUri", "resources"], ctx)?;
    Ok(OpenapiPayload {
        root,
        original_source,
        original_format,
        base_uri,
        resources,
        representation_extras,
    })
}

fn payload_tree(value: &Value, ctx: &mut Context<'_>) -> Result<NativeJsonTree, EngineError> {
    NativeJsonTree::from_tagged_value(
        field(value, "root").ok_or_else(|| error("OPENAPI_PAYLOAD", "Missing root tree"))?,
        ctx,
    )
}

fn extras(value: &Value, known: &[&str], ctx: &mut Context<'_>) -> Result<Vec<(Utf16, Value)>, EngineError> {
    let fields = object_fields(value).unwrap_or_default();
    ctx.charge_work(fields.len(), Utf16::default())?;
    fields.iter()
        .filter(|(name, _)| !known.iter().any(|known| name == &Utf16::from(*known)))
        .map(|(name, value)| Ok((name.clone(), copy_json(value, ctx)?)))
        .collect()
}

fn inspect_payload(
    value: &Value,
    object_schemas: &[(String, crate::schema::CompiledSchema)],
    meta_schemas: &[(String, crate::schema::CompiledSchema)],
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let tree = payload_tree(value, ctx)?;
    let mut diagnostics = inspect_native_tree(&tree, object_schemas, meta_schemas, ctx)?;
    match (field(value, "originalSource"), parse_format(field(value, "originalFormat"))) {
        (Some(Value::String(source)), Ok(format)) => {
            if let Err(failure) = format.parse(source, ctx) {
                if failure.is_control_failure() || failure.code == "LIMIT" {
                    return Err(failure);
                }
                diagnostics.push(diagnostic(
                    "OPENAPI_ARCHIVE",
                    "/originalSource",
                    &lossy(&failure.message),
                    Severity::Error,
                ));
            }
        }
        _ => diagnostics.push(diagnostic(
            "OPENAPI_ARCHIVE",
            "/originalSource",
            "Original source and format are required",
            Severity::Error,
        )),
    }
    for (name, _) in extras(value, &["profile", "root", "originalSource", "originalFormat", "baseUri", "resources"], ctx)? {
        diagnostics.push(diagnostic(
            "OPENAPI_REPRESENTATION",
            &format!("/{}", lossy(&name)),
            "Unknown representation field cannot be emitted natively",
            Severity::Warning,
        ));
    }
    if let Some(Value::Array(items)) = field(value, "resources") {
        ctx.charge_work(items.len(), Utf16::default())?;
        let mut seen = BTreeSet::new();
        if let Some(base) = text_copy(field(value, "baseUri"), ctx)? {
            match canonical_document_uri(&base, ctx) {
                Ok(uri) => { seen.insert(uri); }
                Err(failure) if failure.is_control_failure() || failure.code == "LIMIT" => return Err(failure),
                Err(failure) => diagnostics.push(diagnostic(
                    "OPENAPI_RESOURCE_URI",
                    "/baseUri",
                    &lossy(&failure.message),
                    Severity::Error,
                )),
            }
        }
        for (index, resource) in items.iter().enumerate() {
            let resource_uri = text_copy(field(resource, "uri"), ctx)?;
            match resource_uri.as_ref().map(|uri| canonical_document_uri(uri, ctx)) {
                Some(Ok(uri)) if seen.insert(uri.clone()) => {}
                Some(Ok(_)) => diagnostics.push(diagnostic(
                    "OPENAPI_RESOURCE",
                    &format!("/resources/{index}"),
                    "Duplicate document URI",
                    Severity::Error,
                )),
                Some(Err(failure)) if failure.is_control_failure() || failure.code == "LIMIT" => return Err(failure),
                Some(Err(failure)) => diagnostics.push(diagnostic(
                    "OPENAPI_RESOURCE",
                    &format!("/resources/{index}"),
                    &lossy(&failure.message),
                    Severity::Error,
                )),
                None => diagnostics.push(diagnostic(
                    "OPENAPI_RESOURCE",
                    &format!("/resources/{index}/uri"),
                    "Resource URI must be a string",
                    Severity::Error,
                )),
            }
            let source = field(resource, "originalSource");
            let format = parse_format(field(resource, "originalFormat"));
            match (source, format) {
                (Some(Value::String(source)), Ok(format)) => if let Err(failure) = format.parse(source, ctx) {
                    if failure.is_control_failure() || failure.code == "LIMIT" { return Err(failure); }
                    diagnostics.push(diagnostic(
                        "OPENAPI_RESOURCE",
                        &format!("/resources/{index}"),
                        &lossy(&failure.message),
                        Severity::Error,
                    ));
                },
                _ => diagnostics.push(diagnostic(
                    "OPENAPI_RESOURCE",
                    &format!("/resources/{index}"),
                    "Resource source and format are required",
                    Severity::Error,
                )),
            }
            let resource_tree = NativeJsonTree::from_tagged_value(
                field(resource, "root").ok_or_else(|| error("OPENAPI_RESOURCE", "Missing resource root"))?,
                ctx,
            )?;
            for (name, _) in extras(resource, &["uri", "root", "originalSource", "originalFormat"], ctx)? {
                diagnostics.push(diagnostic(
                    "OPENAPI_REPRESENTATION",
                    &format!("/resources/{index}/{}", lossy(&name)),
                    "Unknown resource field cannot be emitted natively",
                    Severity::Warning,
                ));
            }
            for path in resource_tree.representation_extra_paths(
                &Utf16::from(format!("/resources/{index}/root")),
                ctx,
            )? {
                diagnostics.push(diagnostic(
                    "OPENAPI_REPRESENTATION",
                    &lossy(&path),
                    "Unknown tree encoding field cannot be emitted natively",
                    Severity::Warning,
                ));
            }
        }
        if !items.is_empty() {
            diagnostics.push(warning(
                "OPENAPI_RESOURCE_CONTEXT",
                "/resources",
                "Explicit resources are retained; URI/pointer lookup does not validate their contextual types, nested schema IDs, anchors, dynamic scope or reference closure",
            ));
        }
    }
    Ok(diagnostics)
}

fn inspect_native_tree(
    tree: &NativeJsonTree,
    object_schemas: &[(String, crate::schema::CompiledSchema)],
    meta_schemas: &[(String, crate::schema::CompiledSchema)],
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let mut diagnostics = Vec::new();
    let root = tree.root();
    if !matches!(root, NativeJsonNode::Object(_)) {
        diagnostics.push(diagnostic(
            "OPENAPI_ROOT",
            "/root",
            "OpenAPI description must be an object",
            Severity::Error,
        ));
        return Ok(diagnostics);
    }
    let object_members = match tree.root() {
        NativeJsonNode::Object(members) => members,
        _ => unreachable!("root shape checked above"),
    };
    ctx.charge_work(object_members.len(), Utf16::from("/root"))?;
    let version = object_members
        .iter()
        .find(|(name, _)| name == &Utf16::from("openapi"))
        .or_else(|| object_members.iter().find(|(name, _)| name == &Utf16::from("swagger")))
        .map(|(_, value)| value);
    if !matches!(version, Some(NativeJsonNode::String(_))) {
        diagnostics.push(diagnostic(
            "OPENAPI_VERSION",
            "/root",
            "Native openapi or swagger version must be a string",
            Severity::Error,
        ));
    } else {
        let version = match version.unwrap() {
            NativeJsonNode::String(version) => lossy(version),
            _ => unreachable!(),
        };
        let profile = ["2.0", "3.0", "3.1", "3.2"]
            .into_iter()
            .find(|prefix| version.starts_with(prefix));
        if profile.is_none() {
            diagnostics.push(warning(
                "OPENAPI_VERSION_UNSUPPORTED",
                "/root",
                &format!("Native version retained without interpretation: {version}"),
            ));
        } else {
            if let Err(failure) = validate_native_numeric_profile(tree.root(), ctx) {
                if failure.is_control_failure() || failure.code == "LIMIT" { return Err(failure); }
                diagnostics.push(warning(
                    "OPENAPI_NUMERIC",
                    "/root",
                    &format!("Exact numeric tokens retained; host interpretation unavailable: UmfError: {}", lossy(&failure.message)),
                ));
                return Ok(diagnostics);
            }
            let rendered = tree.render_compact(ctx)?;
            let native = serialization::read_json_value(rendered.units(), Format::Json, ctx)?;
            let (_, schema) = object_schemas.iter().find(|(key, _)| Some(key.as_str()) == profile)
                .ok_or_else(|| error("OPENAPI_VALIDATOR", "Pinned OpenAPI validator is unavailable"))?;
            for failure in schema.validate(&native, ctx)? {
                let suffix = failure.instance_path.to_utf8().unwrap_or_default();
                let message = failure.message.to_utf8().unwrap_or_else(|_| "Invalid OpenAPI object".into());
                diagnostics.push(diagnostic(
                    "OPENAPI_OBJECT_SCHEMA",
                    &format!("/root{suffix}"),
                    &message,
                    Severity::Error,
                ));
            }
            diagnostics.extend(inspect_embedded_schemas(&native, profile.unwrap(), meta_schemas, ctx)?);
            diagnostics.push(warning(
                "OPENAPI_VALIDATION_LIMIT",
                "/root",
                "Pinned official-schema checks do not prove reference resolution, URI formats, security execution, parameter serialization or all normative prose rules; known 3.1/3.2 embedded dialect keyword syntax is checked, while instances, unknown dialects and referenced resource contexts remain incomplete; legacy schemas check their declared Schema Object subset; extension content remains source-owned",
            ));
        }
    }
    if tree.has_representation_extras() {
        for path in tree.representation_extra_paths(&Utf16::from("/root"), ctx)? {
            diagnostics.push(diagnostic(
                "OPENAPI_REPRESENTATION",
                &lossy(&path),
                "Unknown tree encoding field cannot be emitted natively",
                Severity::Warning,
            ));
        }
    }
    Ok(diagnostics)
}

fn validate_native_numeric_profile(node: &NativeJsonNode, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    match node {
        NativeJsonNode::Number(token) => {
            crate::json_number::assert_exact_json_number(&Utf16::from(token.as_str()), ctx).map_err(|mut failure| {
                if failure.code == "NUMBER" { failure.message = Utf16::from(native_number_failure(token)); }
                failure
            })
        }
        NativeJsonNode::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            for item in items { validate_native_numeric_profile(item, ctx)?; }
            Ok(())
        }
        NativeJsonNode::Object(members) => {
            ctx.charge_work(members.len(), Utf16::default())?;
            for (_, item) in members { validate_native_numeric_profile(item, ctx)?; }
            Ok(())
        }
        _ => Ok(()),
    }
}

fn native_number_failure(token: &str) -> &'static str {
    if token.starts_with('-') && matches!(token.parse::<f64>(), Ok(number) if number == 0.0 && number.is_sign_negative()) {
        return "Negative zero is outside the numeric profile";
    }
    if !token.bytes().any(|byte| matches!(byte, b'.' | b'e' | b'E')) {
        let digits=token.strip_prefix('-').unwrap_or(token);
        if digits.len()>16 || matches!(digits.parse::<u64>(), Ok(number) if number>9_007_199_254_740_991) {
            return "Integer exceeds exact JavaScript range";
        }
    }
    if matches!(token.parse::<f64>(), Ok(number) if !number.is_finite()) {
        return "JSON number must be finite";
    }
    "Parsing would change the decimal value"
}

fn inspect_embedded_schemas(
    root: &Value,
    version: &str,
    meta_schemas: &[(String, crate::schema::CompiledSchema)],
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    if !matches!(version, "3.1" | "3.2") { return Ok(Vec::new()); }
    let default_dialect = field(root, "jsonSchemaDialect").and_then(as_text).unwrap_or_else(|| {
        if version == "3.1" { "https://spec.openapis.org/oas/3.1/dialect/2024-11-10".to_owned() }
        else { "https://spec.openapis.org/oas/3.2/dialect/2026-02-26".to_owned() }
    });
    let positions = openapi_schema_positions(root, ctx)?;
    let mut out = Vec::new();
    let standard = "https://json-schema.org/draft/2020-12/schema";
    let known = [standard, "https://spec.openapis.org/oas/3.1/dialect/base", "https://spec.openapis.org/oas/3.1/dialect/2024-11-10", "https://spec.openapis.org/oas/3.2/dialect/2026-02-26"];
    let singles = ["not", "if", "then", "else", "items", "contains", "additionalProperties", "unevaluatedProperties", "unevaluatedItems", "propertyNames", "contentSchema"];
    let lists = ["allOf", "anyOf", "oneOf", "prefixItems"];
    let maps = ["$defs", "definitions", "properties", "patternProperties", "dependentSchemas"];
    for (schema, path) in positions {
        let mut pending = vec![(schema, path, default_dialect.to_owned())];
        while let Some((schema, path, inherited)) = pending.pop() {
            if !matches!(schema, Value::Bool(_) | Value::Object(_)) {
                out.push(diagnostic_at_utf16("OPENAPI_SCHEMA_META", &path, "Schema must be an object or boolean", Severity::Error));
                continue;
            }
            let explicit = field(schema, "$schema");
            if explicit.is_some() && !matches!(explicit, Some(Value::String(_))) {
                out.push(diagnostic_at_utf16("OPENAPI_SCHEMA_META", &join_pointer(&path,"$schema"), "Schema dialect must be a string", Severity::Error));
                continue;
            }
            let dialect = explicit.and_then(as_text).unwrap_or(inherited);
            if !known.contains(&dialect.as_str()) {
                out.push(diagnostic_at_utf16("OPENAPI_SCHEMA_DIALECT", &path, &format!("Unknown dialect retained without applying another dialect: {dialect}"), Severity::Warning));
                continue;
            }
            if matches!(schema, Value::Bool(_)) { continue; }
            let schema_fields = object_fields(schema).unwrap_or_default();
            let mut shallow_fields = Vec::new();
            for (name, value) in schema_fields {
                let mut child_paths = Vec::new();
                if singles.contains(&name.to_utf8().unwrap_or_default().as_str()) {
                    child_paths.push((value, join_pointer(&path, &lossy(name))));
                    shallow_fields.push((name.clone(), if matches!(value, Value::Object(_) | Value::Bool(_)) { Value::Bool(true) } else { copy_json(value, ctx)? }));
                } else if lists.iter().any(|keyword| name == &key(keyword)) {
                    if let Value::Array(items) = value {
                        let mut placeholders=Vec::with_capacity(items.len());
                        for (index, item) in items.iter().enumerate() {
                            child_paths.push((item, join_pointer(&join_pointer(&path, &lossy(name)), &index.to_string())));
                            placeholders.push(if matches!(item,Value::Object(_) | Value::Bool(_)) { Value::Bool(true) } else { copy_json(item,ctx)? });
                        }
                        shallow_fields.push((name.clone(), Value::Array(placeholders)));
                    } else { shallow_fields.push((name.clone(), copy_json(value, ctx)?)); }
                } else if maps.iter().any(|keyword| name == &key(keyword)) {
                    if let Value::Object(entries) = value {
                        let mut placeholders = Vec::new();
                        for (child_name, item) in entries {
                            child_paths.push((item, join_pointer_utf16(&join_pointer(&path, &lossy(name)), child_name)));
                            placeholders.push((child_name.clone(), if matches!(item,Value::Object(_) | Value::Bool(_)) { Value::Bool(true) } else { copy_json(item,ctx)? }));
                        }
                        shallow_fields.push((name.clone(), Value::Object(placeholders)));
                    } else { shallow_fields.push((name.clone(), copy_json(value, ctx)?)); }
                } else if name == &key("dependencies") {
                    if let Value::Object(entries) = value {
                        let mut placeholders = Vec::new();
                        for (child_name, item) in entries {
                            if matches!(item, Value::Object(_) | Value::Bool(_)) {
                                child_paths.push((item, join_pointer_utf16(&join_pointer(&path, "dependencies"), child_name)));
                                placeholders.push((child_name.clone(), Value::Bool(true)));
                            } else { placeholders.push((child_name.clone(), copy_json(item, ctx)?)); }
                        }
                        shallow_fields.push((name.clone(), Value::Object(placeholders)));
                    } else { shallow_fields.push((name.clone(), copy_json(value, ctx)?)); }
                } else { shallow_fields.push((name.clone(), copy_json(value, ctx)?)); }
                child_paths.reverse();
                pending.extend(child_paths.into_iter().map(|(child, child_path)| (child, child_path, dialect.clone())));
            }
            let shallow = Value::Object(shallow_fields);
            let standard_shallow = match &shallow {
                Value::Object(fields) => {
                    ctx.charge_work(fields.len(), path.clone())?;
                    Value::Object(fields.iter().filter(|(name,_)| name != &key("$schema")).cloned().collect())
                },
                _ => shallow.clone(),
            };
            if let Err(failure) = crate::schema::CompiledSchema::validate_consumer_metaschema_only(&standard_shallow, ctx) {
                if failure.is_control_failure() || failure.code == "LIMIT" { return Err(failure); }
                out.push(diagnostic_at_utf16("OPENAPI_SCHEMA_META", &path, &lossy(&failure.message), Severity::Error));
            }
            if dialect != standard {
                if let Some((_, validator)) = meta_schemas.iter().find(|(key, _)| key == version) {
                    for failure in validator.validate(&shallow, ctx)? {
                        let suffix=Utf16::from(failure.instance_path.to_utf8().unwrap_or_default());
                        out.push(diagnostic_at_utf16("OPENAPI_SCHEMA_META", &append_utf16(&path,&suffix), &lossy(&failure.message), Severity::Error));
                    }
                }
            }
            if field(schema, "$vocabulary").is_some() {
                out.push(diagnostic_at_utf16("OPENAPI_SCHEMA_VOCABULARY", &join_pointer(&path,"$vocabulary"), "Custom vocabulary interpretation is not established by this meta-schema check", Severity::Warning));
            }
        }
    }
    Ok(out)
}

fn openapi_schema_positions<'a>(root: &'a Value, ctx: &mut Context<'_>) -> Result<Vec<( &'a Value, Utf16)>, EngineError> {
    // Charge the complete native view before traversing nested maps/arrays.
    let _charged_copy = copy_json(root, ctx)?;
    fn map_objects<'a>(value: Option<&'a Value>, path: &Utf16, out: &mut Vec<(&'a Value, Utf16)>, f: fn(&'a Value, Utf16, &mut Vec<(&'a Value, Utf16)>)) {
        if let Some(Value::Object(items)) = value { for (name, child) in items { f(child, join_pointer_utf16(path, name), out); } }
    }
    fn array_objects<'a>(value: Option<&'a Value>, path: &Utf16, out: &mut Vec<(&'a Value, Utf16)>, f: fn(&'a Value, Utf16, &mut Vec<(&'a Value, Utf16)>)) {
        if let Some(Value::Array(items)) = value { for (index, child) in items.iter().enumerate() { f(child, join_pointer(path, &index.to_string()), out); } }
    }
    fn schema<'a>(value: &'a Value, path: Utf16, out: &mut Vec<(&'a Value, Utf16)>) { out.push((value, path)); }
    fn encoding<'a>(value: &'a Value, path: Utf16, out: &mut Vec<(&'a Value, Utf16)>) {
        map_objects(field(value,"headers"),&join_pointer(&path,"headers"),out,parameter);
        map_objects(field(value,"encoding"),&join_pointer(&path,"encoding"),out,encoding);
        array_objects(field(value,"prefixEncoding"),&join_pointer(&path,"prefixEncoding"),out,encoding);
        if let Some(item)=field(value,"itemEncoding") { encoding(item,join_pointer(&path,"itemEncoding"),out); }
    }
    fn media<'a>(value: &'a Value, path: Utf16, out: &mut Vec<(&'a Value, Utf16)>) { schema_member(value, "schema", &path, out); schema_member(value, "itemSchema", &path, out); encoding(value,path,out); }
    fn schema_member<'a>(value: &'a Value, name: &str, path: &Utf16, out: &mut Vec<(&'a Value, Utf16)>) { if let Some(child) = field(value, name) { schema(child, join_pointer(path, name), out); } }
    fn parameter<'a>(value: &'a Value, path: Utf16, out: &mut Vec<(&'a Value, Utf16)>) { schema_member(value,"schema",&path,out); map_objects(field(value,"content"),&join_pointer(&path,"content"),out,media); }
    fn content<'a>(value: &'a Value, path: Utf16, out: &mut Vec<(&'a Value, Utf16)>) { if let Some(child)=field(value,"content") { map_objects(Some(child),&join_pointer(&path,"content"),out,media); } }
    fn response<'a>(value: &'a Value, path: Utf16, out: &mut Vec<(&'a Value, Utf16)>) { content(value,path.clone(),out); map_objects(field(value,"headers"),&join_pointer(&path,"headers"),out,parameter); }
    fn request_body<'a>(value: &'a Value, path: Utf16, out: &mut Vec<(&'a Value, Utf16)>) { content(value,path,out); }
    fn path_item<'a>(value: &'a Value, path: Utf16, out: &mut Vec<(&'a Value, Utf16)>) {
        array_objects(field(value,"parameters"),&join_pointer(&path,"parameters"),out,parameter);
        for method in ["get","put","post","delete","options","head","patch","trace","query"] { if let Some(operation)=field(value,method) { operation_fn(operation,join_pointer(&path,method),out); } }
        map_objects(field(value,"additionalOperations"),&join_pointer(&path,"additionalOperations"),out,operation_fn);
    }
    fn callback<'a>(value: &'a Value, path: Utf16, out: &mut Vec<(&'a Value, Utf16)>) { if let Value::Object(entries)=value { for (name,child) in entries { if !lossy(name).starts_with("x-") && matches!(child,Value::Object(_)) { path_item(child,join_pointer_utf16(&path,name),out); } } } }
    fn operation_fn<'a>(value: &'a Value, path: Utf16, out: &mut Vec<(&'a Value, Utf16)>) {
        array_objects(field(value,"parameters"),&join_pointer(&path,"parameters"),out,parameter);
        if let Some(body)=field(value,"requestBody") { request_body(body,join_pointer(&path,"requestBody"),out); }
        if let Some(responses)=field(value,"responses") { if let Value::Object(items)=responses { for (name,child) in items { let key=lossy(name); if key=="default" || (key.len()==3 && (b'1'..=b'5').contains(&key.as_bytes()[0]) && key.as_bytes()[1..].iter().all(|b| b.is_ascii_digit() || *b==b'X' || *b==b'x')) { response(child,join_pointer(&join_pointer(&path,"responses"),&key),out); } } } }
        map_objects(field(value,"callbacks"),&join_pointer(&path,"callbacks"),out,callback);
    }
    let mut out=Vec::new();
    let paths=field(root,"paths");
    if let Some(Value::Object(items))=paths { for (name,child) in items { if name.units().first()==Some(&(b'/' as u16)) { path_item(child,join_pointer_utf16(&join_pointer(&Utf16::default(),"paths"),name),&mut out); } } }
    map_objects(field(root,"webhooks"),&join_pointer(&Utf16::default(),"webhooks"),&mut out,path_item);
    if let Some(components)=field(root,"components") {
        let component_path=join_pointer(&Utf16::default(),"components");
        map_objects(field(components,"schemas"),&join_pointer(&component_path,"schemas"),&mut out,schema);
        for key_name in ["parameters","headers"] { map_objects(field(components,key_name),&join_pointer(&component_path,key_name),&mut out,parameter); }
        map_objects(field(components,"responses"),&join_pointer(&component_path,"responses"),&mut out,response);
        map_objects(field(components,"requestBodies"),&join_pointer(&component_path,"requestBodies"),&mut out,request_body);
        map_objects(field(components,"callbacks"),&join_pointer(&component_path,"callbacks"),&mut out,callback);
        map_objects(field(components,"pathItems"),&join_pointer(&component_path,"pathItems"),&mut out,path_item);
        map_objects(field(components,"mediaTypes"),&join_pointer(&component_path,"mediaTypes"),&mut out,media);
    }
    ctx.charge_work(out.len(), Utf16::default())?;
    Ok(out)
}

fn join_pointer(base: &Utf16, segment: &str) -> Utf16 {
    join_pointer_units(base, segment.encode_utf16())
}

fn join_pointer_utf16(base: &Utf16, segment: &Utf16) -> Utf16 {
    join_pointer_units(base, segment.units().iter().copied())
}

fn join_pointer_units(base: &Utf16, units: impl Iterator<Item = u16>) -> Utf16 {
    let mut result = base.units().to_vec();
    while result.last() == Some(&(b'/' as u16)) { result.pop(); }
    result.push(b'/' as u16);
    for unit in units {
        match unit {
            0x7e => result.extend([0x7e, b'0' as u16]),
            0x2f => result.extend([0x7e, b'1' as u16]),
            _ => result.push(unit),
        }
    }
    Utf16::new(result)
}

fn append_utf16(base: &Utf16, suffix: &Utf16) -> Utf16 {
    let mut units = base.units().to_vec();
    units.extend_from_slice(suffix.units());
    Utf16::new(units)
}

fn as_text(value: &Value) -> Option<String> {
    // JavaScript's URL/string consumers replace unpaired UTF-16 surrogates
    // with U+FFFD when materializing a host string. Keep the same string-kind
    // acceptance while retaining the original UTF-16 in the native tree.
    match value { Value::String(text) => Some(lossy(text)), _ => None }
}

fn assemble_document(id: &Utf16, payload: &OpenapiPayload, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(id.len().saturating_add(payload.original_source.len()), Utf16::default())?;
    if let Some(uri) = &payload.base_uri {
        ctx.charge_work(uri.len(), Utf16::default())?;
    }
    let mut payload_fields = vec![
        (key("profile"), Value::string_utf8(PROFILE)),
        (key("root"), payload.root.tagged_value_preserving_extras(ctx)?),
        (key("originalSource"), Value::String(payload.original_source.clone())),
        (key("originalFormat"), Value::string_utf8(payload.original_format.as_str())),
    ];
    if let Some(base_uri) = &payload.base_uri {
        payload_fields.push((key("baseUri"), Value::String(base_uri.clone())));
    }
    if !payload.resources.is_empty() {
        ctx.charge_work(payload.resources.len(), Utf16::default())?;
        let mut resources = Vec::with_capacity(payload.resources.len());
        for resource in &payload.resources {
            ctx.charge_work(
                resource.uri.len().saturating_add(resource.original_source.len()),
                Utf16::default(),
            )?;
            let mut fields = vec![
                (key("uri"), Value::String(resource.uri.clone())),
                (key("root"), resource.root.tagged_value_preserving_extras(ctx)?),
                (key("originalSource"), Value::String(resource.original_source.clone())),
                (key("originalFormat"), Value::string_utf8(resource.original_format.as_str())),
            ];
            for (name, value) in &resource.representation_extras {
                fields.push((name.clone(), copy_json(value, ctx)?));
            }
            resources.push(Value::Object(fields));
        }
        payload_fields.push((key("resources"), Value::Array(resources)));
    }
    for (name, value) in &payload.representation_extras {
        ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
        payload_fields.push((name.clone(), copy_json(value, ctx)?));
    }
    Ok(Value::Object(vec![
        (key("umf"), Value::string_utf8(CORE_VERSION)),
        (key("id"), Value::String(id.clone())),
        (
            key("vocabularies"),
            Value::Object(vec![(
                key(EXTENSION),
                Value::Object(vec![(key("version"), Value::string_utf8(EXTENSION_VERSION))]),
            )]),
        ),
        (
            key("modules"),
            Value::Array(vec![Value::Object(vec![
                (key("id"), Value::string_utf8("schema")),
                (key("namespace"), Value::string_utf8("")),
                (
                    key("elements"),
                    Value::Array(vec![Value::Object(vec![
                        (key("id"), Value::string_utf8("schema")),
                        (
                            key("extensions"),
                            Value::Object(vec![(
                                key(EXTENSION),
                                Value::Object(payload_fields),
                            )]),
                        ),
                    ])]),
                ),
            ])]),
        ),
    ]))
}

/// Copy the owning document and replace only the OpenAPI payload. This keeps
/// unrelated vocabularies, modules, element extensions and metadata intact.
fn replace_openapi_payload(
    document: &Value,
    payload: &OpenapiPayload,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let id = payload_document_id(document, ctx)?;
    let canonical = assemble_document(&id, payload, ctx)?;
    let replacement = field(canonical_element(&canonical)?, "extensions")
        .and_then(|extensions| field(extensions, EXTENSION))
        .ok_or_else(|| error("OPENAPI_PAYLOAD", "Missing assembled OpenAPI payload"))?;
    let replacement = copy_json(replacement, ctx)?;
    let mut candidate = copy_json(document, ctx)?;
    let modules = field_mut(&mut candidate, "modules").and_then(as_array_mut)
        .ok_or_else(|| error("OPENAPI_DOCUMENT", "Missing schema module"))?;
    let module_index = modules.iter().position(|module| text_is(field(module, "id"), "schema"))
        .ok_or_else(|| error("OPENAPI_DOCUMENT", "Missing schema module"))?;
    let module = &mut modules[module_index];
    let elements = field_mut(module, "elements").and_then(as_array_mut)
        .ok_or_else(|| error("OPENAPI_DOCUMENT", "Missing schema element"))?;
    let element_index = elements.iter().position(|element| text_is(field(element, "id"), "schema"))
        .ok_or_else(|| error("OPENAPI_DOCUMENT", "Missing schema element"))?;
    let element = &mut elements[element_index];
    let extensions = field_mut(element, "extensions")
        .ok_or_else(|| error("OPENAPI_DOCUMENT", "Missing schema element extensions"))?;
    set_object_field(extensions, EXTENSION, replacement)?;
    Ok(candidate)
}

fn canonical_element(document: &Value) -> Result<&Value, EngineError> {
    field(document, "modules").and_then(as_array)
        .and_then(|modules| modules.iter().find(|module| text_is(field(module,"id"),"schema")))
        .and_then(|module| field(module,"elements").and_then(as_array))
        .and_then(|elements| elements.iter().find(|element| text_is(field(element,"id"),"schema")))
        .ok_or_else(|| error("OPENAPI_PAYLOAD", "Missing assembled schema element"))
}

fn field_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    match value {
        Value::Object(fields) => {
            let index = fields.iter().position(|(key, _)| key == &Utf16::from(name))?;
            Some(&mut fields[index].1)
        }
        _ => None,
    }
}

fn as_array_mut(value: &mut Value) -> Option<&mut Vec<Value>> {
    match value { Value::Array(items) => Some(items), _ => None }
}

fn set_object_field(object: &mut Value, name: &str, value: Value) -> Result<(), EngineError> {
    let Value::Object(fields)=object else { return Err(error("OPENAPI_DOCUMENT", "Expected object field container")); };
    if let Some(index)=fields.iter().position(|(key,_)| key==&Utf16::from(name)) { fields[index].1=value; }
    else { fields.push((Utf16::from(name),value)); }
    Ok(())
}

struct SelectedResource<'a> {
    root: &'a NativeJsonTree,
}

fn select_resource<'a>(
    payload: &'a OpenapiPayload,
    uri: Option<&Utf16>,
    ctx: &mut Context<'_>,
) -> Result<SelectedResource<'a>, EngineError> {
    let Some(uri) = uri else {
        return Ok(SelectedResource { root: &payload.root });
    };
    let wanted = canonical_document_uri(uri, ctx)?;
    if payload.base_uri.as_ref() == Some(&wanted) {
        return Ok(SelectedResource { root: &payload.root });
    }
    ctx.charge_work(payload.resources.len(), Utf16::default())?;
    let resource = payload
        .resources
        .iter()
        .find(|resource| resource.uri == wanted)
        .ok_or_else(|| error("OPENAPI_RESOURCE_MISSING", "Resource was not supplied"))?;
    Ok(SelectedResource { root: &resource.root })
}

fn select_root_mut<'a>(
    payload: &'a mut OpenapiPayload,
    uri: Option<&Utf16>,
    ctx: &mut Context<'_>,
) -> Result<&'a mut NativeJsonTree, EngineError> {
    let uri = uri
        .map(|uri| canonical_document_uri(uri, ctx))
        .transpose()?;
    if uri.as_ref().is_none() || payload.base_uri.as_ref() == uri.as_ref() {
        return Ok(&mut payload.root);
    }
    ctx.charge_work(payload.resources.len(), Utf16::default())?;
    payload
        .resources
        .iter_mut()
        .find(|resource| Some(&resource.uri) == uri.as_ref())
        .map(|resource| &mut resource.root)
        .ok_or_else(|| error("OPENAPI_RESOURCE_MISSING", "Resource was not supplied"))
}

fn emit_native(
    tree: &NativeJsonTree,
    original_source: &Utf16,
    original_format: OpenapiFormat,
    target_format: OpenapiFormat,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let archived = original_format.parse(original_source, ctx)?;
    if original_format == target_format && &archived == tree {
        return Ok(original_source.clone());
    }
    // Native JSON output is also valid YAML 1.2; source layout remains in the
    // archived source when the current tree differs.
    let _ = target_format;
    let rendered = tree.render_compact(ctx)?;
    ctx.charge_text(1, Utf16::default())?;
    let mut units = rendered.into_units();
    units.push(b'\n' as u16);
    Ok(Utf16::new(units))
}

fn reject_native_representation(payload: &OpenapiPayload) -> Result<(), EngineError> {
    if !payload.representation_extras.is_empty()
        || payload.root.has_representation_extras()
        || payload.resources.iter().any(|resource| resource.root.has_representation_extras() || !resource.representation_extras.is_empty())
    {
        return Err(error(
            "OPENAPI_REPRESENTATION",
            "Native export would discard representation content",
        ));
    }
    Ok(())
}

fn canonical_document_uri(uri: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_work(uri.len(), Utf16::default())?;
    let raw = lossy(uri);
    let parsed = Url::parse(&raw).map_err(|failure| error("OPENAPI_RESOURCE_URI", failure.to_string()))?;
    if parsed.fragment().is_some() {
        return Err(error(
            "OPENAPI_RESOURCE_URI",
            "Document URI cannot contain a fragment",
        ));
    }
    ctx.charge_work(parsed.as_str().encode_utf16().count(), Utf16::default())?;
    Ok(Utf16::from(parsed.as_str()))
}

fn percent_decode_fragment(fragment: &str, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_work(fragment.len(), Utf16::default())?;
    let bytes = percent_decode(fragment)?;
    let text = String::from_utf8(bytes)
        .map_err(|_| error("OPENAPI_REFERENCE", "Fragment is not valid UTF-8"))?;
    Ok(Utf16::from(text))
}

fn percent_decode(input: &str) -> Result<Vec<u8>, EngineError> {
    let bytes = input.as_bytes();
    let mut result = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err(error("OPENAPI_REFERENCE", "Malformed URI fragment escape"));
            }
            let high = hex(bytes[index + 1]).ok_or_else(|| error("OPENAPI_REFERENCE", "Malformed URI fragment escape"))?;
            let low = hex(bytes[index + 2]).ok_or_else(|| error("OPENAPI_REFERENCE", "Malformed URI fragment escape"))?;
            result.push(high * 16 + low);
            index += 3;
        } else {
            result.push(bytes[index]);
            index += 1;
        }
    }
    Ok(result)
}

fn hex(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

fn payload_document_id(document: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    match field(document, "id") {
        Some(Value::String(id)) => {
            ctx.charge_work(id.len(), Utf16::default())?;
            Ok(id.clone())
        }
        _ => Err(error("OPENAPI_DOCUMENT", "Missing document id")),
    }
}

fn parse_format(value: Option<&Value>) -> Result<OpenapiFormat, EngineError> {
    if text_is(value, "json") {
        Ok(OpenapiFormat::Json)
    } else if text_is(value, "yaml") {
        Ok(OpenapiFormat::Yaml)
    } else {
        Err(error("OPENAPI_FORMAT", "Expected explicit JSON or YAML format"))
    }
}

fn validation_error(code: &str, validation: Validation) -> EngineError {
    let mut message = String::new();
    for (index, diagnostic) in validation.diagnostics.iter().enumerate() {
        if index > 0 { message.push('\n'); }
        message.push_str(&lossy(&diagnostic.code));
        message.push_str(": ");
        message.push_str(&lossy(&diagnostic.message));
    }
    error(code, message)
}

fn diagnostic(code: &str, path: &str, message: &str, severity: Severity) -> Diagnostic {
    Diagnostic {
        code: Utf16::from(code),
        path: Utf16::from(path),
        python_source_path: false,
        message: Utf16::from(message),
        severity,
        python_text_origin: None,
    }
}

fn diagnostic_at_utf16(code: &str, path: &Utf16, message: &str, severity: Severity) -> Diagnostic {
    Diagnostic {
        code: Utf16::from(code),
        path: path.clone(),
        python_source_path: false,
        message: Utf16::from(message),
        severity,
        python_text_origin: None,
    }
}

fn warning(code: &str, path: &str, message: &str) -> Diagnostic {
    diagnostic(code, path, message, Severity::Warning)
}

fn key(value: &str) -> Utf16 { Utf16::from(value) }

fn error(code: &str, message: impl Into<String>) -> EngineError {
    EngineError::new(code, Utf16::default(), Utf16::from(message.into()))
}

fn field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields.iter().find(|(key, _)| key == &Utf16::from(name)).map(|(_, value)| value),
        _ => None,
    }
}

fn object_fields(value: &Value) -> Option<&[(Utf16, Value)]> {
    match value { Value::Object(fields) => Some(fields), _ => None }
}

fn as_array(value: &Value) -> Option<&[Value]> {
    match value { Value::Array(items) => Some(items), _ => None }
}

fn text_is(value: Option<&Value>, expected: &str) -> bool {
    matches!(value, Some(Value::String(actual)) if actual == &Utf16::from(expected))
}

fn text_copy(value: Option<&Value>, ctx: &mut Context<'_>) -> Result<Option<Utf16>, EngineError> {
    match value {
        Some(Value::String(value)) => {
            ctx.charge_work(value.len(), Utf16::default())?;
            Ok(Some(value.clone()))
        }
        _ => Ok(None),
    }
}

fn lossy(value: &Utf16) -> String {
    String::from_utf16_lossy(value.units())
}

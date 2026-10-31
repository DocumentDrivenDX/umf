// SPDX-License-Identifier: MIT OR Apache-2.0
//! JSON-LD source-preservation and bounded processor proposal kernel for
//! CONTRACT-026. Processor proposals are incomplete, report-only candidates;
//! they do not claim full JSON-LD, RDF, or ontology conformance.
use std::{
    cell::RefCell,
    collections::{BTreeMap, BTreeSet},
    error::Error as StdError,
    fmt,
    fmt::Write as FmtWrite,
};

use crate::{
    context::Context,
    engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    native_json::{NativeJsonNode, NativeJsonTree},
    registry::Registry,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use json_ld::syntax::Parse as _;

const CORE_VERSION: &str = "0.10.0";
pub const JSONLD_EXTENSION: &str = "umf.jsonld";
const EXTENSION_VERSION: &str = "0.1.0";

#[derive(Clone, Debug)]
pub struct JsonLdContextInput {
    pub url: Utf16,
    pub document_url: Option<Utf16>,
    pub source: Utf16,
}

#[derive(Clone, Debug, PartialEq)]
pub struct JsonLdContext {
    pub url: Utf16,
    pub document_url: Utf16,
    pub root: NativeJsonTree,
    pub original_source: Utf16,
}

#[derive(Clone, Debug, PartialEq)]
pub struct JsonLdPayload {
    pub processing_mode: Utf16,
    pub base_iri: Utf16,
    pub root: NativeJsonTree,
    pub original_source: Utf16,
    pub contexts: Vec<JsonLdContext>,
    pub expand_context: Option<NativeJsonTree>,
}

/// Owns the pinned core model, authored JSON-LD extension schema, and per-call
/// processor resources. Remote contexts are restricted to caller-supplied data.
pub struct JsonLdRuntime {
    engine: Engine,
    registry: Registry,
}

impl JsonLdRuntime {
    pub fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        fn read(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
            let units = source.encode_utf16().collect::<Vec<_>>();
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
        let package = read(
            include_str!("../../../spec/extensions/jsonld/package.json"),
            ctx,
        )?;
        let schema_resources = engine.schema_resources_with_context(ctx)?;
        let mut registry = Registry::new();
        registry.register(
            &package,
            Some(26),
            engine.package_schema(),
            &schema_resources,
            ctx,
        )?;
        Ok(Self { engine, registry })
    }

    pub fn inspect_document(
        &self,
        document: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Validation, EngineError> {
        self.engine
            .validate_document(document, &self.registry, &mut JsonLdCapabilities, ctx)
    }
}

struct JsonLdCapabilities;
impl Capabilities for JsonLdCapabilities {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Err(Utf16::from(
            "JSON-LD inspection requires the invocation Context",
        ))
    }

    fn validate_extension_with_context(
        &mut self,
        _token: u64,
        payload: &Value,
        context: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        if !context
            .path
            .units()
            .ends_with(Utf16::from("/extensions/umf.jsonld").units())
        {
            return Ok(Vec::new());
        }
        inspect_payload(payload, &context.path, ctx).map_err(CapabilityError::Engine)
    }
}

fn diagnostic(
    code: &str,
    path: &Utf16,
    message: impl Into<Utf16>,
    severity: Severity,
) -> Diagnostic {
    Diagnostic {
        code: Utf16::from(code),
        path: path.clone(),
        message: message.into(),
        severity,
        python_source_path: false,
        python_text_origin: None,
    }
}

fn field<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(name, _)| name == &Utf16::from(key))
        .map(|(_, value)| value)
}

fn string(value: Option<&Value>) -> Option<&Utf16> {
    match value {
        Some(Value::String(value)) => Some(value),
        _ => None,
    }
}

fn clone_text(value: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_text(value.len(), Utf16::default())?;
    Ok(value.clone())
}

fn parse_absolute(value: &Utf16, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    ctx.charge_text(value.len(), Utf16::default())?;
    let raw = value
        .to_utf8()
        .map_err(|_| error("JSONLD_IRI", "Expected an absolute URL"))?;
    url::Url::parse(&raw).map_err(|_| error("JSONLD_IRI", "Expected an absolute URL"))?;
    Ok(())
}

fn error(code: &str, message: &'static str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

fn error_owned(code: &str, message: String) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

fn inspect_payload(
    payload: &Value,
    path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let mut diagnostics = vec![diagnostic(
        "JSONLD_CONTEXT",
        path,
        "Source representation only; semantic expansion is separate. Exact source, unknown native values, and numeric tokens remain archived. RDF conversion, ontology validation, and retrieval are not asserted.",
        Severity::Warning,
    )];
    let Value::Object(fields) = payload else {
        return Ok(vec![diagnostic(
            "JSONLD_SOURCE",
            path,
            "Expected JSON-LD source payload",
            Severity::Error,
        )]);
    };
    ctx.charge_work(fields.len(), path.clone())?;
    let allowed = [
        "profile",
        "processingMode",
        "baseIRI",
        "root",
        "originalSource",
        "contexts",
        "expandContext",
    ];
    if fields
        .iter()
        .any(|(key, _)| !allowed.iter().any(|allowed| key == &Utf16::from(*allowed)))
    {
        diagnostics.push(diagnostic(
            "JSONLD_REPRESENTATION",
            path,
            "Unknown representation fields are retained and block native export",
            Severity::Warning,
        ));
    }
    if string(field(payload, "profile")) != Some(&Utf16::from("jsonld-source")) {
        diagnostics.push(diagnostic(
            "JSONLD_SOURCE",
            path,
            "Expected JSON-LD source profile",
            Severity::Error,
        ));
    }
    if !matches!(
        string(field(payload, "processingMode"))
            .filter(|mode| {
                // Do not allocate a UTF-8 copy of an unbounded mode value.
                mode.len() <= 11
            })
            .map(Utf16::to_utf8)
            .transpose()
            .ok()
            .flatten()
            .as_deref(),
        Some("json-ld-1.0" | "json-ld-1.1")
    ) {
        diagnostics.push(diagnostic(
            "JSONLD_SOURCE",
            path,
            "Unsupported JSON-LD processing mode",
            Severity::Error,
        ));
    }
    let Some(base_iri) = string(field(payload, "baseIRI")) else {
        diagnostics.push(diagnostic(
            "JSONLD_IRI",
            path,
            "Expected an absolute base IRI",
            Severity::Error,
        ));
        return Ok(diagnostics);
    };
    let base_valid = match parse_absolute(base_iri, ctx) {
        Ok(()) => true,
        Err(failure) if failure.is_control_failure() || failure.code == "LIMIT" => {
            return Err(failure)
        }
        Err(_) => false,
    };
    if base_iri.is_empty() || base_iri.len() > 4096 || !base_valid {
        diagnostics.push(diagnostic(
            "JSONLD_IRI",
            path,
            "Expected an absolute base IRI of at most 4096 UTF-16 units",
            Severity::Error,
        ));
    }
    let Some(original_source) = string(field(payload, "originalSource")) else {
        diagnostics.push(diagnostic(
            "JSONLD_SOURCE",
            path,
            "Original source text is required",
            Severity::Error,
        ));
        return Ok(diagnostics);
    };
    if original_source.len() > 4_000_000 {
        diagnostics.push(diagnostic(
            "JSONLD_SOURCE",
            path,
            "Original source exceeds the 4000000-unit limit",
            Severity::Error,
        ));
    } else if let Err(failure) = NativeJsonTree::parse_json(original_source.units(), ctx) {
        if failure.is_control_failure() || failure.code == "LIMIT" {
            return Err(failure);
        }
        diagnostics.push(diagnostic(
            "JSONLD_SOURCE",
            path,
            failure.message,
            Severity::Error,
        ));
    }
    inspect_tree(
        field(payload, "root"),
        &append(path, "root"),
        &mut diagnostics,
        ctx,
    )?;
    if let Some(contexts) = field(payload, "contexts") {
        let Value::Array(contexts) = contexts else {
            diagnostics.push(diagnostic(
                "JSONLD_SOURCE",
                path,
                "Contexts must be an array",
                Severity::Error,
            ));
            return Ok(diagnostics);
        };
        if contexts.len() > 100 {
            diagnostics.push(diagnostic(
                "JSONLD_SOURCE",
                path,
                "At most 100 supplied contexts are allowed",
                Severity::Error,
            ));
            return Ok(diagnostics);
        }
        ctx.charge_work(contexts.len(), path.clone())?;
        let mut urls = BTreeSet::new();
        for (index, item) in contexts.iter().enumerate() {
            let item_path = append(path, &format!("contexts/{index}"));
            let Some(url) = string(field(item, "url")) else {
                diagnostics.push(diagnostic(
                    "JSONLD_IRI",
                    &item_path,
                    "Context URL is required",
                    Severity::Error,
                ));
                continue;
            };
            let Some(document_url) = string(field(item, "documentUrl")) else {
                diagnostics.push(diagnostic(
                    "JSONLD_IRI",
                    &item_path,
                    "Context documentUrl is required",
                    Severity::Error,
                ));
                continue;
            };
            for candidate in [url, document_url] {
                match parse_absolute(candidate, ctx) {
                    Ok(()) => {}
                    Err(failure) if failure.is_control_failure() || failure.code == "LIMIT" => {
                        return Err(failure)
                    }
                    Err(_) => diagnostics.push(diagnostic(
                        "JSONLD_IRI",
                        &item_path,
                        "Context URL must be absolute",
                        Severity::Error,
                    )),
                }
            }
            ctx.charge_work(url.len().saturating_add(1), item_path.clone())?;
            if !urls.insert(url.clone()) {
                diagnostics.push(diagnostic(
                    "JSONLD_SOURCE",
                    &item_path,
                    "Duplicate supplied context URL",
                    Severity::Error,
                ));
            }
            let Some(source) = string(field(item, "originalSource")) else {
                diagnostics.push(diagnostic(
                    "JSONLD_SOURCE",
                    &item_path,
                    "Context source text is required",
                    Severity::Error,
                ));
                continue;
            };
            if source.len() > 4_000_000 {
                diagnostics.push(diagnostic(
                    "JSONLD_SOURCE",
                    &item_path,
                    "Context source exceeds the 4000000-unit limit",
                    Severity::Error,
                ));
            } else if let Err(failure) = NativeJsonTree::parse_json(source.units(), ctx) {
                if failure.is_control_failure() || failure.code == "LIMIT" {
                    return Err(failure);
                }
                diagnostics.push(diagnostic(
                    "JSONLD_SOURCE",
                    &item_path,
                    failure.message,
                    Severity::Error,
                ));
            }
            inspect_tree(
                field(item, "root"),
                &append(&item_path, "root"),
                &mut diagnostics,
                ctx,
            )?;
            if let Value::Object(context_fields) = item {
                if context_fields.iter().any(|(key, _)| {
                    !["url", "documentUrl", "root", "originalSource"]
                        .iter()
                        .any(|allowed| key == &Utf16::from(*allowed))
                }) {
                    diagnostics.push(diagnostic(
                        "JSONLD_REPRESENTATION",
                        &item_path,
                        "Unknown context fields are retained and block native export",
                        Severity::Warning,
                    ));
                }
            }
        }
    } else {
        diagnostics.push(diagnostic(
            "JSONLD_SOURCE",
            path,
            "Contexts array is required",
            Severity::Error,
        ));
    }
    if field(payload, "expandContext").is_some() {
        inspect_tree(
            field(payload, "expandContext"),
            &append(path, "expandContext"),
            &mut diagnostics,
            ctx,
        )?;
    }
    Ok(diagnostics)
}

/// Inspect one pinned JSON-LD payload using the caller's shared resource context.
pub fn inspect_jsonld_payload(
    payload: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    inspect_payload(payload, &Utf16::default(), ctx)
}

fn inspect_tree(
    value: Option<&Value>,
    path: &Utf16,
    diagnostics: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Some(value) = value else {
        diagnostics.push(diagnostic(
            "JSONLD_SOURCE",
            path,
            "Native JSON tree is required",
            Severity::Error,
        ));
        return Ok(());
    };
    match NativeJsonTree::from_tagged_value(value, ctx) {
        Ok(tree) => {
            if tree.has_representation_extras() {
                diagnostics.push(diagnostic(
                    "JSONLD_REPRESENTATION",
                    path,
                    "Unknown native representation fields are retained and block native export",
                    Severity::Warning,
                ));
            }
        }
        Err(failure) if failure.is_control_failure() || failure.code == "LIMIT" => {
            return Err(failure)
        }
        Err(failure) => diagnostics.push(diagnostic(
            "JSONLD_SOURCE",
            path,
            failure.message,
            Severity::Error,
        )),
    }
    Ok(())
}

fn append(path: &Utf16, suffix: &str) -> Utf16 {
    let mut units = path.units().to_vec();
    if !units.is_empty() && units.last() != Some(&(b'/' as u16)) {
        units.push(b'/' as u16);
    }
    units.extend(suffix.encode_utf16());
    Utf16::new(units)
}

pub fn import_jsonld_document(
    source: &Utf16,
    id: &Utf16,
    base_iri: &Utf16,
    processing_mode: Option<&Utf16>,
    contexts: &[JsonLdContextInput],
    expand_context: Option<&Utf16>,
    runtime: &JsonLdRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if contexts.len() > 100 {
        return Err(error(
            "JSONLD_CONTEXT_LIMIT",
            "At most 100 supplied contexts are allowed",
        ));
    }
    ctx.charge_work(contexts.len(), Utf16::default())?;
    ctx.charge_text(source.len(), Utf16::default())?;
    ctx.charge_text(id.len(), Utf16::default())?;
    ctx.charge_text(base_iri.len(), Utf16::default())?;
    let mode = processing_mode
        .map(|value| clone_text(value, ctx))
        .transpose()?
        .unwrap_or_else(|| Utf16::from("json-ld-1.1"));
    let root = NativeJsonTree::parse_json(source.units(), ctx)?;
    let mut parsed_contexts = Vec::with_capacity(contexts.len());
    for input in contexts {
        ctx.charge_text(input.url.len(), Utf16::default())?;
        if let Some(document_url) = &input.document_url {
            ctx.charge_text(document_url.len(), Utf16::default())?;
        }
        ctx.charge_text(input.source.len(), Utf16::default())?;
        let document_url = match &input.document_url {
            Some(value) => clone_text(value, ctx)?,
            None => clone_text(&input.url, ctx)?,
        };
        let root = NativeJsonTree::parse_json(input.source.units(), ctx)?;
        parsed_contexts.push(JsonLdContext {
            url: clone_text(&input.url, ctx)?,
            document_url,
            root,
            original_source: clone_text(&input.source, ctx)?,
        });
    }
    let expand_context = expand_context
        .map(|source| NativeJsonTree::parse_json(source.units(), ctx))
        .transpose()?;
    let payload = JsonLdPayload {
        processing_mode: mode,
        base_iri: clone_text(base_iri, ctx)?,
        root,
        original_source: clone_text(source, ctx)?,
        contexts: parsed_contexts,
        expand_context,
    };
    let document = assemble_document(id, &payload, ctx)?;
    let validation = runtime.inspect_document(&document, ctx)?;
    if !validation.valid {
        return Err(validation_error("JSONLD_SOURCE", &validation));
    }
    Ok(document)
}

pub fn inspect_jsonld_document(
    document: &Value,
    runtime: &JsonLdRuntime,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    runtime.inspect_document(document, ctx)
}

pub fn export_jsonld_document(
    document: &Value,
    runtime: &JsonLdRuntime,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let validation = runtime.inspect_document(document, ctx)?;
    if !validation.valid {
        return Err(validation_error("JSONLD_DOCUMENT", &validation));
    }
    if validation
        .diagnostics
        .iter()
        .any(|item| item.code == Utf16::from("JSONLD_REPRESENTATION"))
    {
        return Err(error(
            "JSONLD_EXPORT",
            "Unknown representation fields cannot be discarded",
        ));
    }
    let payload = payload_from_valid_document(document, ctx)?;
    let archived = NativeJsonTree::parse_json(payload.original_source.units(), ctx)?;
    if archived == payload.root {
        return Ok(payload.original_source);
    }
    let rendered = payload.root.render_compact(ctx)?;
    let mut units = rendered.units().to_vec();
    units.push(b'\n' as u16);
    Ok(Utf16::new(units))
}

pub fn get_jsonld_node(
    document: &Value,
    pointer: &Utf16,
    runtime: &JsonLdRuntime,
    ctx: &mut Context<'_>,
) -> Result<NativeJsonTree, EngineError> {
    let payload = payload_from_document(document, runtime, ctx)?;
    payload.root.subtree_clone(pointer, ctx)
}

pub fn propose_jsonld_node_edit(
    document: &Value,
    pointer: &Utf16,
    replacement_json: &Utf16,
    runtime: &JsonLdRuntime,
    ctx: &mut Context<'_>,
) -> Result<(Value, Validation), EngineError> {
    let mut payload = payload_from_document(document, runtime, ctx)?;
    let replacement = NativeJsonTree::parse_json(replacement_json.units(), ctx)?;
    payload.root = payload.root.replace_node(pointer, &replacement, ctx)?;
    let mut candidate = copy_json(document, ctx)?;
    let payload_value = find_payload_mut(&mut candidate)?;
    set_field(
        payload_value,
        "root",
        payload.root.tagged_value_preserving_extras(ctx)?,
    )?;
    let validation = runtime.inspect_document(&candidate, ctx)?;
    if !validation.valid {
        return Err(validation_error("JSONLD_EDIT", &validation));
    }
    Ok((candidate, validation))
}

/// Run JSON-LD 1.0/1.1 expansion using the pinned pure-Rust processor and only
/// the exact URL keys supplied with this source document. The result is always
/// an incomplete proposal: this operation does not claim processor-warning
/// completeness, source equivalence, RDF equivalence, or ontology validity.
pub fn propose_jsonld_expansion(
    document: &Value,
    loss_policy: &Utf16,
    runtime: &JsonLdRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if loss_policy != &Utf16::from("report") && loss_policy != &Utf16::from("reject") {
        return Err(error(
            "JSONLD_OPTIONS",
            "lossPolicy must be report or reject",
        ));
    }
    let validation = runtime.inspect_document(document, ctx)?;
    if !validation.valid {
        return Err(validation_error("JSONLD_DOCUMENT", &validation));
    }
    let has_unknown_representation = validation
        .diagnostics
        .iter()
        .any(|d| d.code == Utf16::from("JSONLD_REPRESENTATION") && d.severity == Severity::Warning);
    let payload = payload_from_valid_document(document, ctx)?;
    if has_unknown_representation {
        let source = copy_json(document, ctx)?;
        return Ok(Value::Object(vec![
            (Utf16::from("source"), source),
            (
                Utf16::from("lossPolicy"),
                Value::String(clone_text(loss_policy, ctx)?),
            ),
            (Utf16::from("status"), Value::string_utf8("blocked")),
            (Utf16::from("complete"), Value::Bool(false)),
            (Utf16::from("resourcesUsed"), Value::Array(Vec::new())),
            (
                Utf16::from("diagnostics"),
                Value::Array(vec![report_diagnostic(
                    "JSONLD_EXPANSION_BLOCKED",
                    "Unknown representation fields prevent semantic processing",
                    "error",
                )]),
            ),
        ]));
    }
    let source_for_processor =
        if NativeJsonTree::parse_json(payload.original_source.units(), ctx)? == payload.root {
            clone_text(&payload.original_source, ctx)?
        } else {
            payload.root.render_compact(ctx)?
        };
    let source = source_for_processor
        .to_utf8()
        .map_err(|_| error("JSONLD_SOURCE", "JSON source is not well-formed UTF-16"))?;

    let mut resources = BTreeMap::new();
    ctx.charge_work(payload.contexts.len(), Utf16::default())?;
    for supplied in &payload.contexts {
        ctx.charge_text(supplied.url.len(), Utf16::default())?;
        let key_text = supplied.url.to_utf8().map_err(|_| {
            error(
                "JSONLD_IRI",
                "Supplied context URL is not well-formed UTF-16",
            )
        })?;
        let key = json_ld::IriBuf::new(key_text)
            .map_err(|_| error("JSONLD_IRI", "Supplied context URL is not a valid IRI"))?;
        ctx.charge_text(supplied.document_url.len(), Utf16::default())?;
        let final_text = supplied.document_url.to_utf8().map_err(|_| {
            error(
                "JSONLD_IRI",
                "Context document URL is not well-formed UTF-16",
            )
        })?;
        let final_url = json_ld::IriBuf::new(final_text)
            .map_err(|_| error("JSONLD_IRI", "Context document URL is not a valid IRI"))?;
        ctx.charge_text(supplied.original_source.len(), Utf16::default())?;
        let text = supplied
            .original_source
            .to_utf8()
            .map_err(|_| error("JSONLD_SOURCE", "Context JSON is not well-formed UTF-16"))?;
        let parsed = json_ld::syntax::Value::parse_str(&text)
            .map_err(|e| error_owned("JSONLD_CONTEXT", e.to_string()))?
            .0;
        resources.insert(
            key,
            json_ld::RemoteDocument::new(Some(final_url), None, parsed),
        );
    }

    ctx.charge_text(payload.base_iri.len(), Utf16::default())?;
    let base_text = payload
        .base_iri
        .to_utf8()
        .map_err(|_| error("JSONLD_IRI", "baseIRI is not well-formed UTF-16"))?;
    let base = json_ld::IriBuf::new(base_text)
        .map_err(|_| error("JSONLD_IRI", "baseIRI is not a valid IRI"))?;
    let document_json = json_ld::syntax::Value::parse_str(&source)
        .map_err(|e| error_owned("JSONLD_SOURCE", e.to_string()))?
        .0;
    let mut processor_options: json_ld::Options<json_ld::rdf_types::vocabulary::IriIndex> =
        json_ld::Options::default();
    ctx.charge_text(payload.processing_mode.len(), Utf16::default())?;
    processor_options.processing_mode = match payload.processing_mode.to_utf8().as_deref() {
        Ok("json-ld-1.0") => json_ld::ProcessingMode::JsonLd1_0,
        _ => json_ld::ProcessingMode::JsonLd1_1,
    };
    if let Some(expand_context) = &payload.expand_context {
        let json = expand_context.render_compact(ctx)?;
        ctx.charge_text(json.len(), Utf16::default())?;
        let json = json
            .to_utf8()
            .map_err(|_| error("JSONLD_CONTEXT", "expandContext is not well-formed UTF-16"))?;
        let parsed = json_ld::syntax::Value::parse_str(&json)
            .map_err(|e| error_owned("JSONLD_CONTEXT", e.to_string()))?
            .0;
        use json_ld::syntax::TryFromJson;
        let context = json_ld::syntax::Context::try_from_json(parsed)
            .map_err(|e| error_owned("JSONLD_CONTEXT", e.to_string()))?;
        processor_options.expand_context = Some(json_ld::RemoteDocumentReference::Loaded(
            json_ld::RemoteDocument::new(None, None, context),
        ));
    }

    let loader = SuppliedContextLoader {
        resources,
        used: RefCell::new(Vec::new()),
        missing: RefCell::new(Vec::new()),
    };
    let input = json_ld::RemoteDocument::new(None, None, document_json);
    let mut vocabulary: json_ld::rdf_types::vocabulary::IndexVocabulary =
        json_ld::rdf_types::vocabulary::IndexVocabulary::new();
    use json_ld::rdf_types::vocabulary::IriVocabularyMut;
    processor_options.base = Some(vocabulary.insert(base.as_iri()));
    let mut warnings = ProcessorWarnings::default();
    use json_ld::JsonLdProcessor;
    let expanded = futures::executor::block_on(input.expand_full(
        &mut vocabulary,
        &loader,
        processor_options,
        &mut warnings,
    ));

    let source_copy = copy_json(document, ctx)?;
    let resources_used = used_context_urls(&loader, ctx)?;
    let has_warnings = !warnings.messages.is_empty();
    let mut diagnostics = warnings
        .messages
        .into_iter()
        .map(|message| {
            diagnostic(
                "JSONLD_EVENT",
                &Utf16::default(),
                message,
                Severity::Warning,
            )
        })
        .collect::<Vec<_>>();
    let reject_warning = loss_policy == &Utf16::from("reject") && has_warnings;
    let mut fields = vec![
        (Utf16::from("source"), source_copy),
        (
            Utf16::from("lossPolicy"),
            Value::String(clone_text(loss_policy, ctx)?),
        ),
        (Utf16::from("complete"), Value::Bool(false)),
        (
            Utf16::from("resourcesUsed"),
            Value::Array(resources_used.into_iter().map(Value::String).collect()),
        ),
        (
            Utf16::from("diagnostics"),
            Value::Array(
                diagnostics
                    .drain(..)
                    .map(|d| {
                        Value::Object(vec![
                            (Utf16::from("code"), Value::String(d.code)),
                            (Utf16::from("path"), Value::String(d.path)),
                            (Utf16::from("message"), Value::String(d.message)),
                            (Utf16::from("severity"), Value::string_utf8("warning")),
                        ])
                    })
                    .collect(),
            ),
        ),
    ];
    match expanded {
        Err(failure) => {
            fields.push((Utf16::from("status"), Value::string_utf8("blocked")));
            if let Some(Value::Array(items)) = fields
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("diagnostics"))
                .map(|(_, value)| value)
            {
                for url in loader.missing.borrow().iter() {
                    items.push(Value::Object(vec![
                        (
                            Utf16::from("code"),
                            Value::string_utf8("JSONLD_CONTEXT_MISSING"),
                        ),
                        (Utf16::from("path"), Value::String(Utf16::default())),
                        (
                            Utf16::from("message"),
                            Value::String(Utf16::from(format!(
                                "No supplied context matched requested URL {}",
                                url.to_utf8().unwrap_or_default()
                            ))),
                        ),
                        (Utf16::from("severity"), Value::string_utf8("error")),
                    ]));
                }
                items.push(Value::Object(vec![
                    (
                        Utf16::from("code"),
                        Value::string_utf8("JSONLD_EXPANSION_BLOCKED"),
                    ),
                    (Utf16::from("path"), Value::String(Utf16::default())),
                    (
                        Utf16::from("message"),
                        Value::string_utf8(&failure.to_string()),
                    ),
                    (Utf16::from("severity"), Value::string_utf8("error")),
                ]));
            }
        }
        Ok(_expanded) if reject_warning => {
            fields.push((Utf16::from("status"), Value::string_utf8("blocked")));
            if let Some(Value::Array(items)) = fields
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("diagnostics"))
                .map(|(_, value)| value)
            {
                items.push(report_diagnostic(
                    "JSONLD_EXPANSION_BLOCKED",
                    "A processor warning was rejected by lossPolicy",
                    "error",
                ));
            }
        }
        Ok(expanded) => {
            use json_ld::syntax::{IntoJsonWithContext, Print};
            let json = expanded.into_objects().into_json_with(&vocabulary);
            let printed = json.compact_print();
            let mut writer = BoundedJsonWriter {
                output: String::new(),
                units: 0,
                ctx,
                failure: None,
            };
            let print_result = write!(&mut writer, "{printed}");
            if let Some(failure) = writer.failure.take() {
                return Err(failure);
            }
            if print_result.is_err() {
                return Err(error("JSONLD_PRINT", "Unable to print expanded JSON-LD"));
            }
            // The writer charged each emitted chunk before appending it. Charge
            // again for the subsequent UTF-16 parse buffer before allocating it.
            let BoundedJsonWriter {
                output,
                units,
                ctx: writer_ctx,
                ..
            } = writer;
            writer_ctx.charge_text(units, Utf16::default())?;
            let rendered_units = output.encode_utf16().collect::<Vec<_>>();
            let root = NativeJsonTree::parse_json(&rendered_units, writer_ctx)?;
            let tagged_root = root.tagged_value_preserving_extras(writer_ctx)?;
            drop(writer_ctx);
            let mut candidate = source_copy_for_candidate(document, ctx)?;
            let payload = find_payload_mut(&mut candidate)?;
            set_field(payload, "root", tagged_root)?;
            let candidate_validation = runtime.inspect_document(&candidate, ctx)?;
            if !candidate_validation.valid {
                return Err(validation_error("JSONLD_EXPANSION", &candidate_validation));
            }
            if let Some(Value::Array(items)) = fields
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("diagnostics"))
                .map(|(_, value)| value)
            {
                items.push(report_diagnostic(
                    "JSONLD_EXPANSION",
                    "Expanded JSON-LD retains full source/context archives. Term aliases, context layout, numeric spelling and other surface forms can change; this proposal does not prove RDF equivalence or ontology validity.",
                    "warning",
                ));
            }
            fields.push((Utf16::from("status"), Value::string_utf8("candidate")));
            fields.push((Utf16::from("candidate"), candidate));
        }
    }
    Ok(Value::Object(fields))
}

pub fn propose_jsonld_compaction(
    document: &Value,
    loss_policy: &Utf16,
    context_json: &Utf16,
    compact_arrays: bool,
    compact_to_relative: bool,
    runtime: &JsonLdRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if loss_policy != &Utf16::from("report") && loss_policy != &Utf16::from("reject") {
        return Err(error(
            "JSONLD_OPTIONS",
            "lossPolicy must be report or reject",
        ));
    }
    let validation = runtime.inspect_document(document, ctx)?;
    if !validation.valid {
        return Err(validation_error("JSONLD_DOCUMENT", &validation));
    }
    if validation
        .diagnostics
        .iter()
        .any(|d| d.code == Utf16::from("JSONLD_REPRESENTATION") && d.severity == Severity::Warning)
    {
        return blocked_transform_report(
            document,
            loss_policy,
            vec![
                (Utf16::from("context"), Value::Null),
                (Utf16::from("compactArrays"), Value::Bool(compact_arrays)),
                (
                    Utf16::from("compactToRelative"),
                    Value::Bool(compact_to_relative),
                ),
            ],
            "JSONLD_COMPACTION_BLOCKED",
            "Unknown representation fields prevent semantic processing",
            ctx,
        );
    }
    let payload = payload_from_valid_document(document, ctx)?;
    let (input, loader, base, mut options) = processor_input(&payload, ctx)?;
    ctx.charge_text(context_json.len(), Utf16::default())?;
    let context_tree = NativeJsonTree::parse_json(context_json.units(), ctx)?;
    let context_text = context_json
        .to_utf8()
        .map_err(|_| error("JSONLD_CONTEXT", "Target context is not well-formed UTF-16"))?;
    let context_value = json_ld::syntax::Value::parse_str(&context_text)
        .map_err(|e| error_owned("JSONLD_CONTEXT", e.to_string()))?
        .0;
    use json_ld::syntax::TryFromJson;
    let context = json_ld::syntax::Context::try_from_json(context_value)
        .map_err(|e| error_owned("JSONLD_CONTEXT", e.to_string()))?;
    options.compact_arrays = compact_arrays;
    options.compact_to_relative = compact_to_relative;
    let target =
        json_ld::RemoteDocumentReference::Loaded(json_ld::RemoteDocument::new(None, None, context));
    let mut vocabulary: json_ld::rdf_types::vocabulary::IndexVocabulary =
        json_ld::rdf_types::vocabulary::IndexVocabulary::new();
    use json_ld::rdf_types::vocabulary::IriVocabularyMut;
    options.base = Some(vocabulary.insert(base.as_iri()));
    let mut warnings = ProcessorWarnings::default();
    use json_ld::JsonLdProcessor;
    let compacted = futures::executor::block_on(input.compact_full(
        &mut vocabulary,
        target,
        &loader,
        options,
        &mut warnings,
    ));
    let report_diagnostics = warnings
        .messages
        .iter()
        .map(|message| report_diagnostic("JSONLD_EVENT", message, "warning"))
        .collect::<Vec<_>>();
    let rejected = loss_policy == &Utf16::from("reject") && !report_diagnostics.is_empty();
    let resources_used = used_context_urls(&loader, ctx)?;
    let mut fields = transform_report_base(
        document,
        loss_policy,
        resources_used,
        report_diagnostics,
        vec![
            (
                Utf16::from("context"),
                context_tree.tagged_value_preserving_extras(ctx)?,
            ),
            (Utf16::from("compactArrays"), Value::Bool(compact_arrays)),
            (
                Utf16::from("compactToRelative"),
                Value::Bool(compact_to_relative),
            ),
        ],
        ctx,
    )?;
    match compacted {
        Err(failure) => {
            fields.push((Utf16::from("status"), Value::string_utf8("blocked")));
            push_transform_diagnostic(
                &mut fields,
                "JSONLD_COMPACTION_BLOCKED",
                &failure.to_string(),
                "error",
            );
        }
        Ok(_) if rejected => {
            fields.push((Utf16::from("status"), Value::string_utf8("blocked")));
            push_transform_diagnostic(
                &mut fields,
                "JSONLD_COMPACTION_BLOCKED",
                "A processor warning was rejected by lossPolicy",
                "error",
            );
        }
        Ok(compacted) => {
            let text = print_json_bounded(&compacted, ctx)?;
            let root = NativeJsonTree::parse_json(text.units(), ctx)?;
            let mut candidate = copy_json(document, ctx)?;
            set_field(
                find_payload_mut(&mut candidate)?,
                "root",
                root.tagged_value_preserving_extras(ctx)?,
            )?;
            if !runtime.inspect_document(&candidate, ctx)?.valid {
                return Err(error(
                    "JSONLD_COMPACTION",
                    "Compacted candidate failed core validation",
                ));
            }
            fields.push((Utf16::from("status"), Value::string_utf8("candidate")));
            fields.push((Utf16::from("candidate"), candidate));
            push_transform_diagnostic(
                &mut fields,
                "JSONLD_COMPACTION",
                "Compacted candidate retains source/context archives; target aliases, relative IRIs and array shapes can change. This is not an RDF or ontology equivalence proof.",
                "warning",
            );
        }
    }
    Ok(Value::Object(fields))
}

pub fn propose_jsonld_flatten(
    document: &Value,
    loss_policy: &Utf16,
    context_json: Option<&Utf16>,
    compact_arrays: bool,
    runtime: &JsonLdRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if loss_policy != &Utf16::from("report") && loss_policy != &Utf16::from("reject") {
        return Err(error(
            "JSONLD_OPTIONS",
            "lossPolicy must be report or reject",
        ));
    }
    let validation = runtime.inspect_document(document, ctx)?;
    if !validation.valid {
        return Err(validation_error("JSONLD_DOCUMENT", &validation));
    }
    if validation
        .diagnostics
        .iter()
        .any(|d| d.code == Utf16::from("JSONLD_REPRESENTATION") && d.severity == Severity::Warning)
    {
        return blocked_transform_report(
            document,
            loss_policy,
            vec![
                (
                    Utf16::from("context"),
                    match context_json {
                        Some(context) => NativeJsonTree::parse_json(context.units(), ctx)?
                            .tagged_value_preserving_extras(ctx)?,
                        None => Value::Null,
                    },
                ),
                (Utf16::from("compactArrays"), Value::Bool(compact_arrays)),
            ],
            "JSONLD_FLATTEN_BLOCKED",
            "Unknown representation fields prevent semantic processing",
            ctx,
        );
    }
    let payload = payload_from_valid_document(document, ctx)?;
    let (input, loader, base, mut options) = processor_input(&payload, ctx)?;
    options.compact_arrays = compact_arrays;
    let (context_tree, target) = match context_json {
        None => (Value::Null, None),
        Some(source) => {
            ctx.charge_text(source.len(), Utf16::default())?;
            let tree = NativeJsonTree::parse_json(source.units(), ctx)?;
            let text = source
                .to_utf8()
                .map_err(|_| error("JSONLD_CONTEXT", "Target context is not well-formed UTF-16"))?;
            let value = json_ld::syntax::Value::parse_str(&text)
                .map_err(|e| error_owned("JSONLD_CONTEXT", e.to_string()))?
                .0;
            use json_ld::syntax::TryFromJson;
            let context = json_ld::syntax::Context::try_from_json(value)
                .map_err(|e| error_owned("JSONLD_CONTEXT", e.to_string()))?;
            (
                tree.tagged_value_preserving_extras(ctx)?,
                Some(json_ld::RemoteDocumentReference::Loaded(
                    json_ld::RemoteDocument::new(None, None, context),
                )),
            )
        }
    };
    let mut vocabulary: json_ld::rdf_types::vocabulary::IndexVocabulary =
        json_ld::rdf_types::vocabulary::IndexVocabulary::new();
    use json_ld::rdf_types::vocabulary::IriVocabularyMut;
    options.base = Some(vocabulary.insert(base.as_iri()));
    let mut generator = json_ld::rdf_types::generator::Blank::new();
    let mut warnings = ProcessorWarnings::default();
    use json_ld::JsonLdProcessor;
    let flattened = futures::executor::block_on(input.flatten_full(
        &mut vocabulary,
        &mut generator,
        target,
        &loader,
        options,
        &mut warnings,
    ));
    let report_diagnostics = warnings
        .messages
        .iter()
        .map(|message| report_diagnostic("JSONLD_EVENT", message, "warning"))
        .collect::<Vec<_>>();
    let rejected = loss_policy == &Utf16::from("reject") && !report_diagnostics.is_empty();
    let resources_used = used_context_urls(&loader, ctx)?;
    let mut fields = transform_report_base(
        document,
        loss_policy,
        resources_used,
        report_diagnostics,
        vec![
            (Utf16::from("context"), context_tree),
            (Utf16::from("compactArrays"), Value::Bool(compact_arrays)),
        ],
        ctx,
    )?;
    match flattened {
        Err(failure) => {
            fields.push((Utf16::from("status"), Value::string_utf8("blocked")));
            push_transform_diagnostic(
                &mut fields,
                "JSONLD_FLATTEN_BLOCKED",
                &failure.to_string(),
                "error",
            );
        }
        Ok(_) if rejected => {
            fields.push((Utf16::from("status"), Value::string_utf8("blocked")));
            push_transform_diagnostic(
                &mut fields,
                "JSONLD_FLATTEN_BLOCKED",
                "A processor warning was rejected by lossPolicy",
                "error",
            );
        }
        Ok(flattened) => {
            let text = print_json_bounded(&flattened, ctx)?;
            let root = NativeJsonTree::parse_json(text.units(), ctx)?;
            let mut candidate = copy_json(document, ctx)?;
            set_field(
                find_payload_mut(&mut candidate)?,
                "root",
                root.tagged_value_preserving_extras(ctx)?,
            )?;
            if !runtime.inspect_document(&candidate, ctx)?.valid {
                return Err(error(
                    "JSONLD_FLATTEN",
                    "Flattened candidate failed core validation",
                ));
            }
            fields.push((Utf16::from("status"), Value::string_utf8("candidate")));
            fields.push((Utf16::from("candidate"), candidate));
            push_transform_diagnostic(
                &mut fields,
                "JSONLD_FLATTEN",
                "Flattened candidate retains source/context archives; node descriptions merge by identifier and local blank labels may be assigned. This is not an RDF or ontology equivalence proof.",
                "warning",
            );
        }
    }
    Ok(Value::Object(fields))
}

fn blocked_transform_report(
    document: &Value,
    loss_policy: &Utf16,
    extras: Vec<(Utf16, Value)>,
    code: &str,
    message: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut fields =
        transform_report_base(document, loss_policy, Vec::new(), Vec::new(), extras, ctx)?;
    fields.push((Utf16::from("status"), Value::string_utf8("blocked")));
    push_transform_diagnostic(&mut fields, code, message, "error");
    Ok(Value::Object(fields))
}

fn transform_report_base(
    document: &Value,
    loss_policy: &Utf16,
    resources_used: Vec<Utf16>,
    diagnostics: Vec<Value>,
    extras: Vec<(Utf16, Value)>,
    ctx: &mut Context<'_>,
) -> Result<Vec<(Utf16, Value)>, EngineError> {
    ctx.charge_work(
        resources_used.len().saturating_add(diagnostics.len()),
        Utf16::default(),
    )?;
    let mut fields = vec![
        (Utf16::from("source"), copy_json(document, ctx)?),
        (
            Utf16::from("lossPolicy"),
            Value::String(clone_text(loss_policy, ctx)?),
        ),
        (Utf16::from("complete"), Value::Bool(false)),
        (
            Utf16::from("resourcesUsed"),
            Value::Array(resources_used.into_iter().map(Value::String).collect()),
        ),
        (Utf16::from("diagnostics"), Value::Array(diagnostics)),
    ];
    fields.extend(extras);
    Ok(fields)
}

fn push_transform_diagnostic(
    fields: &mut [(Utf16, Value)],
    code: &str,
    message: &str,
    severity: &str,
) {
    if let Some(Value::Array(items)) = fields
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from("diagnostics"))
        .map(|(_, value)| value)
    {
        items.push(report_diagnostic(code, message, severity));
    }
}

fn report_diagnostic(code: &str, message: &str, severity: &str) -> Value {
    Value::Object(vec![
        (Utf16::from("code"), Value::string_utf8(code)),
        (Utf16::from("path"), Value::String(Utf16::default())),
        (Utf16::from("message"), Value::string_utf8(message)),
        (Utf16::from("severity"), Value::string_utf8(severity)),
    ])
}

fn used_context_urls(
    loader: &SuppliedContextLoader,
    ctx: &mut Context<'_>,
) -> Result<Vec<Utf16>, EngineError> {
    let used = loader.used.borrow();
    ctx.charge_work(used.len(), Utf16::default())?;
    used.iter()
        .map(|url| clone_text(url, ctx))
        .collect::<Result<Vec<_>, _>>()
}

fn print_json_bounded(
    value: &json_ld::syntax::Value,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    use json_ld::syntax::Print;
    let printed = value.compact_print();
    let mut writer = BoundedJsonWriter {
        output: String::new(),
        units: 0,
        ctx,
        failure: None,
    };
    let print_result = write!(&mut writer, "{printed}");
    if let Some(failure) = writer.failure.take() {
        return Err(failure);
    }
    if print_result.is_err() {
        return Err(error("JSONLD_PRINT", "Unable to print JSON-LD output"));
    }
    Ok(Utf16::from(writer.output))
}

fn processor_input(
    payload: &JsonLdPayload,
    ctx: &mut Context<'_>,
) -> Result<
    (
        json_ld::RemoteDocument<json_ld::rdf_types::vocabulary::IriIndex>,
        SuppliedContextLoader,
        json_ld::IriBuf,
        json_ld::Options<json_ld::rdf_types::vocabulary::IriIndex>,
    ),
    EngineError,
> {
    let mut resources = BTreeMap::new();
    ctx.charge_work(payload.contexts.len(), Utf16::default())?;
    for supplied in &payload.contexts {
        ctx.charge_text(supplied.url.len(), Utf16::default())?;
        let key = json_ld::IriBuf::new(
            supplied
                .url
                .to_utf8()
                .map_err(|_| error("JSONLD_IRI", "Context URL is not valid UTF-16"))?,
        )
        .map_err(|_| error("JSONLD_IRI", "Context URL is not a valid IRI"))?;
        ctx.charge_text(supplied.document_url.len(), Utf16::default())?;
        let final_url = json_ld::IriBuf::new(
            supplied
                .document_url
                .to_utf8()
                .map_err(|_| error("JSONLD_IRI", "Context document URL is not valid UTF-16"))?,
        )
        .map_err(|_| error("JSONLD_IRI", "Context document URL is not a valid IRI"))?;
        ctx.charge_text(supplied.original_source.len(), Utf16::default())?;
        let source = supplied
            .original_source
            .to_utf8()
            .map_err(|_| error("JSONLD_SOURCE", "Context JSON is not valid UTF-16"))?;
        let document = json_ld::syntax::Value::parse_str(&source)
            .map_err(|e| error_owned("JSONLD_CONTEXT", e.to_string()))?
            .0;
        resources.insert(
            key,
            json_ld::RemoteDocument::new(Some(final_url), None, document),
        );
    }
    ctx.charge_text(payload.base_iri.len(), Utf16::default())?;
    let base = json_ld::IriBuf::new(
        payload
            .base_iri
            .to_utf8()
            .map_err(|_| error("JSONLD_IRI", "baseIRI is not valid UTF-16"))?,
    )
    .map_err(|_| error("JSONLD_IRI", "baseIRI is not a valid IRI"))?;
    let source =
        if NativeJsonTree::parse_json(payload.original_source.units(), ctx)? == payload.root {
            clone_text(&payload.original_source, ctx)?
        } else {
            payload.root.render_compact(ctx)?
        };
    ctx.charge_text(source.len(), Utf16::default())?;
    let source = source
        .to_utf8()
        .map_err(|_| error("JSONLD_SOURCE", "JSON source is not valid UTF-16"))?;
    let document = json_ld::syntax::Value::parse_str(&source)
        .map_err(|e| error_owned("JSONLD_SOURCE", e.to_string()))?
        .0;
    let mut options = json_ld::Options::default();
    ctx.charge_text(payload.processing_mode.len(), Utf16::default())?;
    options.processing_mode = match payload.processing_mode.to_utf8().as_deref() {
        Ok("json-ld-1.0") => json_ld::ProcessingMode::JsonLd1_0,
        _ => json_ld::ProcessingMode::JsonLd1_1,
    };
    if let Some(expand_context) = &payload.expand_context {
        let source = expand_context.render_compact(ctx)?;
        ctx.charge_text(source.len(), Utf16::default())?;
        let source = source
            .to_utf8()
            .map_err(|_| error("JSONLD_CONTEXT", "expandContext is not valid UTF-16"))?;
        let value = json_ld::syntax::Value::parse_str(&source)
            .map_err(|e| error_owned("JSONLD_CONTEXT", e.to_string()))?
            .0;
        use json_ld::syntax::TryFromJson;
        let context = json_ld::syntax::Context::try_from_json(value)
            .map_err(|e| error_owned("JSONLD_CONTEXT", e.to_string()))?;
        options.expand_context = Some(json_ld::RemoteDocumentReference::Loaded(
            json_ld::RemoteDocument::new(None, None, context),
        ));
    }
    Ok((
        json_ld::RemoteDocument::new(None, None, document),
        SuppliedContextLoader {
            resources,
            used: RefCell::new(Vec::new()),
            missing: RefCell::new(Vec::new()),
        },
        base,
        options,
    ))
}

fn source_copy_for_candidate(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    copy_json(document, ctx)
}

#[derive(Default)]
struct ProcessorWarnings {
    messages: Vec<String>,
}

impl<N, W: contextual::DisplayWithContext<N>> json_ld::warning::Handler<N, W>
    for ProcessorWarnings
{
    fn handle(&mut self, vocabulary: &N, warning: W) {
        use contextual::WithContext;
        self.messages.push(warning.with(vocabulary).to_string());
    }
}

#[derive(Debug)]
struct SuppliedContextMissing;
impl fmt::Display for SuppliedContextMissing {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("The requested context URL was not supplied")
    }
}
impl StdError for SuppliedContextMissing {}

struct SuppliedContextLoader {
    resources: BTreeMap<json_ld::IriBuf, json_ld::RemoteDocument>,
    used: RefCell<Vec<Utf16>>,
    missing: RefCell<Vec<Utf16>>,
}

impl json_ld::Loader for SuppliedContextLoader {
    async fn load(&self, url: &json_ld::Iri) -> json_ld::LoadingResult<json_ld::IriBuf> {
        let Some(document) = self.resources.get(url) else {
            let missing = Utf16::from(url.as_str());
            let mut requests = self.missing.borrow_mut();
            if !requests.contains(&missing) {
                requests.push(missing);
            }
            return Err(json_ld::LoadError::new(
                url.to_owned(),
                SuppliedContextMissing,
            ));
        };
        let requested = Utf16::from(url.as_str());
        let mut used = self.used.borrow_mut();
        if !used.contains(&requested) {
            used.push(requested);
        }
        Ok(document.clone())
    }
}

struct BoundedJsonWriter<'a, 'ctx> {
    output: String,
    units: usize,
    ctx: &'a mut Context<'ctx>,
    failure: Option<EngineError>,
}

impl fmt::Write for BoundedJsonWriter<'_, '_> {
    fn write_str(&mut self, value: &str) -> fmt::Result {
        let units = value.encode_utf16().count();
        if self.units.saturating_add(units) > self.ctx.limits().max_text_units {
            self.failure = Some(EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Expanded JSON-LD exceeds the text limit",
            ));
            return Err(fmt::Error);
        }
        if let Err(failure) = self.ctx.charge_text(units, Utf16::default()) {
            self.failure = Some(failure);
            return Err(fmt::Error);
        }
        self.units += units;
        self.output.push_str(value);
        Ok(())
    }
}

fn payload_from_document(
    document: &Value,
    runtime: &JsonLdRuntime,
    ctx: &mut Context<'_>,
) -> Result<JsonLdPayload, EngineError> {
    let validation = runtime.inspect_document(document, ctx)?;
    if !validation.valid {
        return Err(validation_error("JSONLD_DOCUMENT", &validation));
    }
    payload_from_valid_document(document, ctx)
}

fn payload_from_valid_document(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<JsonLdPayload, EngineError> {
    let value = find_payload(document)?;
    let root = NativeJsonTree::from_tagged_value(
        field(value, "root").ok_or_else(|| error("JSONLD_PAYLOAD", "Root is required"))?,
        ctx,
    )?;
    let original_source = clone_text(
        string(field(value, "originalSource"))
            .ok_or_else(|| error("JSONLD_PAYLOAD", "Original source is required"))?,
        ctx,
    )?;
    let processing_mode = clone_text(
        string(field(value, "processingMode"))
            .ok_or_else(|| error("JSONLD_PAYLOAD", "Processing mode is required"))?,
        ctx,
    )?;
    let base_iri = clone_text(
        string(field(value, "baseIRI"))
            .ok_or_else(|| error("JSONLD_PAYLOAD", "Base IRI is required"))?,
        ctx,
    )?;
    let mut contexts = Vec::new();
    if let Some(Value::Array(items)) = field(value, "contexts") {
        ctx.charge_work(items.len(), Utf16::default())?;
        for item in items {
            contexts.push(JsonLdContext {
                url: clone_text(
                    string(field(item, "url"))
                        .ok_or_else(|| error("JSONLD_PAYLOAD", "Context URL is required"))?,
                    ctx,
                )?,
                document_url: clone_text(
                    string(field(item, "documentUrl")).ok_or_else(|| {
                        error("JSONLD_PAYLOAD", "Context document URL is required")
                    })?,
                    ctx,
                )?,
                root: NativeJsonTree::from_tagged_value(
                    field(item, "root")
                        .ok_or_else(|| error("JSONLD_PAYLOAD", "Context root is required"))?,
                    ctx,
                )?,
                original_source: clone_text(
                    string(field(item, "originalSource"))
                        .ok_or_else(|| error("JSONLD_PAYLOAD", "Context source is required"))?,
                    ctx,
                )?,
            });
        }
    }
    let expand_context = field(value, "expandContext")
        .map(|v| NativeJsonTree::from_tagged_value(v, ctx))
        .transpose()?;
    Ok(JsonLdPayload {
        processing_mode,
        base_iri,
        root,
        original_source,
        contexts,
        expand_context,
    })
}

fn assemble_document(
    id: &Utf16,
    payload: &JsonLdPayload,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_work(payload.contexts.len(), Utf16::default())?;
    let mut fields = vec![
        (Utf16::from("profile"), Value::string_utf8("jsonld-source")),
        (
            Utf16::from("processingMode"),
            Value::String(clone_text(&payload.processing_mode, ctx)?),
        ),
        (
            Utf16::from("baseIRI"),
            Value::String(clone_text(&payload.base_iri, ctx)?),
        ),
        (
            Utf16::from("root"),
            payload.root.tagged_value_preserving_extras(ctx)?,
        ),
        (
            Utf16::from("originalSource"),
            Value::String(clone_text(&payload.original_source, ctx)?),
        ),
    ];
    let mut contexts = Vec::with_capacity(payload.contexts.len());
    for item in &payload.contexts {
        contexts.push(Value::Object(vec![
            (
                Utf16::from("url"),
                Value::String(clone_text(&item.url, ctx)?),
            ),
            (
                Utf16::from("documentUrl"),
                Value::String(clone_text(&item.document_url, ctx)?),
            ),
            (
                Utf16::from("root"),
                item.root.tagged_value_preserving_extras(ctx)?,
            ),
            (
                Utf16::from("originalSource"),
                Value::String(clone_text(&item.original_source, ctx)?),
            ),
        ]));
    }
    fields.push((Utf16::from("contexts"), Value::Array(contexts)));
    if let Some(expand_context) = &payload.expand_context {
        fields.push((
            Utf16::from("expandContext"),
            expand_context.tagged_value_preserving_extras(ctx)?,
        ));
    }
    let extension = Value::Object(vec![(Utf16::from(JSONLD_EXTENSION), Value::Object(fields))]);
    let element = Value::Object(vec![
        (Utf16::from("id"), Value::string_utf8("document")),
        (Utf16::from("extensions"), extension),
    ]);
    let module = Value::Object(vec![
        (Utf16::from("id"), Value::string_utf8("jsonld")),
        (Utf16::from("namespace"), Value::string_utf8("")),
        (Utf16::from("elements"), Value::Array(vec![element])),
    ]);
    copy_json(
        &Value::Object(vec![
            (Utf16::from("umf"), Value::string_utf8(CORE_VERSION)),
            (Utf16::from("id"), Value::String(clone_text(id, ctx)?)),
            (
                Utf16::from("vocabularies"),
                Value::Object(vec![(
                    Utf16::from(JSONLD_EXTENSION),
                    Value::Object(vec![(
                        Utf16::from("version"),
                        Value::string_utf8(EXTENSION_VERSION),
                    )]),
                )]),
            ),
            (Utf16::from("modules"), Value::Array(vec![module])),
        ]),
        ctx,
    )
}

fn find_payload(document: &Value) -> Result<&Value, EngineError> {
    let version = field(
        field(document, "vocabularies")
            .ok_or_else(|| error("JSONLD_PAYLOAD", "Document vocabularies are required"))?,
        JSONLD_EXTENSION,
    )
    .and_then(|package| string(field(package, "version")));
    if version != Some(&Utf16::from(EXTENSION_VERSION)) {
        return Err(error(
            "JSONLD_PAYLOAD",
            "Expected the pinned JSON-LD extension package version",
        ));
    }
    let modules = match field(document, "modules") {
        Some(Value::Array(values)) => values,
        _ => return Err(error("JSONLD_PAYLOAD", "Document modules are required")),
    };
    for module in modules {
        if string(field(module, "id")) != Some(&Utf16::from("jsonld")) {
            continue;
        }
        if let Some(Value::Array(elements)) = field(module, "elements") {
            for element in elements {
                if string(field(element, "id")) == Some(&Utf16::from("document")) {
                    if let Some(extensions) = field(element, "extensions") {
                        if let Some(payload) = field(extensions, JSONLD_EXTENSION) {
                            return Ok(payload);
                        }
                    }
                }
            }
        }
    }
    Err(error("JSONLD_PAYLOAD", "JSON-LD payload is missing"))
}

fn find_payload_mut(document: &mut Value) -> Result<&mut Value, EngineError> {
    let Value::Object(doc) = document else {
        return Err(error("JSONLD_PAYLOAD", "Document is not an object"));
    };
    let modules = doc
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("modules"))
        .and_then(|(_, v)| match v {
            Value::Array(v) => Some(v),
            _ => None,
        })
        .ok_or_else(|| error("JSONLD_PAYLOAD", "Document modules are required"))?;
    let module = modules
        .iter_mut()
        .find(|m| string(field(m, "id")) == Some(&Utf16::from("jsonld")))
        .ok_or_else(|| error("JSONLD_PAYLOAD", "JSON-LD module is missing"))?;
    let elements = match field_mut(module, "elements") {
        Some(Value::Array(values)) => values,
        _ => return Err(error("JSONLD_PAYLOAD", "JSON-LD elements are missing")),
    };
    let element = elements
        .iter_mut()
        .find(|e| string(field(e, "id")) == Some(&Utf16::from("document")))
        .ok_or_else(|| error("JSONLD_PAYLOAD", "JSON-LD document element is missing"))?;
    let extensions = field_mut(element, "extensions")
        .ok_or_else(|| error("JSONLD_PAYLOAD", "JSON-LD extensions are missing"))?;
    field_mut(extensions, JSONLD_EXTENSION)
        .ok_or_else(|| error("JSONLD_PAYLOAD", "JSON-LD payload is missing"))
}

fn field_mut<'a>(value: &'a mut Value, key: &str) -> Option<&'a mut Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter_mut()
        .find(|(name, _)| name == &Utf16::from(key))
        .map(|(_, value)| value)
}

fn set_field(object: &mut Value, key: &str, value: Value) -> Result<(), EngineError> {
    let Value::Object(fields) = object else {
        return Err(error("JSONLD_PAYLOAD", "Payload must be an object"));
    };
    if let Some((_, old)) = fields
        .iter_mut()
        .find(|(name, _)| name == &Utf16::from(key))
    {
        *old = value;
        Ok(())
    } else {
        fields.push((Utf16::from(key), value));
        Ok(())
    }
}

fn validation_error(code: &str, validation: &Validation) -> EngineError {
    let message = validation
        .diagnostics
        .iter()
        .map(|d| d.message.to_utf8().unwrap_or_default())
        .collect::<Vec<_>>()
        .join("; ");
    EngineError::new(code, Utf16::default(), message)
}

fn generalized_jsonld_id(
    term: &Value,
    allow_blank: bool,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let term_type = string(field(term, "termType"))
        .ok_or_else(|| error("JSONLD_RDF_TERM", "Generalized term type missing"))?;
    let raw = string(field(term, "value"))
        .ok_or_else(|| error("JSONLD_RDF_TERM", "Generalized term value missing"))?;
    match term_type.to_utf8().as_deref() {
        Ok("NamedNode") => clone_text(raw, ctx),
        Ok("BlankNode") if allow_blank => {
            let suffix = clone_text(raw, ctx)?;
            let mut units = Utf16::from("_:").units().to_vec();
            units.extend_from_slice(suffix.units());
            Ok(Utf16::new(units))
        }
        Ok("BlankNode") => Err(error(
            "JSONLD_RDF_GENERALIZED_PREDICATE",
            "Generalized blank-node predicates cannot be represented in JSON-LD",
        )),
        _ => Err(error(
            "JSONLD_RDF_TERM",
            "Unexpected generalized identifier",
        )),
    }
}

fn native_member<'a>(node: &'a NativeJsonNode, key: &str) -> Option<&'a NativeJsonNode> {
    match node {
        NativeJsonNode::Object(fields) => fields
            .iter()
            .find(|(name, _)| name == &Utf16::from(key))
            .map(|(_, value)| value),
        _ => None,
    }
}

fn native_string(node: Option<&NativeJsonNode>) -> Option<&Utf16> {
    match node {
        Some(NativeJsonNode::String(value)) => Some(value),
        _ => None,
    }
}

fn clone_native_node(
    node: &NativeJsonNode,
    ctx: &mut Context<'_>,
) -> Result<NativeJsonNode, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    Ok(match node {
        NativeJsonNode::Null => NativeJsonNode::Null,
        NativeJsonNode::Boolean(value) => NativeJsonNode::Boolean(*value),
        NativeJsonNode::String(value) => NativeJsonNode::String(clone_text(value, ctx)?),
        NativeJsonNode::Number(value) => {
            ctx.charge_text(value.len(), Utf16::default())?;
            NativeJsonNode::Number(value.clone())
        }
        NativeJsonNode::Array(items) => NativeJsonNode::Array(
            items
                .iter()
                .map(|item| clone_native_node(item, ctx))
                .collect::<Result<_, _>>()?,
        ),
        NativeJsonNode::Object(fields) => NativeJsonNode::Object(
            fields
                .iter()
                .map(|(key, value)| Ok((clone_text(key, ctx)?, clone_native_node(value, ctx)?)))
                .collect::<Result<_, EngineError>>()?,
        ),
    })
}

fn append_frame_piece(
    output: &mut String,
    output_units: &mut usize,
    piece: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let units = piece.encode_utf16().count();
    ctx.charge_text(units, Utf16::default())?;
    *output_units = output_units.saturating_add(units);
    if *output_units > ctx.limits().max_text_units {
        return Err(error("LIMIT", "JSON-LD frame output exceeds text limit"));
    }
    output
        .try_reserve(piece.len())
        .map_err(|_| error("LIMIT", "JSON-LD frame output allocation failed"))?;
    output.push_str(piece);
    Ok(())
}

fn write_native_node(
    node: &NativeJsonNode,
    output: &mut String,
    output_units: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match node {
        NativeJsonNode::Null => append_frame_piece(output, output_units, "null", ctx)?,
        NativeJsonNode::Boolean(value) => append_frame_piece(
            output,
            output_units,
            if *value { "true" } else { "false" },
            ctx,
        )?,
        NativeJsonNode::Number(value) => {
            append_frame_piece(output, output_units, value, ctx)?;
        }
        NativeJsonNode::String(value) => {
            let encoded = serialization::write_json_value(
                &Value::String(clone_text(value, ctx)?),
                Format::Json,
                ctx,
            )?;
            let encoded = encoded
                .to_utf8()
                .map_err(|_| error("JSONLD_FRAME", "Frame output string is invalid"))?;
            append_frame_piece(output, output_units, encoded.trim_end(), ctx)?;
        }
        NativeJsonNode::Array(items) => {
            append_frame_piece(output, output_units, "[", ctx)?;
            for (index, item) in items.iter().enumerate() {
                if index != 0 {
                    append_frame_piece(output, output_units, ",", ctx)?;
                }
                write_native_node(item, output, output_units, ctx)?;
            }
            append_frame_piece(output, output_units, "]", ctx)?;
        }
        NativeJsonNode::Object(fields) => {
            append_frame_piece(output, output_units, "{", ctx)?;
            for (index, (key, value)) in fields.iter().enumerate() {
                if index != 0 {
                    append_frame_piece(output, output_units, ",", ctx)?;
                }
                write_native_node(
                    &NativeJsonNode::String(key.clone()),
                    output,
                    output_units,
                    ctx,
                )?;
                append_frame_piece(output, output_units, ":", ctx)?;
                write_native_node(value, output, output_units, ctx)?;
            }
            append_frame_piece(output, output_units, "}", ctx)?;
        }
    }
    Ok(())
}

fn frame_context_iri<'a>(frame: &'a NativeJsonNode, term: &Utf16) -> Option<&'a Utf16> {
    let context = native_member(frame, "@context")?;
    let NativeJsonNode::Object(entries) = context else {
        return None;
    };
    let (_, definition) = entries.iter().find(|(key, _)| key == term)?;
    match definition {
        NativeJsonNode::String(iri) => Some(iri),
        NativeJsonNode::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from("@id"))
            .and_then(|(_, value)| native_string(Some(value))),
        _ => None,
    }
}

fn frame_matches(node: &NativeJsonNode, frame: &NativeJsonNode, require_all: bool) -> bool {
    let NativeJsonNode::Object(criteria) = frame else {
        return false;
    };
    let mut tests = Vec::new();
    for (key, pattern) in criteria {
        if key == &Utf16::from("@context") {
            continue;
        }
        if key == &Utf16::from("@id") {
            tests.push(native_member(node, "@id") == Some(pattern));
        } else if key == &Utf16::from("@type") {
            let expected = match pattern {
                NativeJsonNode::String(value) => {
                    vec![frame_context_iri(frame, value).unwrap_or(value)]
                }
                NativeJsonNode::Array(items) => items
                    .iter()
                    .filter_map(|item| match item {
                        NativeJsonNode::String(value) => {
                            Some(frame_context_iri(frame, value).unwrap_or(value))
                        }
                        _ => None,
                    })
                    .collect(),
                _ => Vec::new(),
            };
            let actual = native_member(node, "@type");
            tests.push(
                !expected.is_empty()
                    && expected.iter().all(|value| {
                        match actual {
                Some(NativeJsonNode::Array(items)) => items.iter().any(
                    |item| matches!(item, NativeJsonNode::String(actual) if actual == *value),
                ),
                Some(NativeJsonNode::String(actual)) => actual == *value,
                _ => false,
            }
                    }),
            );
        } else {
            let expanded_key = frame_context_iri(frame, key).unwrap_or(key);
            tests.push(matches!(
                node,
                NativeJsonNode::Object(fields) if fields.iter().any(|(name, _)| name == expanded_key)
            ));
        }
    }
    if tests.is_empty() {
        return true;
    }
    if require_all {
        tests.into_iter().all(|matched| matched)
    } else {
        tests.into_iter().any(|matched| matched)
    }
}

/// Source proposal for the JSON-LD framing subset expressed by the explicit
/// frame identity/type/property selectors. It preserves native number tokens.
pub fn propose_jsonld_framing(
    document: &Value,
    frame_source: &Utf16,
    loss_policy: &Utf16,
    explicit: bool,
    require_all: bool,
    omit_default: bool,
    ordered: bool,
    omit_graph: bool,
    prune_blank_node_identifiers: bool,
    frame_default: bool,
    compact_arrays: bool,
    compact_to_relative: bool,
    embed: &Utf16,
    jsonld_runtime: &JsonLdRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if loss_policy != &Utf16::from("report") && loss_policy != &Utf16::from("reject") {
        return Err(error("JSONLD_OPTIONS", "Invalid framing loss policy"));
    }
    if omit_default || frame_default || !compact_arrays || !compact_to_relative {
        return Err(error(
            "JSONLD_OPTIONS",
            "This framing subset supports only omitDefault=false, frameDefault=false, compactArrays=true, and compactToRelative=true",
        ));
    }
    if omit_graph || prune_blank_node_identifiers {
        return Err(error(
            "JSONLD_OPTIONS",
            "This framing subset refuses omitGraph and pruneBlankNodeIdentifiers because it cannot preserve their identity and graph semantics",
        ));
    }
    if !["@once", "@always", "@never", "@first", "@last"]
        .iter()
        .any(|valid| embed == &Utf16::from(*valid))
    {
        return Err(error("JSONLD_OPTIONS", "Invalid @embed option"));
    }
    let frame_tree = NativeJsonTree::parse_json(frame_source.units(), ctx)?;
    let NativeJsonNode::Object(frame_fields) = frame_tree.root() else {
        return Err(error("JSONLD_OPTIONS", "A JSON-LD frame must be an object"));
    };
    let source = copy_json(document, ctx)?;
    let expanded = propose_jsonld_expansion(document, loss_policy, jsonld_runtime, ctx)?;
    let mut report = Value::Object(vec![
        (Utf16::from("source"), source),
        (
            Utf16::from("frame"),
            frame_tree.tagged_value_preserving_extras(ctx)?,
        ),
        (
            Utf16::from("framingOptions"),
            Value::Object(vec![
                (Utf16::from("embed"), Value::String(clone_text(embed, ctx)?)),
                (Utf16::from("explicit"), Value::Bool(explicit)),
                (Utf16::from("requireAll"), Value::Bool(require_all)),
                (Utf16::from("omitDefault"), Value::Bool(omit_default)),
                (Utf16::from("omitGraph"), Value::Bool(omit_graph)),
                (
                    Utf16::from("pruneBlankNodeIdentifiers"),
                    Value::Bool(prune_blank_node_identifiers),
                ),
                (Utf16::from("frameDefault"), Value::Bool(frame_default)),
                (Utf16::from("ordered"), Value::Bool(ordered)),
                (Utf16::from("compactArrays"), Value::Bool(compact_arrays)),
                (
                    Utf16::from("compactToRelative"),
                    Value::Bool(compact_to_relative),
                ),
            ]),
        ),
        (
            Utf16::from("lossPolicy"),
            Value::String(clone_text(loss_policy, ctx)?),
        ),
        (Utf16::from("status"), Value::string_utf8("blocked")),
        (Utf16::from("complete"), Value::Bool(false)),
        (
            Utf16::from("resourcesUsed"),
            field(&expanded, "resourcesUsed")
                .map(|value| copy_json(value, ctx))
                .transpose()?
                .unwrap_or(Value::Array(Vec::new())),
        ),
        (
            Utf16::from("diagnostics"),
            match field(&expanded, "diagnostics") {
                Some(Value::Array(values)) => {
                    ctx.charge_work(values.len(), Utf16::default())?;
                    let mut retained = Vec::with_capacity(values.len());
                    for item in values {
                        if string(field(item, "code")) != Some(&Utf16::from("JSONLD_EXPANSION")) {
                            retained.push(copy_json(item, ctx)?);
                        }
                    }
                    Value::Array(retained)
                }
                Some(value) => copy_json(value, ctx)?,
                None => Value::Array(Vec::new()),
            },
        ),
    ]);
    let Some(candidate) = field(&expanded, "candidate") else {
        return Ok(report);
    };
    let payload = payload_from_valid_document(candidate, ctx)?;
    let mut selected = match payload.root.root() {
        NativeJsonNode::Array(items) => items
            .iter()
            .filter(|item| frame_matches(item, frame_tree.root(), require_all))
            .map(|item| clone_native_node(item, ctx))
            .collect::<Result<Vec<_>, _>>()?,
        _ => return Err(error("JSONLD_FRAME", "Expanded source is not an array")),
    };
    if explicit {
        let mut keep = frame_fields
            .iter()
            .map(|(key, _)| key)
            .cloned()
            .collect::<BTreeSet<_>>();
        for (key, _) in frame_fields {
            if let Some(iri) = frame_context_iri(frame_tree.root(), key) {
                ctx.charge_text(iri.len(), Utf16::default())?;
                keep.insert(iri.clone());
            }
        }
        keep.insert(Utf16::from("@id"));
        keep.insert(Utf16::from("@type"));
        for node in &mut selected {
            if let NativeJsonNode::Object(fields) = node {
                fields.retain(|(key, _)| keep.contains(key));
            }
        }
    }
    let mut embed_index = BTreeMap::new();
    if let NativeJsonNode::Array(items) = payload.root.root() {
        for item in items {
            collect_frame_nodes(item, &mut embed_index);
        }
    }
    if embed != &Utf16::from("@never") {
        let mut reference_counts = BTreeMap::new();
        for node in &selected {
            count_frame_references(node, &embed_index, &mut reference_counts);
        }
        let mut consumed = BTreeMap::new();
        let mut active = BTreeSet::new();
        let mut embeds = 0usize;
        for node in &mut selected {
            embed_frame_references(
                node,
                &embed_index,
                embed,
                &reference_counts,
                &mut consumed,
                &mut active,
                &mut embeds,
                ctx,
            )?;
        }
    }
    if omit_graph {
        for node in &mut selected {
            if let NativeJsonNode::Object(fields) = node {
                fields.retain(|(key, _)| key != &Utf16::from("@graph"));
            }
        }
    }
    if prune_blank_node_identifiers {
        for node in &mut selected {
            if let NativeJsonNode::Object(fields) = node {
                fields.retain(|(key, value)| {
                    !(key == &Utf16::from("@id")
                        && matches!(value, NativeJsonNode::String(id) if id.units().starts_with(Utf16::from("_:").units())))
                });
            }
        }
    }
    if ordered {
        selected.sort_by(|a, b| {
            native_string(native_member(a, "@id")).cmp(&native_string(native_member(b, "@id")))
        });
    }
    let base = payload_from_valid_document(document, ctx)?;
    let document_id = string(field(document, "id"))
        .ok_or_else(|| error("JSONLD_FRAME", "Document id is missing"))?;
    let expand_context = base
        .expand_context
        .as_ref()
        .map(|tree| tree.render_compact(ctx))
        .transpose()?;
    let mut text = String::new();
    let mut output_units = 0;
    write_native_node(
        &NativeJsonNode::Array(selected),
        &mut text,
        &mut output_units,
        ctx,
    )?;
    ctx.charge_text(1, Utf16::default())?;
    text.try_reserve(1)
        .map_err(|_| error("LIMIT", "JSON-LD frame output allocation failed"))?;
    text.push('\n');
    ctx.charge_text(output_units.saturating_add(1), Utf16::default())?;
    let output_source = Utf16::from(text);
    let selected_document = import_jsonld_document(
        &output_source,
        document_id,
        &base.base_iri,
        Some(&base.processing_mode),
        &base
            .contexts
            .iter()
            .map(|context| JsonLdContextInput {
                url: context.url.clone(),
                document_url: Some(context.document_url.clone()),
                source: context.original_source.clone(),
            })
            .collect::<Vec<_>>(),
        expand_context.as_ref(),
        jsonld_runtime,
        ctx,
    )?;
    let context_node = match native_member(frame_tree.root(), "@context") {
        None => NativeJsonNode::Object(Vec::new()),
        Some(context @ NativeJsonNode::Object(_)) => clone_native_node(context, ctx)?,
        Some(_) => {
            return Err(error(
                "JSONLD_OPTIONS",
                "This framing subset requires an inline object @context",
            ))
        }
    };
    let mut context_text = String::new();
    let mut context_units = 0;
    write_native_node(&context_node, &mut context_text, &mut context_units, ctx)?;
    ctx.charge_text(context_units, Utf16::default())?;
    let context_source = Utf16::from(context_text);
    let compacted = propose_jsonld_compaction(
        &selected_document,
        loss_policy,
        &context_source,
        compact_arrays,
        compact_to_relative,
        jsonld_runtime,
        ctx,
    )?;
    let mut resource_urls = Vec::new();
    let mut seen_resources = BTreeSet::new();
    for report_value in [&report, &compacted] {
        if let Some(Value::Array(items)) = field(report_value, "resourcesUsed") {
            ctx.charge_work(items.len(), Utf16::default())?;
            for item in items {
                if let Value::String(url) = item {
                    ctx.charge_text(url.len(), Utf16::default())?;
                    if seen_resources.insert(url.units().to_vec()) {
                        resource_urls.push(copy_json(item, ctx)?);
                    }
                } else {
                    resource_urls.push(copy_json(item, ctx)?);
                }
            }
        }
    }
    set_field(&mut report, "resourcesUsed", Value::Array(resource_urls))?;
    let Some(candidate) = field(&compacted, "candidate") else {
        set_field(&mut report, "status", Value::string_utf8("blocked"))?;
        if let Some(diagnostics) = field(&compacted, "diagnostics") {
            set_field(&mut report, "diagnostics", copy_json(diagnostics, ctx)?)?;
        }
        return Ok(report);
    };
    let compacted_payload = payload_from_valid_document(candidate, ctx)?;
    let compacted_root = compacted_payload.root.tagged_value_preserving_extras(ctx)?;
    let compacted_source = clone_text(&compacted_payload.original_source, ctx)?;
    let mut preserved = copy_json(document, ctx)?;
    let mut replaced = false;
    if let Some(Value::Array(modules)) = field_mut(&mut preserved, "modules") {
        for module in modules {
            if string(field(module, "id")) != Some(&Utf16::from("jsonld")) {
                continue;
            }
            let Some(Value::Array(elements)) = field_mut(module, "elements") else {
                continue;
            };
            for element in elements {
                if string(field(element, "id")) != Some(&Utf16::from("document")) {
                    continue;
                }
                let Some(Value::Object(extensions)) = field_mut(element, "extensions") else {
                    continue;
                };
                let Some((_, Value::Object(payload_fields))) = extensions
                    .iter_mut()
                    .find(|(name, _)| name == &Utf16::from(JSONLD_EXTENSION))
                else {
                    continue;
                };
                for (name, value) in payload_fields {
                    if name == &Utf16::from("root") {
                        *value = copy_json(&compacted_root, ctx)?;
                    } else if name == &Utf16::from("originalSource") {
                        *value = Value::String(clone_text(&compacted_source, ctx)?);
                    } else if name == &Utf16::from("processingMode") {
                        *value =
                            Value::String(clone_text(&compacted_payload.processing_mode, ctx)?);
                    } else if name == &Utf16::from("baseIRI") {
                        *value = Value::String(clone_text(&compacted_payload.base_iri, ctx)?);
                    }
                }
                replaced = true;
                break;
            }
            if replaced {
                break;
            }
        }
    }
    if !replaced {
        return Err(error("JSONLD_FRAME", "Original JSON-LD payload is missing"));
    }
    let validation = jsonld_runtime.inspect_document(&preserved, ctx)?;
    if !validation.valid {
        return Err(validation_error("JSONLD_FRAME", &validation));
    }
    set_field(&mut report, "candidate", preserved)?;
    set_field(&mut report, "status", Value::string_utf8("candidate"))?;
    if let Some(Value::Array(mut diagnostics)) = field(&report, "diagnostics")
        .map(|value| copy_json(value, ctx))
        .transpose()?
    {
        if let Some(Value::Array(compact_diagnostics)) = field(&compacted, "diagnostics") {
            for diagnostic in compact_diagnostics {
                diagnostics.push(copy_json(diagnostic, ctx)?);
            }
        }
        diagnostics.push(report_diagnostic(
            "JSONLD_FRAMING",
            "Framed candidate applies the inline frame context and compaction settings to selected expanded nodes; the complete source remains in the report.",
            "warning",
        ));
        set_field(&mut report, "diagnostics", Value::Array(diagnostics))?;
    }
    Ok(report)
}

fn collect_frame_nodes<'a>(
    node: &'a NativeJsonNode,
    index: &mut BTreeMap<Utf16, &'a NativeJsonNode>,
) {
    if let Some(NativeJsonNode::String(id)) = native_member(node, "@id") {
        index.entry(id.clone()).or_insert(node);
    }
    if let Some(NativeJsonNode::Array(graph)) = native_member(node, "@graph") {
        for child in graph {
            collect_frame_nodes(child, index);
        }
    }
}

fn count_frame_references(
    node: &NativeJsonNode,
    index: &BTreeMap<Utf16, &NativeJsonNode>,
    counts: &mut BTreeMap<Utf16, usize>,
) {
    match node {
        NativeJsonNode::Object(fields) => {
            if fields.len() == 1 && fields[0].0 == Utf16::from("@id") {
                if let NativeJsonNode::String(id) = &fields[0].1 {
                    if index.contains_key(id) {
                        *counts.entry(id.clone()).or_default() += 1;
                    }
                }
                return;
            }
            for (_, value) in fields {
                count_frame_references(value, index, counts);
            }
        }
        NativeJsonNode::Array(values) => {
            for value in values {
                count_frame_references(value, index, counts);
            }
        }
        _ => {}
    }
}

#[allow(clippy::too_many_arguments)]
fn embed_frame_references(
    node: &mut NativeJsonNode,
    index: &BTreeMap<Utf16, &NativeJsonNode>,
    mode: &Utf16,
    totals: &BTreeMap<Utf16, usize>,
    consumed: &mut BTreeMap<Utf16, usize>,
    active: &mut BTreeSet<Utf16>,
    embeds: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    match node {
        NativeJsonNode::Object(fields) => {
            if fields.len() == 1 && fields[0].0 == Utf16::from("@id") {
                let NativeJsonNode::String(id) = &fields[0].1 else {
                    return Ok(());
                };
                let Some(target) = index.get(id) else {
                    return Ok(());
                };
                if active.contains(id) {
                    return Ok(());
                }
                let position = consumed.entry(id.clone()).or_default();
                *position += 1;
                let total = totals.get(id).copied().unwrap_or(1);
                let should_embed = match mode.units() {
                    units if units == Utf16::from("@never").units() => false,
                    units if units == Utf16::from("@first").units() => *embeds == 0,
                    units if units == Utf16::from("@last").units() => *position == total,
                    units if units == Utf16::from("@once").units() => *position == 1,
                    _ => true,
                };
                if should_embed {
                    *embeds += 1;
                    let mut expanded = clone_native_node(target, ctx)?;
                    active.insert(id.clone());
                    embed_frame_references(
                        &mut expanded,
                        index,
                        mode,
                        totals,
                        consumed,
                        active,
                        embeds,
                        ctx,
                    )?;
                    active.remove(id);
                    *node = expanded;
                }
                return Ok(());
            }
            for (_, value) in fields {
                embed_frame_references(value, index, mode, totals, consumed, active, embeds, ctx)?;
            }
        }
        NativeJsonNode::Array(values) => {
            for value in values {
                embed_frame_references(value, index, mode, totals, consumed, active, embeds, ctx)?;
            }
        }
        _ => {}
    }
    Ok(())
}

#[test]
fn framing_embed_once_replaces_a_reference_without_recursing_forever() {
    let target = NativeJsonNode::Object(vec![
        (
            Utf16::from("@id"),
            NativeJsonNode::String(Utf16::from("https://example.test/target")),
        ),
        (
            Utf16::from("https://schema.org/name"),
            NativeJsonNode::Array(vec![NativeJsonNode::Object(vec![(
                Utf16::from("@value"),
                NativeJsonNode::String(Utf16::from("Target")),
            )])]),
        ),
        (
            Utf16::from("https://schema.org/knows"),
            NativeJsonNode::Array(vec![NativeJsonNode::Object(vec![(
                Utf16::from("@id"),
                NativeJsonNode::String(Utf16::from("https://example.test/target")),
            )])]),
        ),
    ]);
    let id = Utf16::from("https://example.test/target");
    let index = BTreeMap::from([(id.clone(), &target)]);
    let mut reference = NativeJsonNode::Object(vec![(
        Utf16::from("@id"),
        NativeJsonNode::String(id.clone()),
    )]);
    let mut ctx = Context::ordinary();
    embed_frame_references(
        &mut reference,
        &index,
        &Utf16::from("@once"),
        &BTreeMap::from([(id.clone(), 1)]),
        &mut BTreeMap::new(),
        &mut BTreeSet::new(),
        &mut 0,
        &mut ctx,
    )
    .unwrap();
    assert!(matches!(
        native_member(&reference, "https://schema.org/name"),
        Some(NativeJsonNode::Array(_))
    ));
}

/// Projects the current generalized RDF term representation into expanded
/// JSON-LD when every predicate is a named node. Generalized blank predicates
/// have no JSON-LD property-key representation and are reported as blocked.
pub fn propose_generalized_rdf_to_jsonld(
    rdf_document: &Value,
    id: &Utf16,
    base_iri: &Utf16,
    processing_mode: &Utf16,
    loss_policy: &Utf16,
    rdf_runtime: &crate::rdf::RdfRuntime,
    jsonld_runtime: &JsonLdRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if processing_mode != &Utf16::from("json-ld-1.0")
        && processing_mode != &Utf16::from("json-ld-1.1")
    {
        return Err(error("JSONLD_OPTIONS", "Invalid JSON-LD processing mode"));
    }
    if loss_policy != &Utf16::from("report") && loss_policy != &Utf16::from("reject") {
        return Err(error("JSONLD_OPTIONS", "Invalid loss policy"));
    }
    parse_absolute(base_iri, ctx)?;
    let mut report = Value::Object(vec![
        (Utf16::from("source"), copy_json(rdf_document, ctx)?),
        (Utf16::from("id"), Value::String(clone_text(id, ctx)?)),
        (
            Utf16::from("baseIRI"),
            Value::String(clone_text(base_iri, ctx)?),
        ),
        (
            Utf16::from("processingMode"),
            Value::String(clone_text(processing_mode, ctx)?),
        ),
        (
            Utf16::from("lossPolicy"),
            Value::String(clone_text(loss_policy, ctx)?),
        ),
        (Utf16::from("status"), Value::string_utf8("blocked")),
        (Utf16::from("complete"), Value::Bool(false)),
        (Utf16::from("resourcesUsed"), Value::Array(Vec::new())),
        (Utf16::from("diagnostics"), Value::Array(Vec::new())),
    ]);
    let quads = match crate::rdf::get_generalized_rdf_quads(rdf_runtime, rdf_document, ctx) {
        Ok(Value::Array(quads)) => quads,
        Ok(_) => {
            return Err(error(
                "JSONLD_RDF_SOURCE",
                "Expected generalized quad array",
            ))
        }
        Err(failure) if failure.is_control_failure() || failure.code == "LIMIT" => {
            return Err(failure)
        }
        Err(failure) => {
            set_field(
                &mut report,
                "diagnostics",
                Value::Array(vec![report_diagnostic(
                    "JSONLD_FROM_GENERALIZED_BLOCKED",
                    &failure
                        .message
                        .to_utf8()
                        .unwrap_or_else(|_| "Generalized RDF source is unsupported".to_owned()),
                    "error",
                )]),
            )?;
            return Ok(report);
        }
    };
    let mut groups: BTreeMap<Option<Utf16>, BTreeMap<Utf16, Vec<(Utf16, Value)>>> = BTreeMap::new();
    let mut raw_json_tokens = Vec::<(String, String)>::new();
    ctx.charge_work(quads.len(), Utf16::default())?;
    for quad in &quads {
        let subject = generalized_jsonld_id(
            field(quad, "subject")
                .ok_or_else(|| error("JSONLD_RDF_SOURCE", "Quad subject missing"))?,
            true,
            ctx,
        )?;
        let predicate_value = field(quad, "predicate")
            .ok_or_else(|| error("JSONLD_RDF_SOURCE", "Quad predicate missing"))?;
        let mut predicate = match generalized_jsonld_id(predicate_value, false, ctx) {
            Ok(predicate) => predicate,
            Err(failure) if failure.is_control_failure() || failure.code == "LIMIT" => {
                return Err(failure)
            }
            Err(failure) => {
                set_field(
                    &mut report,
                    "diagnostics",
                    Value::Array(vec![report_diagnostic(
                        "JSONLD_FROM_GENERALIZED_BLOCKED",
                        &failure.message.to_utf8().unwrap_or_else(|_| {
                            "Generalized RDF predicate is unsupported".to_owned()
                        }),
                        "error",
                    )]),
                )?;
                return Ok(report);
            }
        };
        let object_value = field(quad, "object")
            .ok_or_else(|| error("JSONLD_RDF_SOURCE", "Quad object missing"))?;
        let object_type = string(field(object_value, "termType"));
        let is_rdf_type = predicate
            == Utf16::from("http://www.w3.org/1999/02/22-rdf-syntax-ns#type")
            && object_type != Some(&Utf16::from("Literal"));
        if is_rdf_type {
            predicate = Utf16::from("@type");
        }
        let object = if object_type == Some(&Utf16::from("Literal")) {
            let lexical = string(field(object_value, "value"))
                .ok_or_else(|| error("JSONLD_RDF_TERM", "Literal value missing"))?;
            let datatype = field(object_value, "datatype")
                .map(|value| generalized_jsonld_id(value, false, ctx))
                .transpose()?;
            let is_json = datatype.as_ref().is_some_and(|value| {
                value == &Utf16::from("http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON")
            });
            if is_json && processing_mode == &Utf16::from("json-ld-1.1") {
                let parsed = match NativeJsonTree::parse_json(lexical.units(), ctx) {
                    Ok(value) => value,
                    Err(failure) if failure.is_control_failure() || failure.code == "LIMIT" => {
                        return Err(failure)
                    }
                    Err(failure) => {
                        set_field(
                            &mut report,
                            "diagnostics",
                            Value::Array(vec![report_diagnostic(
                                "JSONLD_FROM_GENERALIZED_BLOCKED",
                                &failure
                                    .message
                                    .to_utf8()
                                    .unwrap_or_else(|_| "Malformed rdf:JSON literal".to_owned()),
                                "error",
                            )]),
                        )?;
                        return Ok(report);
                    }
                };
                let compact = parsed.render_compact(ctx)?;
                ctx.charge_text(compact.len(), Utf16::default())?;
                let raw = compact
                    .to_utf8()
                    .map_err(|_| error("JSONLD_RDF_JSON", "Invalid RDF JSON literal"))?;
                let marker = format!("__UMF_RAW_GENERALIZED_JSON_{}__", raw_json_tokens.len());
                ctx.charge_text(marker.encode_utf16().count(), Utf16::default())?;
                raw_json_tokens.push((marker.clone(), raw));
                Value::Object(vec![
                    (Utf16::from("@value"), Value::String(Utf16::from(marker))),
                    (Utf16::from("@type"), Value::string_utf8("@json")),
                ])
            } else {
                let mut fields = vec![(
                    Utf16::from("@value"),
                    Value::String(clone_text(lexical, ctx)?),
                )];
                if let Some(language) = string(field(object_value, "language")) {
                    fields.push((
                        Utf16::from("@language"),
                        Value::String(clone_text(language, ctx)?),
                    ));
                } else if let Some(datatype) = datatype {
                    if datatype != Utf16::from("http://www.w3.org/2001/XMLSchema#string") {
                        fields.push((Utf16::from("@type"), Value::String(datatype)));
                    }
                }
                Value::Object(fields)
            }
        } else {
            let object_id = generalized_jsonld_id(object_value, true, ctx)?;
            if is_rdf_type {
                Value::String(object_id)
            } else {
                Value::Object(vec![(Utf16::from("@id"), Value::String(object_id))])
            }
        };
        let graph_value =
            field(quad, "graph").ok_or_else(|| error("JSONLD_RDF_SOURCE", "Quad graph missing"))?;
        let graph_type = string(field(graph_value, "termType"));
        let graph_key = if graph_type == Some(&Utf16::from("DefaultGraph")) {
            None
        } else {
            Some(generalized_jsonld_id(graph_value, true, ctx)?)
        };
        let node = groups
            .entry(graph_key)
            .or_default()
            .entry(subject.clone())
            .or_insert_with(|| vec![(Utf16::from("@id"), Value::String(subject))]);
        ctx.charge_work(node.len(), Utf16::default())?;
        if let Some((_, Value::Array(values))) =
            node.iter_mut().find(|(name, _)| name == &predicate)
        {
            values.push(object);
        } else {
            node.push((predicate, Value::Array(vec![object])));
        }
    }
    for graph_nodes in groups.values_mut() {
        if let Err(failure) = collapse_rdf_lists(graph_nodes, ctx) {
            if failure.is_control_failure() || failure.code == "LIMIT" {
                return Err(failure);
            }
            set_field(
                &mut report,
                "diagnostics",
                Value::Array(vec![report_diagnostic(
                    "JSONLD_FROM_GENERALIZED_BLOCKED",
                    &failure
                        .message
                        .to_utf8()
                        .unwrap_or_else(|_| "Malformed generalized RDF collection".to_owned()),
                    "error",
                )]),
            )?;
            return Ok(report);
        }
    }
    let mut nodes = Vec::new();
    for (graph, graph_nodes) in groups {
        let mut members = Vec::new();
        for (_, fields) in graph_nodes {
            members.push(Value::Object(fields));
        }
        if let Some(graph_id) = graph {
            nodes.push(Value::Object(vec![
                (Utf16::from("@id"), Value::String(graph_id)),
                (Utf16::from("@graph"), Value::Array(members)),
            ]));
        } else {
            nodes.extend(members);
        }
    }
    let output = serialization::write_json_value(&Value::Array(nodes), Format::Json, ctx)?;
    let mut output = output.to_utf8().map_err(|_| {
        error(
            "JSONLD_FROM_GENERALIZED",
            "Generated JSON-LD is not well-formed UTF-16",
        )
    })?;
    for (marker, raw_json) in raw_json_tokens {
        let quoted = format!("\"{marker}\"");
        if output.matches(&quoted).count() != 1 {
            return Err(error(
                "JSONLD_RDF_JSON",
                "RDF JSON marker was ambiguous in generated output",
            ));
        }
        ctx.charge_text(raw_json.encode_utf16().count(), Utf16::default())?;
        output = output.replacen(&quoted, &raw_json, 1);
    }
    let output = Utf16::from(output);
    let candidate = match import_jsonld_document(
        &output,
        id,
        base_iri,
        Some(processing_mode),
        &[],
        None,
        jsonld_runtime,
        ctx,
    ) {
        Ok(candidate) => candidate,
        Err(failure) if failure.is_control_failure() || failure.code == "LIMIT" => {
            return Err(failure)
        }
        Err(failure) => {
            set_field(
                &mut report,
                "diagnostics",
                Value::Array(vec![report_diagnostic(
                    "JSONLD_FROM_GENERALIZED_BLOCKED",
                    &failure
                        .message
                        .to_utf8()
                        .unwrap_or_else(|_| "Generalized RDF projection failed".to_owned()),
                    "error",
                )]),
            )?;
            return Ok(report);
        }
    };
    set_field(&mut report, "candidate", candidate)?;
    set_field(&mut report, "status", Value::string_utf8("candidate"))?;
    set_field(
        &mut report,
        "diagnostics",
        Value::Array(vec![report_diagnostic(
            "JSONLD_FROM_GENERALIZED",
            "Derived JSON-LD view retains the full generalized dataset source; blank identities remain local and no RDF 1.1 or entailment equivalence is asserted.",
            "warning",
        )]),
    )?;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_archive_and_copied_node_edit_round_trip() {
        let mut ctx = Context::ordinary();
        let runtime = JsonLdRuntime::new(&mut ctx).unwrap();
        let source =
            Utf16::from(r#"{"@context":"https://example.test/context","name":"old","n":1.2300}"#);
        let document = import_jsonld_document(
            &source,
            &Utf16::from("catalog"),
            &Utf16::from("https://example.test/"),
            None,
            &[],
            None,
            &runtime,
            &mut ctx,
        )
        .unwrap();

        assert_eq!(
            export_jsonld_document(&document, &runtime, &mut ctx).unwrap(),
            source
        );
        let name = get_jsonld_node(&document, &Utf16::from("/name"), &runtime, &mut ctx).unwrap();
        assert_eq!(
            name.root(),
            &crate::native_json::NativeJsonNode::String(Utf16::from("old"))
        );

        let (edited, validation) = propose_jsonld_node_edit(
            &document,
            &Utf16::from("/name"),
            &Utf16::from(r#""new""#),
            &runtime,
            &mut ctx,
        )
        .unwrap();
        assert!(validation.valid);
        assert_eq!(
            export_jsonld_document(&document, &runtime, &mut ctx).unwrap(),
            source
        );
        let rendered = export_jsonld_document(&edited, &runtime, &mut ctx).unwrap();
        let expected =
            Utf16::from(r#"{"@context":"https://example.test/context","name":"new","n":1.2300}"#);
        let mut expected_units = expected.units().to_vec();
        expected_units.push(b'\n' as u16);
        assert_eq!(rendered, Utf16::new(expected_units));
    }

    #[test]
    fn expansion_uses_only_supplied_contexts_and_keeps_source_document() {
        let mut ctx = Context::ordinary();
        let runtime = JsonLdRuntime::new(&mut ctx).unwrap();
        let source = Utf16::from(
            r#"{"@context":"https://example.test/context","@id":"https://example.test/alice","name":"Alice","count":9007199254740993}"#,
        );
        let supplied = JsonLdContextInput {
            url: Utf16::from("https://example.test/context"),
            document_url: None,
            source: Utf16::from(
                r#"{"@context":{"name":"https://schema.org/name","count":"https://schema.org/number"}}"#,
            ),
        };
        let document = import_jsonld_document(
            &source,
            &Utf16::from("alice"),
            &Utf16::from("https://example.test/"),
            None,
            &[supplied],
            None,
            &runtime,
            &mut ctx,
        )
        .unwrap();
        let report =
            propose_jsonld_expansion(&document, &Utf16::from("report"), &runtime, &mut ctx)
                .unwrap();
        assert_eq!(field(&report, "complete"), Some(&Value::Bool(false)));
        assert_eq!(
            field(&report, "status"),
            Some(&Value::string_utf8("candidate"))
        );
        assert_eq!(field(&report, "source"), Some(&document));
        assert_eq!(
            field(&report, "resourcesUsed"),
            Some(&Value::Array(vec![Value::string_utf8(
                "https://example.test/context",
            )]))
        );
        let candidate = field(&report, "candidate").unwrap();
        let exported = export_jsonld_document(candidate, &runtime, &mut ctx).unwrap();
        let exported = exported.to_utf8().unwrap();
        assert!(exported.contains("9007199254740993"));
        assert!(exported.contains("https://schema.org/number"));
    }
}
/// Proposes an ordinary RDF dataset projection while keeping the original
/// JSON-LD document in the report. This does not claim lossless replacement.
pub fn propose_jsonld_to_rdf(
    document: &Value,
    id: &Utf16,
    produce_generalized_rdf: bool,
    numeric_policy: &Utf16,
    loss_policy: &Utf16,
    rdf_direction: Option<&Utf16>,
    runtime: &JsonLdRuntime,
    rdf_runtime: &crate::rdf::RdfRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if loss_policy != &Utf16::from("report") && loss_policy != &Utf16::from("reject") {
        return Err(error(
            "JSONLD_OPTIONS",
            "Expected explicit report or reject loss policy",
        ));
    }
    if numeric_policy != &Utf16::from("strict") && numeric_policy != &Utf16::from("binary64") {
        return Err(error(
            "JSONLD_OPTIONS",
            "numericPolicy must be strict or binary64",
        ));
    }
    if rdf_direction.is_some_and(|direction| {
        direction != &Utf16::from("i18n-datatype") && direction != &Utf16::from("compound-literal")
    }) {
        return Err(error(
            "JSONLD_RDF_OPTIONS",
            "rdfDirection must be null, i18n-datatype, or compound-literal",
        ));
    }
    let source_copy = copy_json(document, ctx)?;
    let rdf_direction_value = rdf_direction
        .map(|value| clone_text(value, ctx).map(Value::String))
        .transpose()?
        .unwrap_or(Value::Null);
    let mut report = Value::Object(vec![
        (Utf16::from("source"), source_copy),
        (Utf16::from("id"), Value::String(clone_text(id, ctx)?)),
        (
            Utf16::from("produceGeneralizedRdf"),
            Value::Bool(produce_generalized_rdf),
        ),
        (
            Utf16::from("numericPolicy"),
            Value::String(clone_text(numeric_policy, ctx)?),
        ),
        (
            Utf16::from("lossPolicy"),
            Value::String(clone_text(loss_policy, ctx)?),
        ),
        (Utf16::from("rdfDirection"), rdf_direction_value),
        (Utf16::from("status"), Value::string_utf8("blocked")),
        (Utf16::from("complete"), Value::Bool(false)),
        (Utf16::from("resourcesUsed"), Value::Array(Vec::new())),
        (Utf16::from("diagnostics"), Value::Array(Vec::new())),
    ]);
    let expansion = propose_jsonld_expansion(document, loss_policy, runtime, ctx)?;
    let Some(expanded_doc) = field(&expansion, "candidate") else {
        let diagnostics = match field(&expansion, "diagnostics") {
            Some(Value::Array(ds)) => {
                ctx.charge_work(ds.len(), Utf16::default())?;
                let mut copied = Vec::with_capacity(ds.len());
                for diagnostic in ds {
                    copied.push(copy_json(diagnostic, ctx)?);
                }
                Value::Array(copied)
            }
            _ => Value::Array(Vec::new()),
        };
        set_field(&mut report, "diagnostics", diagnostics)?;
        return Ok(report);
    };
    let payload = payload_from_document(expanded_doc, runtime, ctx)?;
    if payload.processing_mode == Utf16::from("json-ld-1.0") && rdf_direction.is_some() {
        set_field(
            &mut report,
            "diagnostics",
            Value::Array(vec![report_diagnostic(
                "JSONLD_OPTIONS",
                "rdfDirection conversion requires JSON-LD 1.1; source retained.",
                "error",
            )]),
        )?;
        return Ok(report);
    }
    fn has_inexact_number(node: &crate::native_json::NativeJsonNode) -> bool {
        use crate::native_json::NativeJsonNode as N;
        match node {
            N::Number(token) => token
                .parse::<f64>()
                .ok()
                .filter(|n| n.is_finite())
                .is_none_or(|n| {
                    (n.fract() == 0.0 && n.abs() > 9_007_199_254_740_991.0)
                        || crate::serialization::decimal_canonical(token)
                            != crate::serialization::decimal_canonical(
                                &crate::ecma_number_to_string(n),
                            )
                }),
            N::Array(items) => items.iter().any(has_inexact_number),
            N::Object(members) => members.iter().any(|(_, value)| has_inexact_number(value)),
            _ => false,
        }
    }
    let inexact_numbers = has_inexact_number(payload.root.root());
    if inexact_numbers && numeric_policy == &Utf16::from("strict") {
        set_field(&mut report, "diagnostics", Value::Array(vec![report_diagnostic(
                "JSONLD_RDF_NUMBER",
                "Exact JSON number cannot be represented by RDF numeric conversion; source retained.",
                "error",
            )]))?;
        return Ok(report);
    }
    if inexact_numbers && loss_policy == &Utf16::from("reject") {
        set_field(&mut report, "diagnostics", Value::Array(vec![report_diagnostic(
            "JSONLD_RDF_NUMBER_LOSS",
            "At least one exact JSON number would be converted through binary64 for RDF; original JSON-LD source is retained.",
            "warning",
        )]))?;
        return Ok(report);
    }
    let json = payload.root.render_compact(ctx)?;
    ctx.charge_text(json.len(), Utf16::default())?;
    let json = json
        .to_utf8()
        .map_err(|_| error("JSONLD_SOURCE", "Expanded JSON is not well-formed UTF-16"))?;
    let parsed = json_ld::syntax::Value::parse_str(&json)
        .map_err(|e| error_owned("JSONLD_SOURCE", e.to_string()))?
        .0;
    let base_text = payload
        .base_iri
        .to_utf8()
        .map_err(|_| error("JSONLD_IRI", "baseIRI is not well-formed UTF-16"))?;
    let base =
        json_ld::IriBuf::new(base_text).map_err(|_| error("JSONLD_IRI", "baseIRI is invalid"))?;
    let mut options = json_ld::Options::default();
    options.processing_mode = if payload.processing_mode == Utf16::from("json-ld-1.0") {
        json_ld::ProcessingMode::JsonLd1_0
    } else {
        json_ld::ProcessingMode::JsonLd1_1
    };
    options.rdf_direction = rdf_direction.map(|direction| {
        if direction == &Utf16::from("i18n-datatype") {
            json_ld::rdf::RdfDirection::I18nDatatype
        } else {
            json_ld::rdf::RdfDirection::CompoundLiteral
        }
    });
    options.produce_generalized_rdf = produce_generalized_rdf;
    let input = json_ld::RemoteDocument::new(None, None, parsed);
    use json_ld::JsonLdProcessor;
    let mut vocabulary: json_ld::rdf_types::vocabulary::IndexVocabulary =
        json_ld::rdf_types::vocabulary::IndexVocabulary::new();
    use json_ld::rdf_types::vocabulary::IriVocabularyMut;
    options.base = Some(vocabulary.insert(base.as_iri()));
    let mut warnings = ProcessorWarnings::default();
    let rdf_result = futures::executor::block_on(input.to_rdf_full(
        &mut vocabulary,
        json_ld::rdf_types::generator::Blank::new(),
        &json_ld::NoLoader,
        options,
        &mut warnings,
    ));
    if loss_policy == &Utf16::from("reject") && !warnings.messages.is_empty() {
        ctx.charge_work(warnings.messages.len(), Utf16::default())?;
        let messages = warnings
            .messages
            .iter()
            .map(|message| report_diagnostic("JSONLD_RDF_EVENT", message, "warning"))
            .collect();
        set_field(&mut report, "diagnostics", Value::Array(messages))?;
        return Ok(report);
    }
    let (rendered_quads, vocabulary) = match rdf_result {
        Ok(mut rdf) => {
            let mut quads = Vec::new();
            for quad in rdf.cloned_quads() {
                ctx.charge_work(1, Utf16::default())?;
                quads.push(quad);
            }
            (quads, rdf.into_vocabulary())
        }
        Err(failure) => {
            set_field(
                &mut report,
                "diagnostics",
                Value::Array(vec![report_diagnostic(
                    "JSONLD_TO_RDF_BLOCKED",
                    &failure.to_string(),
                    "error",
                )]),
            )?;
            return Ok(report);
        }
    };
    let candidate = if produce_generalized_rdf {
        let mut quads = Vec::with_capacity(rendered_quads.len());
        for quad in rendered_quads {
            ctx.charge_work(1, Utf16::default())?;
            quads.push(generalized_quad_value(quad, &vocabulary, ctx)?);
        }
        let encoded = serialization::write_json_value(&Value::Array(quads), Format::Json, ctx)?;
        crate::rdf::import_generalized_rdf_dataset(rdf_runtime, encoded.units(), id, None, ctx)?
    } else {
        ctx.charge_work(rendered_quads.len(), Utf16::default())?;
        let mut values = Vec::with_capacity(rendered_quads.len());
        for quad in rendered_quads {
            let generalized = generalized_quad_value(quad, &vocabulary, ctx)?;
            values.push(normalized_rdf_quad(&generalized, ctx)?);
        }
        let quads = Value::Array(values);
        let rdf_source = crate::rdf::serialize_nquads_values(&quads, ctx)?;
        crate::rdf::import_rdf_nquads(rdf_runtime, rdf_source.units(), id, None, ctx)?
    };
    set_field(&mut report, "candidate", candidate)?;
    set_field(&mut report, "status", Value::string_utf8("candidate"))?;
    let resources_used = field(&expansion, "resourcesUsed")
        .map(|value| copy_json(value, ctx))
        .transpose()?
        .unwrap_or(Value::Array(Vec::new()));
    set_field(&mut report, "resourcesUsed", resources_used)?;
    ctx.charge_work(warnings.messages.len(), Utf16::default())?;
    let expansion_diagnostics = match field(&expansion, "diagnostics") {
        Some(Value::Array(items)) => items.as_slice(),
        _ => &[],
    };
    ctx.charge_work(expansion_diagnostics.len(), Utf16::default())?;
    let mut diagnostics = Vec::with_capacity(
        expansion_diagnostics
            .len()
            .saturating_add(warnings.messages.len())
            .saturating_add(2),
    );
    for diagnostic in expansion_diagnostics {
        if string(field(diagnostic, "code")) == Some(&Utf16::from("JSONLD_EXPANSION")) {
            continue;
        }
        diagnostics.push(copy_json(diagnostic, ctx)?);
    }
    for message in &warnings.messages {
        ctx.charge_text(message.encode_utf16().count(), Utf16::default())?;
        diagnostics.push(report_diagnostic("JSONLD_RDF_EVENT", message, "warning"));
    }
    if inexact_numbers {
        diagnostics.push(report_diagnostic(
            "JSONLD_RDF_NUMBER_LOSS",
            "At least one exact JSON number was converted through binary64 for RDF; original JSON-LD source is retained.",
            "warning",
        ));
    }
    diagnostics.push(report_diagnostic(
        "JSONLD_TO_RDF",
        "RDF projection is a derived dataset; the JSON-LD source and context archives remain authoritative in this report.",
        "warning",
    ));
    set_field(&mut report, "diagnostics", Value::Array(diagnostics))?;
    Ok(report)
}
type RdfResource = json_ld::rdf_types::Term<
    json_ld::rdf_types::Id<
        json_ld::rdf_types::vocabulary::IriIndex,
        json_ld::rdf_types::vocabulary::BlankIdIndex,
    >,
    json_ld::rdf_types::vocabulary::LiteralIndex,
>;

fn generalized_id_value(
    id: json_ld::rdf_types::Id<
        json_ld::rdf_types::vocabulary::IriIndex,
        json_ld::rdf_types::vocabulary::BlankIdIndex,
    >,
    vocabulary: &json_ld::rdf_types::vocabulary::IndexVocabulary,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    use json_ld::rdf_types::vocabulary::{BlankIdVocabulary, IriVocabulary};
    let (term_type, value) = match id {
        json_ld::rdf_types::Id::Iri(index) => (
            "NamedNode",
            vocabulary
                .iri(&index)
                .ok_or_else(|| error("JSONLD_RDF_TERM", "Missing generated RDF IRI"))?
                .as_str()
                .to_owned(),
        ),
        json_ld::rdf_types::Id::Blank(index) => (
            "BlankNode",
            vocabulary
                .blank_id(&index)
                .ok_or_else(|| error("JSONLD_RDF_TERM", "Missing generated blank identifier"))?
                .suffix()
                .to_owned(),
        ),
    };
    ctx.charge_text(value.encode_utf16().count(), Utf16::default())?;
    Ok(Value::Object(vec![
        (Utf16::from("termType"), Value::string_utf8(term_type)),
        (Utf16::from("value"), Value::string_utf8(&value)),
    ]))
}

fn generalized_quad_value(
    quad: json_ld::rdf_types::Quad<
        json_ld::rdf_types::Id<
            json_ld::rdf_types::vocabulary::IriIndex,
            json_ld::rdf_types::vocabulary::BlankIdIndex,
        >,
        json_ld::rdf_types::Id<
            json_ld::rdf_types::vocabulary::IriIndex,
            json_ld::rdf_types::vocabulary::BlankIdIndex,
        >,
        json_ld::rdf_types::Term<
            json_ld::rdf_types::Id<
                json_ld::rdf_types::vocabulary::IriIndex,
                json_ld::rdf_types::vocabulary::BlankIdIndex,
            >,
            json_ld::rdf_types::vocabulary::LiteralIndex,
        >,
        json_ld::rdf_types::Id<
            json_ld::rdf_types::vocabulary::IriIndex,
            json_ld::rdf_types::vocabulary::BlankIdIndex,
        >,
    >,
    vocabulary: &json_ld::rdf_types::vocabulary::IndexVocabulary,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    use json_ld::rdf_types::vocabulary::{IriVocabulary, LiteralVocabulary};
    let json_ld::rdf_types::Quad(subject, predicate, object, graph) = quad;
    let object = match object {
        json_ld::rdf_types::Term::Id(id) => generalized_id_value(id, vocabulary, ctx)?,
        json_ld::rdf_types::Term::Literal(index) => {
            let literal = vocabulary
                .literal(&index)
                .ok_or_else(|| error("JSONLD_RDF_TERM", "Missing generated RDF literal"))?;
            ctx.charge_text(literal.value.encode_utf16().count(), Utf16::default())?;
            let (datatype, language) = match &literal.type_ {
                json_ld::rdf_types::LiteralTypeRef::Any(index) => (
                    vocabulary
                        .iri(index)
                        .ok_or_else(|| error("JSONLD_RDF_TERM", "Missing literal datatype IRI"))?
                        .as_str(),
                    None,
                ),
                json_ld::rdf_types::LiteralTypeRef::LangString(language) => (
                    "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString",
                    Some(language.as_str()),
                ),
            };
            let mut fields = vec![
                (Utf16::from("termType"), Value::string_utf8("Literal")),
                (Utf16::from("value"), Value::string_utf8(&literal.value)),
                (
                    Utf16::from("datatype"),
                    Value::Object(vec![
                        (Utf16::from("termType"), Value::string_utf8("NamedNode")),
                        (Utf16::from("value"), {
                            ctx.charge_text(datatype.encode_utf16().count(), Utf16::default())?;
                            Value::string_utf8(datatype)
                        }),
                    ]),
                ),
            ];
            if let Some(language) = language {
                ctx.charge_text(language.encode_utf16().count(), Utf16::default())?;
                fields.push((Utf16::from("language"), Value::string_utf8(language)));
            }
            Value::Object(fields)
        }
    };
    let graph = match graph {
        Some(graph) => generalized_id_value(graph, vocabulary, ctx)?,
        None => Value::Object(vec![
            (Utf16::from("termType"), Value::string_utf8("DefaultGraph")),
            (Utf16::from("value"), Value::String(Utf16::default())),
        ]),
    };
    Ok(Value::Object(vec![
        (
            Utf16::from("subject"),
            generalized_id_value(subject, vocabulary, ctx)?,
        ),
        (
            Utf16::from("predicate"),
            generalized_id_value(predicate, vocabulary, ctx)?,
        ),
        (Utf16::from("object"), object),
        (Utf16::from("graph"), graph),
    ]))
}

fn normalized_rdf_term(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let kind = string(field(value, "termType"))
        .ok_or_else(|| error("JSONLD_RDF_TERM", "RDF term type missing"))?;
    let lexical = string(field(value, "value"))
        .ok_or_else(|| error("JSONLD_RDF_TERM", "RDF term value missing"))?;
    let normalized_kind = match kind {
        kind if kind == &Utf16::from("NamedNode") => "iri",
        kind if kind == &Utf16::from("BlankNode") => "blank",
        kind if kind == &Utf16::from("Literal") => "literal",
        _ => return Err(error("JSONLD_RDF_TERM", "Unsupported RDF term type")),
    };
    let mut fields = vec![
        (Utf16::from("kind"), Value::string_utf8(normalized_kind)),
        (
            Utf16::from("value"),
            Value::String(clone_text(lexical, ctx)?),
        ),
    ];
    if normalized_kind == "literal" {
        let datatype = string(field(
            field(value, "datatype").unwrap_or(&Value::Null),
            "value",
        ))
        .ok_or_else(|| error("JSONLD_RDF_TERM", "Literal datatype missing"))?;
        fields.push((
            Utf16::from("datatype"),
            Value::String(clone_text(datatype, ctx)?),
        ));
        if let Some(language) = string(field(value, "language")) {
            fields.push((
                Utf16::from("language"),
                Value::String(clone_text(language, ctx)?),
            ));
        }
    }
    Ok(Value::Object(fields))
}

fn normalized_rdf_quad(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let graph =
        field(value, "graph").ok_or_else(|| error("JSONLD_RDF_TERM", "RDF graph missing"))?;
    let graph = if string(field(graph, "termType")) == Some(&Utf16::from("DefaultGraph")) {
        Value::Object(vec![(Utf16::from("kind"), Value::string_utf8("default"))])
    } else {
        normalized_rdf_term(graph, ctx)?
    };
    Ok(Value::Object(vec![
        (
            Utf16::from("subject"),
            normalized_rdf_term(
                field(value, "subject")
                    .ok_or_else(|| error("JSONLD_RDF_TERM", "RDF subject missing"))?,
                ctx,
            )?,
        ),
        (
            Utf16::from("predicate"),
            normalized_rdf_term(
                field(value, "predicate")
                    .ok_or_else(|| error("JSONLD_RDF_TERM", "RDF predicate missing"))?,
                ctx,
            )?,
        ),
        (
            Utf16::from("object"),
            normalized_rdf_term(
                field(value, "object")
                    .ok_or_else(|| error("JSONLD_RDF_TERM", "RDF object missing"))?,
                ctx,
            )?,
        ),
        (Utf16::from("graph"), graph),
    ]))
}

fn apply_from_rdf_options(
    value: &mut Value,
    use_native_types: bool,
    use_rdf_type: bool,
    i18n_direction: bool,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    const RDF_TYPE: &str = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
    match value {
        Value::Array(items) => {
            for item in items {
                ctx.charge_work(1, Utf16::default())?;
                apply_from_rdf_options(item, use_native_types, use_rdf_type, i18n_direction, ctx)?;
            }
        }
        Value::Object(fields) => {
            ctx.charge_work(fields.len(), Utf16::default())?;
            for (_, child) in fields.iter_mut() {
                apply_from_rdf_options(child, use_native_types, use_rdf_type, i18n_direction, ctx)?;
            }
            let value_index = fields
                .iter()
                .position(|(name, _)| name == &Utf16::from("@value"));
            let type_index = fields
                .iter()
                .position(|(name, _)| name == &Utf16::from("@type"));
            if let (Some(value_index), Some(type_index)) = (value_index, type_index) {
                let lexical = match &fields[value_index].1 {
                    Value::String(text) => {
                        ctx.charge_text(text.len(), Utf16::default())?;
                        Some(text.clone())
                    }
                    _ => None,
                };
                let type_iri = match &fields[type_index].1 {
                    Value::String(text) => {
                        ctx.charge_text(text.len(), Utf16::default())?;
                        text.to_utf8().ok()
                    }
                    _ => None,
                };
                if let (Some(lexical), Some(type_iri)) = (lexical, type_iri) {
                    let mut remove_type = false;
                    if i18n_direction && type_iri.starts_with("https://www.w3.org/ns/i18n#") {
                        let encoded = &type_iri["https://www.w3.org/ns/i18n#".len()..];
                        let Some((language, direction)) = encoded.rsplit_once('_') else {
                            return Err(error(
                                "JSONLD_RDF_DIRECTION",
                                "Malformed i18n datatype; expected <language>_<ltr|rtl>",
                            ));
                        };
                        if language.contains('_')
                            || language.contains('#')
                            || !matches!(direction, "ltr" | "rtl")
                        {
                            return Err(error(
                                "JSONLD_RDF_DIRECTION",
                                "Malformed i18n datatype; expected one <language>_<ltr|rtl>",
                            ));
                        }
                        remove_type = true;
                        if !language.is_empty() {
                            ctx.charge_text(language.encode_utf16().count(), Utf16::default())?;
                            fields.push((Utf16::from("@language"), Value::string_utf8(language)));
                        }
                        fields.push((Utf16::from("@direction"), Value::string_utf8(direction)));
                    }
                    if use_native_types && !remove_type {
                        let native = if type_iri == "http://www.w3.org/2001/XMLSchema#string" {
                            Some(Value::String(lexical.clone()))
                        } else if type_iri == "http://www.w3.org/2001/XMLSchema#boolean" {
                            match lexical.to_utf8().ok().as_deref() {
                                Some("true" | "1") => Some(Value::Bool(true)),
                                Some("false" | "0") => Some(Value::Bool(false)),
                                _ => None,
                            }
                        } else if type_iri == "http://www.w3.org/2001/XMLSchema#integer"
                            || type_iri == "http://www.w3.org/2001/XMLSchema#double"
                        {
                            lexical.to_utf8().ok().and_then(|token| {
                                let number = token.parse::<f64>().ok()?;
                                (number.is_finite()
                                    && (type_iri.ends_with("#double") || number.fract() == 0.0)
                                    && number.abs() <= 9_007_199_254_740_991.0
                                    && crate::serialization::decimal_canonical(&token)
                                        == crate::serialization::decimal_canonical(
                                            &crate::ecma_number_to_string(number),
                                        ))
                                .then_some(Value::Number(number))
                            })
                        } else {
                            None
                        };
                        if let Some(native) = native {
                            fields[value_index].1 = native;
                            remove_type = true;
                        }
                    }
                    if remove_type {
                        fields.remove(type_index);
                    }
                }
            }
            if use_rdf_type
                && !fields
                    .iter()
                    .any(|(name, _)| name == &Utf16::from("@value"))
            {
                if let Some(index) = fields
                    .iter()
                    .position(|(name, _)| name == &Utf16::from("@type"))
                {
                    let types = fields.remove(index).1;
                    let mut ids = Vec::new();
                    match types {
                        Value::String(id) => ids.push(id),
                        Value::Array(values) => {
                            for value in values {
                                if let Value::String(id) = value {
                                    ids.push(id);
                                }
                            }
                        }
                        _ => (),
                    }
                    if !ids.is_empty() {
                        let mut nodes = Vec::with_capacity(ids.len());
                        for id in ids {
                            ctx.charge_text(id.len(), Utf16::default())?;
                            nodes
                                .push(Value::Object(vec![(Utf16::from("@id"), Value::String(id))]));
                        }
                        fields.push((Utf16::from(RDF_TYPE), Value::Array(nodes)));
                    }
                }
            }
        }
        _ => (),
    }
    Ok(())
}

fn collapse_rdf_lists(
    nodes: &mut BTreeMap<Utf16, Vec<(Utf16, Value)>>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    const FIRST: &str = "http://www.w3.org/1999/02/22-rdf-syntax-ns#first";
    const REST: &str = "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest";
    const NIL: &str = "http://www.w3.org/1999/02/22-rdf-syntax-ns#nil";

    fn values<'a>(fields: &'a [(Utf16, Value)], key: &str) -> Option<&'a [Value]> {
        fields.iter().find_map(|(name, value)| {
            if name != &Utf16::from(key) {
                return None;
            }
            match value {
                Value::Array(items) => Some(items.as_slice()),
                _ => None,
            }
        })
    }
    fn id(value: &Value) -> Option<&Utf16> {
        match value {
            Value::Object(fields) => fields.iter().find_map(|(name, value)| {
                if name != &Utf16::from("@id") {
                    return None;
                }
                match value {
                    Value::String(id) => Some(id),
                    _ => None,
                }
            }),
            _ => None,
        }
    }
    fn list_value(
        start: &Utf16,
        cells: &BTreeMap<Utf16, (Value, Utf16)>,
        active: &mut BTreeSet<Utf16>,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        ctx.charge_text(start.len(), Utf16::default())?;
        if !active.insert(start.clone()) {
            return Err(error("JSONLD_RDF_LIST", "Cyclic RDF collection"));
        }
        let (first, rest) = cells
            .get(start)
            .ok_or_else(|| error("JSONLD_RDF_LIST", "RDF collection tail is missing"))?;
        let mut items = vec![copy_json(first, ctx)?];
        if rest != &Utf16::from(NIL) {
            let next = list_value(rest, cells, active, ctx)?;
            let Value::Object(mut fields) = next else {
                return Err(error("JSONLD_RDF_LIST", "Invalid RDF collection tail"));
            };
            let Some((_, Value::Array(tail))) = fields
                .iter_mut()
                .find(|(name, _)| name == &Utf16::from("@list"))
            else {
                return Err(error("JSONLD_RDF_LIST", "Invalid RDF collection tail"));
            };
            items.append(tail);
        }
        active.remove(start);
        Ok(Value::Object(vec![(
            Utf16::from("@list"),
            Value::Array(items),
        )]))
    }

    let first_key = Utf16::from(FIRST);
    let rest_key = Utf16::from(REST);
    let mut cells = BTreeMap::new();
    for (node_id, fields) in nodes.iter() {
        let has_first = fields.iter().any(|(name, _)| name == &first_key);
        let has_rest = fields.iter().any(|(name, _)| name == &rest_key);
        if !has_first && !has_rest {
            continue;
        }
        let first = values(fields, FIRST)
            .filter(|items| items.len() == 1)
            .and_then(|items| items.first())
            .ok_or_else(|| error("JSONLD_RDF_LIST", "Malformed rdf:first list cell"))?;
        let rest = values(fields, REST)
            .filter(|items| items.len() == 1)
            .and_then(|items| items.first())
            .and_then(id)
            .ok_or_else(|| error("JSONLD_RDF_LIST", "Malformed rdf:rest list cell"))?;
        if fields.len() != 3 {
            return Err(error(
                "JSONLD_RDF_LIST",
                "RDF collection cell has additional properties",
            ));
        }
        ctx.charge_text(node_id.len().saturating_add(rest.len()), Utf16::default())?;
        cells.insert(node_id.clone(), (copy_json(first, ctx)?, rest.clone()));
    }
    if cells.is_empty() {
        return Ok(());
    }
    let mut rest_incoming = BTreeMap::<Utf16, usize>::new();
    for (_, rest) in cells.values() {
        if rest != &Utf16::from(NIL) {
            if !cells.contains_key(rest) {
                return Err(error(
                    "JSONLD_RDF_LIST",
                    "RDF collection tail is not a list cell or rdf:nil",
                ));
            }
            *rest_incoming.entry(rest.clone()).or_default() += 1;
        }
    }
    if rest_incoming.values().any(|count| *count > 1) {
        return Err(error(
            "JSONLD_RDF_LIST",
            "Shared RDF collection tails are ambiguous",
        ));
    }
    let roots = cells
        .keys()
        .filter(|cell| !rest_incoming.contains_key(*cell))
        .cloned()
        .collect::<Vec<_>>();
    let mut replacements = BTreeMap::new();
    let mut reached = BTreeSet::new();
    for root in roots {
        let list = list_value(&root, &cells, &mut BTreeSet::new(), ctx)?;
        let mut cursor = root.clone();
        loop {
            if !reached.insert(cursor.clone()) {
                return Err(error("JSONLD_RDF_LIST", "Cyclic or shared RDF collection"));
            }
            let rest = &cells
                .get(&cursor)
                .ok_or_else(|| error("JSONLD_RDF_LIST", "RDF collection cell is missing"))?
                .1;
            if rest == &Utf16::from(NIL) {
                break;
            }
            cursor = rest.clone();
        }
        replacements.insert(root, list);
    }
    if reached.len() != cells.len() {
        return Err(error("JSONLD_RDF_LIST", "Cyclic RDF collection"));
    }
    for (first, _) in cells.values() {
        if let Some(first_id) = id(first) {
            if cells.contains_key(first_id) {
                return Err(error(
                    "JSONLD_RDF_LIST",
                    "Nested list-cell references are ambiguous",
                ));
            }
        }
    }
    fn references(value: &Value, id: &Utf16, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
        ctx.charge_work(1, Utf16::default())?;
        match value {
            Value::Array(items) => {
                for item in items {
                    if references(item, id, ctx)? {
                        return Ok(true);
                    }
                }
            }
            Value::Object(fields) => {
                if fields.iter().any(|(name, value)| {
                    name == &Utf16::from("@id")
                        && matches!(value, Value::String(found) if found == id)
                }) {
                    return Ok(true);
                }
                for (_, value) in fields {
                    if references(value, id, ctx)? {
                        return Ok(true);
                    }
                }
            }
            _ => (),
        }
        Ok(false)
    }
    for root in replacements.keys() {
        let mut referenced = false;
        for (node_id, fields) in nodes.iter() {
            if cells.contains_key(node_id) {
                continue;
            }
            for (_, value) in fields {
                referenced |= references(value, root, ctx)?;
            }
        }
        if !referenced {
            return Err(error(
                "JSONLD_RDF_LIST",
                "RDF collection has no external head reference",
            ));
        }
    }

    fn replace_refs(
        value: &mut Value,
        replacements: &BTreeMap<Utf16, Value>,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        match value {
            Value::Array(items) => {
                for item in items {
                    replace_refs(item, replacements, ctx)?;
                }
            }
            Value::Object(fields) => {
                if let Some(index) = fields
                    .iter()
                    .position(|(name, _)| name == &Utf16::from("@id"))
                {
                    if let Value::String(id) = &fields[index].1 {
                        if let Some(list) = replacements.get(id) {
                            *value = copy_json(list, ctx)?;
                            return Ok(());
                        }
                    }
                }
                for (_, child) in fields {
                    replace_refs(child, replacements, ctx)?;
                }
            }
            _ => (),
        }
        Ok(())
    }
    for (node_id, fields) in nodes.iter_mut() {
        if cells.contains_key(node_id) {
            continue;
        }
        for (_, value) in fields {
            replace_refs(value, &replacements, ctx)?;
        }
    }
    nodes.retain(|node_id, _| !cells.contains_key(node_id));
    Ok(())
}

fn iri_resource(
    value: &Value,
    vocabulary: &mut json_ld::rdf_types::vocabulary::IndexVocabulary,
    ctx: &mut Context<'_>,
) -> Result<RdfResource, EngineError> {
    use json_ld::rdf_types::vocabulary::{BlankIdVocabularyMut, IriVocabularyMut};
    let kind = string(field(value, "kind"))
        .ok_or_else(|| error("JSONLD_RDF_TERM", "RDF term kind is missing"))?;
    let text = string(field(value, "value"))
        .ok_or_else(|| error("JSONLD_RDF_TERM", "RDF term value is missing"))?;
    ctx.charge_text(text.len(), Utf16::default())?;
    let text = text
        .to_utf8()
        .map_err(|_| error("JSONLD_RDF_TERM", "RDF term is not well-formed UTF-16"))?;
    if kind == &Utf16::from("iri") {
        let iri =
            json_ld::IriBuf::new(text).map_err(|_| error("JSONLD_RDF_TERM", "Invalid RDF IRI"))?;
        Ok(json_ld::rdf_types::Term::iri(vocabulary.insert_owned(iri)))
    } else if kind == &Utf16::from("blank") {
        let blank = json_ld::rdf_types::BlankIdBuf::new(text)
            .map_err(|_| error("JSONLD_RDF_TERM", "Invalid RDF blank identifier"))?;
        Ok(json_ld::rdf_types::Term::blank(
            vocabulary.insert_owned_blank_id(blank),
        ))
    } else {
        Err(error("JSONLD_RDF_TERM", "Expected RDF IRI or blank node"))
    }
}

fn rdf_resource(
    value: &Value,
    vocabulary: &mut json_ld::rdf_types::vocabulary::IndexVocabulary,
    ctx: &mut Context<'_>,
) -> Result<RdfResource, EngineError> {
    use json_ld::rdf_types::vocabulary::{IriVocabularyMut, LiteralVocabularyMut};
    let kind = string(field(value, "kind"))
        .ok_or_else(|| error("JSONLD_RDF_TERM", "RDF term kind is missing"))?;
    if kind != &Utf16::from("literal") {
        return iri_resource(value, vocabulary, ctx);
    }
    let lexical = string(field(value, "value"))
        .ok_or_else(|| error("JSONLD_RDF_TERM", "RDF literal value is missing"))?;
    ctx.charge_text(lexical.len(), Utf16::default())?;
    let lexical = lexical
        .to_utf8()
        .map_err(|_| error("JSONLD_RDF_TERM", "RDF literal is not well-formed UTF-16"))?;
    let datatype = string(field(value, "datatype"))
        .ok_or_else(|| error("JSONLD_RDF_TERM", "RDF datatype is missing"))?;
    ctx.charge_text(datatype.len(), Utf16::default())?;
    let datatype = datatype
        .to_utf8()
        .map_err(|_| error("JSONLD_RDF_TERM", "RDF datatype is not well-formed UTF-16"))?;
    let language = string(field(value, "language"));
    let literal_type = if let Some(language) = language.filter(|v| !v.is_empty()) {
        ctx.charge_text(language.len(), Utf16::default())?;
        let tag = language
            .to_utf8()
            .map_err(|_| error("JSONLD_RDF_TERM", "RDF language is not well-formed UTF-16"))?
            .parse()
            .map_err(|_| error("JSONLD_RDF_TERM", "Invalid RDF language tag"))?;
        json_ld::rdf_types::LiteralType::LangString(tag)
    } else {
        let iri = json_ld::IriBuf::new(datatype)
            .map_err(|_| error("JSONLD_RDF_TERM", "Invalid RDF datatype IRI"))?;
        json_ld::rdf_types::LiteralType::Any(vocabulary.insert_owned(iri))
    };
    let literal = json_ld::rdf_types::Literal::new(lexical, literal_type);
    Ok(json_ld::rdf_types::Term::Literal(
        vocabulary.insert_owned_literal(literal),
    ))
}

/// Produces an expanded JSON-LD view from a validated RDF dataset.
const RDF_VALUE_IRI: &str = "http://www.w3.org/1999/02/22-rdf-syntax-ns#value";
const RDF_DIRECTION_IRI: &str = "http://www.w3.org/1999/02/22-rdf-syntax-ns#direction";
const RDF_LANGUAGE_IRI: &str = "http://www.w3.org/1999/02/22-rdf-syntax-ns#language";
const XSD_STRING_IRI: &str = "http://www.w3.org/2001/XMLSchema#string";

#[derive(Default)]
struct CompoundParts {
    value: Option<Utf16>,
    direction: Option<Utf16>,
    language: Option<Utf16>,
    component_indices: Vec<usize>,
    has_other_statement: bool,
    has_direction_component: bool,
    invalid_component: bool,
}

fn component_literal<'a>(term: &'a Value) -> Result<Option<&'a Utf16>, EngineError> {
    if string(field(term, "kind")) != Some(&Utf16::from("literal"))
        || string(field(term, "datatype")) != Some(&Utf16::from(XSD_STRING_IRI))
        || field(term, "language").is_some()
    {
        return Ok(None);
    }
    Ok(string(field(term, "value")))
}

fn compound_graph_key(
    graph: &Value,
    subject: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let kind = string(field(graph, "kind"))
        .ok_or_else(|| error("JSONLD_RDF_DIRECTION", "Malformed graph term"))?;
    let empty = Utf16::default();
    let graph_value = string(field(graph, "value")).unwrap_or(&empty);
    let units = subject
        .len()
        .saturating_add(kind.len())
        .saturating_add(graph_value.len())
        .saturating_add(2);
    ctx.charge_text(units, Utf16::default())?;
    let mut key = subject.units().to_vec();
    key.push(0);
    key.extend_from_slice(kind.units());
    key.push(0);
    key.extend_from_slice(graph_value.units());
    Ok(Utf16::new(key))
}

/// Returns expanded compound values keyed by expanded blank-node identifier
/// (`_:label`) and indices of component quads that must not appear as nodes.
/// Any value/direction node with duplicate, cross-graph, malformed, or extra
/// statements is refused instead of partially interpreted.
fn index_compound_literals(
    quads: &[Value],
    ctx: &mut Context<'_>,
) -> Result<
    (
        std::collections::BTreeMap<Utf16, Value>,
        std::collections::BTreeSet<usize>,
    ),
    EngineError,
> {
    use std::collections::{BTreeMap, BTreeSet};

    let mut groups: BTreeMap<Utf16, CompoundParts> = BTreeMap::new();
    let mut blank_graphs: BTreeMap<Utf16, BTreeSet<Utf16>> = BTreeMap::new();
    for (index, quad) in quads.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        let subject = field(quad, "subject")
            .ok_or_else(|| error("JSONLD_RDF_SOURCE", "Quad subject missing"))?;
        let graph =
            field(quad, "graph").ok_or_else(|| error("JSONLD_RDF_SOURCE", "Quad graph missing"))?;
        // Track references even when the subject is named: otherwise a named
        // node in another graph could borrow a compound blank label globally.
        if let Some(object) = field(quad, "object") {
            if string(field(object, "kind")) == Some(&Utf16::from("blank")) {
                if let Some(object_id) = string(field(object, "value")) {
                    let object_graph = compound_graph_key(graph, object_id, ctx)?;
                    ctx.charge_text(object_id.len(), Utf16::default())?;
                    ctx.charge_text(object_graph.len(), Utf16::default())?;
                    blank_graphs
                        .entry(object_id.clone())
                        .or_default()
                        .insert(object_graph);
                }
            }
        }
        if string(field(subject, "kind")) != Some(&Utf16::from("blank")) {
            continue;
        }
        let subject_id = string(field(subject, "value"))
            .ok_or_else(|| error("JSONLD_RDF_DIRECTION", "Blank subject has no identifier"))?;
        let key = compound_graph_key(graph, subject_id, ctx)?;
        ctx.charge_text(subject_id.len(), Utf16::default())?;
        let graph_set = blank_graphs.entry(subject_id.clone()).or_default();
        ctx.charge_text(key.len(), Utf16::default())?;
        graph_set.insert(key.clone());
        let predicate = field(quad, "predicate")
            .ok_or_else(|| error("JSONLD_RDF_SOURCE", "Quad predicate missing"))?;
        let predicate_iri = if string(field(predicate, "kind")) == Some(&Utf16::from("iri")) {
            string(field(predicate, "value"))
        } else {
            None
        };
        let Some(predicate_iri) = predicate_iri else {
            continue;
        };
        let parts = groups.entry(key).or_default();
        let component = if predicate_iri == &Utf16::from(RDF_VALUE_IRI) {
            Some(0)
        } else if predicate_iri == &Utf16::from(RDF_DIRECTION_IRI) {
            parts.has_direction_component = true;
            Some(1)
        } else if predicate_iri == &Utf16::from(RDF_LANGUAGE_IRI) {
            Some(2)
        } else {
            parts.has_other_statement = true;
            None
        };
        if let Some(component) = component {
            let object = field(quad, "object")
                .ok_or_else(|| error("JSONLD_RDF_SOURCE", "Quad object missing"))?;
            let Some(literal) = component_literal(object)? else {
                parts.invalid_component = true;
                continue;
            };
            let duplicate = match component {
                0 => parts.value.is_some(),
                1 => parts.direction.is_some(),
                _ => parts.language.is_some(),
            };
            if duplicate {
                parts.invalid_component = true;
                continue;
            }
            ctx.charge_text(literal.len(), Utf16::default())?;
            ctx.charge_work(1, Utf16::default())?;
            match component {
                0 => parts.value = Some(literal.clone()),
                1 => parts.direction = Some(literal.clone()),
                _ => parts.language = Some(literal.clone()),
            }
            parts.component_indices.push(index);
        }
    }

    let mut values = BTreeMap::new();
    let mut consumed = BTreeSet::new();
    for (key, parts) in groups {
        if !parts.has_direction_component {
            continue;
        }
        if parts.invalid_component
            || parts.has_other_statement
            || parts.value.is_none()
            || parts.direction.is_none()
        {
            return Err(error(
                "JSONLD_RDF_DIRECTION",
                "Ambiguous or incomplete compound literal node",
            ));
        }
        let direction = parts.direction.as_ref().unwrap();
        if direction != &Utf16::from("ltr") && direction != &Utf16::from("rtl") {
            return Err(error(
                "JSONLD_RDF_DIRECTION",
                "Compound literal direction must be ltr or rtl",
            ));
        }
        if let Some(language) = &parts.language {
            ctx.charge_text(language.len(), Utf16::default())?;
            let language_text = language.to_utf8().map_err(|_| {
                error(
                    "JSONLD_RDF_DIRECTION",
                    "Compound literal language is not well-formed UTF-16",
                )
            })?;
            let (_, invalid) = json_ld::LenientLangTagBuf::new(language_text.clone());
            if language_text.is_empty()
                || language_text.to_ascii_lowercase() != language_text
                || invalid.is_some()
            {
                return Err(error(
                    "JSONLD_RDF_DIRECTION",
                    "Compound literal language must be a lowercase well-formed tag",
                ));
            }
        }
        // A blank identifier used as a compound literal in multiple graphs is
        // ambiguous to expanded JSON-LD's graph-local representation.
        let subject = key
            .units()
            .split(|unit| *unit == 0)
            .next()
            .unwrap_or_default();
        ctx.charge_text(subject.len().saturating_add(2), Utf16::default())?;
        ctx.charge_work(2, Utf16::default())?;
        let subject = Utf16::new(subject.to_vec());
        if blank_graphs
            .get(&subject)
            .is_some_and(|graphs| graphs.len() != 1)
        {
            return Err(error(
                "JSONLD_RDF_DIRECTION",
                "Compound literal blank node is reused across graphs",
            ));
        }
        let mut reference_units = vec![b'_' as u16, b':' as u16];
        reference_units.extend_from_slice(subject.units());
        ctx.charge_text(direction.len(), Utf16::default())?;
        ctx.charge_work(2 + usize::from(parts.language.is_some()), Utf16::default())?;
        let mut fields = vec![
            (Utf16::from("@value"), Value::String(parts.value.unwrap())),
            (Utf16::from("@direction"), Value::String(direction.clone())),
        ];
        if let Some(language) = parts.language {
            ctx.charge_text(language.len(), Utf16::default())?;
            fields.push((Utf16::from("@language"), Value::String(language)));
        }
        ctx.charge_work(parts.component_indices.len(), Utf16::default())?;
        values.insert(Utf16::new(reference_units), Value::Object(fields));
        consumed.extend(parts.component_indices);
    }
    Ok((values, consumed))
}

fn replace_compound_references(
    value: &mut Value,
    values: &std::collections::BTreeMap<Utf16, Value>,
    used: &mut std::collections::BTreeSet<Utf16>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    if let Value::Object(fields) = value {
        if fields.len() == 1 && fields[0].0 == Utf16::from("@id") {
            if let Value::String(id) = &fields[0].1 {
                if let Some(replacement) = values.get(id) {
                    ctx.charge_text(id.len(), Utf16::default())?;
                    used.insert(id.clone());
                    *value = copy_json(replacement, ctx)?;
                    return Ok(());
                }
            }
        }
        for (_, child) in fields {
            replace_compound_references(child, values, used, ctx)?;
        }
    } else if let Value::Array(items) = value {
        for item in items {
            replace_compound_references(item, values, used, ctx)?;
        }
    }
    Ok(())
}

pub fn propose_rdf_to_jsonld(
    rdf_document: &Value,
    id: &Utf16,
    base_iri: &Utf16,
    processing_mode: &Utf16,
    loss_policy: &Utf16,
    use_native_types: bool,
    use_rdf_type: bool,
    rdf_direction: Option<&Utf16>,
    rdf_runtime: &crate::rdf::RdfRuntime,
    jsonld_runtime: &JsonLdRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    use json_ld::rdf_types::vocabulary::{
        BlankIdVocabularyMut, IriVocabularyMut, LiteralVocabularyMut,
    };

    if loss_policy != &Utf16::from("report") && loss_policy != &Utf16::from("reject") {
        return Err(error(
            "JSONLD_OPTIONS",
            "lossPolicy must be report or reject",
        ));
    }
    if processing_mode != &Utf16::from("json-ld-1.0")
        && processing_mode != &Utf16::from("json-ld-1.1")
    {
        return Err(error(
            "JSONLD_OPTIONS",
            "processingMode must be json-ld-1.0 or json-ld-1.1",
        ));
    }
    if processing_mode == &Utf16::from("json-ld-1.0") && rdf_direction.is_some() {
        return Err(error(
            "JSONLD_OPTIONS",
            "rdfDirection conversion requires JSON-LD 1.1",
        ));
    }
    if rdf_direction.is_some_and(|direction| {
        direction != &Utf16::from("i18n-datatype") && direction != &Utf16::from("compound-literal")
    }) {
        return Err(error(
            "JSONLD_OPTIONS",
            "rdfDirection must be null, i18n-datatype, or compound-literal",
        ));
    }
    let mut report = Value::Object(vec![
        (Utf16::from("source"), copy_json(rdf_document, ctx)?),
        (Utf16::from("id"), Value::String(clone_text(id, ctx)?)),
        (
            Utf16::from("baseIRI"),
            Value::String(clone_text(base_iri, ctx)?),
        ),
        (
            Utf16::from("processingMode"),
            Value::String(clone_text(processing_mode, ctx)?),
        ),
        (
            Utf16::from("lossPolicy"),
            Value::String(clone_text(loss_policy, ctx)?),
        ),
        (Utf16::from("useNativeTypes"), Value::Bool(use_native_types)),
        (Utf16::from("useRdfType"), Value::Bool(use_rdf_type)),
        (
            Utf16::from("rdfDirection"),
            rdf_direction
                .map(|value| clone_text(value, ctx).map(Value::String))
                .transpose()?
                .unwrap_or(Value::Null),
        ),
        (Utf16::from("status"), Value::string_utf8("blocked")),
        (Utf16::from("complete"), Value::Bool(false)),
        (Utf16::from("diagnostics"), Value::Array(Vec::new())),
    ]);
    let checked = crate::rdf::inspect_rdf_document(rdf_runtime, rdf_document, ctx)?;
    if !checked.valid
        || checked
            .diagnostics
            .iter()
            .any(|d| d.code == Utf16::from("RDF_REPRESENTATION"))
    {
        ctx.charge_work(checked.diagnostics.len(), Utf16::default())?;
        let mut diagnostics = Vec::with_capacity(checked.diagnostics.len());
        for item in checked.diagnostics {
            diagnostics.push(Value::Object(vec![
                (
                    Utf16::from("code"),
                    Value::String(clone_text(&item.code, ctx)?),
                ),
                (
                    Utf16::from("path"),
                    Value::String(clone_text(&item.path, ctx)?),
                ),
                (
                    Utf16::from("message"),
                    Value::String(clone_text(&item.message, ctx)?),
                ),
                (
                    Utf16::from("severity"),
                    Value::string_utf8(match item.severity {
                        Severity::Error => "error",
                        Severity::Warning => "warning",
                    }),
                ),
            ]));
        }
        set_field(&mut report, "diagnostics", Value::Array(diagnostics))?;
        return Ok(report);
    }
    let quads_value = crate::rdf::get_rdf_quads(rdf_runtime, rdf_document, ctx)?;
    let Value::Array(quads) = &quads_value else {
        return Err(error("JSONLD_RDF_SOURCE", "RDF quads must be an array"));
    };
    let (compound_values, consumed_component_quads) =
        if rdf_direction == Some(&Utf16::from("compound-literal")) {
            match index_compound_literals(quads, ctx) {
                Ok(index) => index,
                Err(failure) if failure.is_control_failure() || failure.code == "LIMIT" => {
                    return Err(failure)
                }
                Err(failure) => {
                    set_field(
                        &mut report,
                        "diagnostics",
                        Value::Array(vec![report_diagnostic(
                            "JSONLD_RDF_DIRECTION",
                            &failure
                                .message
                                .to_utf8()
                                .unwrap_or_else(|_| "Malformed compound literal".to_owned()),
                            "error",
                        )]),
                    )?;
                    return Ok(report);
                }
            }
        } else {
            (BTreeMap::new(), BTreeSet::new())
        };
    let native_types_changed = use_native_types
        && quads.iter().any(|quad| {
            field(quad, "object").is_some_and(|object| {
                string(field(object, "kind")) == Some(&Utf16::from("literal"))
                    && matches!(
                        string(field(object, "datatype")),
                        Some(datatype)
                            if ["http://www.w3.org/2001/XMLSchema#integer", "http://www.w3.org/2001/XMLSchema#double", "http://www.w3.org/2001/XMLSchema#boolean"].iter().any(|candidate| datatype == &Utf16::from(*candidate))
                    )
            })
        });
    if native_types_changed && loss_policy == &Utf16::from("reject") {
        ctx.charge_work(2, Utf16::default())?;
        set_field(
            &mut report,
            "diagnostics",
            Value::Array(vec![
                report_diagnostic(
                    "JSONLD_RDF_NATIVE_TYPES",
                    "Native scalar conversion may change RDF datatype and lexical representation; the full RDF source is retained in this report.",
                    "warning",
                ),
                report_diagnostic(
                    "JSONLD_FROM_RDF_BLOCKED",
                    "JSONLD_RDF_LOSS: Native scalar conversion may change RDF datatype and lexical representation.",
                    "error",
                ),
            ]),
        )?;
        return Ok(report);
    }
    // Build expanded JSON-LD nodes from the already validated occurrence
    // array. Keeping this conversion over the public RDF projection also
    // preserves graph names and exact literal lexical forms without relying
    // on serializer behavior that hides empty named graphs.
    let mut groups: BTreeMap<Option<Utf16>, BTreeMap<Utf16, Vec<(Utf16, Value)>>> = BTreeMap::new();
    let mut raw_json_tokens = Vec::<(String, String)>::new();
    ctx.charge_work(quads.len(), Utf16::default())?;
    for (quad_index, quad) in quads.iter().enumerate() {
        if consumed_component_quads.contains(&quad_index) {
            continue;
        }
        let subject_value = field(quad, "subject")
            .ok_or_else(|| error("JSONLD_RDF_SOURCE", "Quad subject missing"))?;
        let subject_kind = string(field(subject_value, "kind"));
        let subject_raw = string(field(subject_value, "value"))
            .ok_or_else(|| error("JSONLD_RDF_SOURCE", "Quad subject value missing"))?;
        let mut subject = clone_text(subject_raw, ctx)?;
        if subject_kind == Some(&Utf16::from("blank")) {
            let mut units = Utf16::from("_:").units().to_vec();
            units.extend_from_slice(subject.units());
            subject = Utf16::new(units);
        }
        let predicate = string(field(
            field(quad, "predicate")
                .ok_or_else(|| error("JSONLD_RDF_SOURCE", "Quad predicate missing"))?,
            "value",
        ))
        .ok_or_else(|| error("JSONLD_RDF_SOURCE", "Quad predicate value missing"))?;
        let mut predicate = clone_text(predicate, ctx)?;
        let rdf_type_predicate = Utf16::from("http://www.w3.org/1999/02/22-rdf-syntax-ns#type");
        let object_value = field(quad, "object")
            .ok_or_else(|| error("JSONLD_RDF_SOURCE", "Quad object missing"))?;
        let object_kind = string(field(object_value, "kind"));
        let is_rdf_type =
            predicate == rdf_type_predicate && object_kind != Some(&Utf16::from("literal"));
        if is_rdf_type {
            predicate = Utf16::from("@type");
        }
        let object_raw = string(field(object_value, "value"))
            .ok_or_else(|| error("JSONLD_RDF_SOURCE", "Quad object value missing"))?;
        let object = if is_rdf_type {
            let mut id = clone_text(object_raw, ctx)?;
            if object_kind == Some(&Utf16::from("blank")) {
                let mut units = Utf16::from("_:").units().to_vec();
                units.extend_from_slice(id.units());
                id = Utf16::new(units);
            }
            Value::String(id)
        } else if object_kind == Some(&Utf16::from("literal")) {
            let datatype = string(field(object_value, "datatype"));
            let rdf_json = Utf16::from("http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON");
            let json_ld_11 = processing_mode == &Utf16::from("json-ld-1.1");
            let value = if datatype == Some(&rdf_json) && json_ld_11 {
                match NativeJsonTree::parse_json(object_raw.units(), ctx) {
                    Ok(tree) => {
                        let compact = tree.render_compact(ctx)?;
                        ctx.charge_text(compact.len(), Utf16::default())?;
                        let raw = compact
                            .to_utf8()
                            .map_err(|_| error("JSONLD_RDF_JSON", "Invalid RDF JSON literal"))?;
                        let marker = format!("__UMF_RAW_JSON_LITERAL_{}__", raw_json_tokens.len());
                        ctx.charge_text(marker.encode_utf16().count(), Utf16::default())?;
                        raw_json_tokens.push((marker.clone(), raw));
                        Value::String(Utf16::from(marker))
                    }
                    Err(failure) if failure.is_control_failure() || failure.code == "LIMIT" => {
                        return Err(failure)
                    }
                    Err(failure) => {
                        set_field(
                            &mut report,
                            "diagnostics",
                            Value::Array(vec![report_diagnostic(
                                "JSONLD_RDF_JSON",
                                &failure
                                    .message
                                    .to_utf8()
                                    .unwrap_or_else(|_| "Invalid RDF JSON literal".to_owned()),
                                "error",
                            )]),
                        )?;
                        return Ok(report);
                    }
                }
            } else {
                Value::String(clone_text(object_raw, ctx)?)
            };
            let mut fields = vec![(Utf16::from("@value"), value)];
            if datatype == Some(&rdf_json) && json_ld_11 {
                fields.push((Utf16::from("@type"), Value::string_utf8("@json")));
            } else if let Some(language) = string(field(object_value, "language")) {
                fields.push((
                    Utf16::from("@language"),
                    Value::String(clone_text(language, ctx)?),
                ));
            } else if let Some(datatype) = datatype {
                if datatype != &Utf16::from("http://www.w3.org/2001/XMLSchema#string") {
                    fields.push((
                        Utf16::from("@type"),
                        Value::String(clone_text(datatype, ctx)?),
                    ));
                }
            }
            Value::Object(fields)
        } else {
            let mut id = clone_text(object_raw, ctx)?;
            if object_kind == Some(&Utf16::from("blank")) {
                let mut units = Utf16::from("_:").units().to_vec();
                units.extend_from_slice(id.units());
                id = Utf16::new(units);
            }
            Value::Object(vec![(Utf16::from("@id"), Value::String(id))])
        };
        let graph_value =
            field(quad, "graph").ok_or_else(|| error("JSONLD_RDF_SOURCE", "Quad graph missing"))?;
        let graph_key = if string(field(graph_value, "kind")) == Some(&Utf16::from("default")) {
            None
        } else {
            let raw = string(field(graph_value, "value"))
                .ok_or_else(|| error("JSONLD_RDF_SOURCE", "Graph value missing"))?;
            let mut id = clone_text(raw, ctx)?;
            if string(field(graph_value, "kind")) == Some(&Utf16::from("blank")) {
                let mut units = Utf16::from("_:").units().to_vec();
                units.extend_from_slice(id.units());
                id = Utf16::new(units);
            }
            Some(id)
        };
        ctx.charge_text(subject.len(), Utf16::default())?;
        let node = groups
            .entry(graph_key)
            .or_default()
            .entry(subject.clone())
            .or_insert_with(|| vec![(Utf16::from("@id"), Value::String(subject))]);
        ctx.charge_work(node.len(), Utf16::default())?;
        let property = node.iter_mut().find(|(name, _)| name == &predicate);
        if let Some((_, Value::Array(values))) = property {
            values.push(object);
        } else if let Some((_, value)) = property {
            let old = std::mem::replace(value, Value::Null);
            *value = Value::Array(vec![old, object]);
        } else {
            node.push((predicate, Value::Array(vec![object])));
        }
    }
    let named_graphs = crate::rdf::get_rdf_named_graphs(rdf_runtime, rdf_document, ctx)?;
    let Value::Array(named_graphs) = named_graphs else {
        return Err(error(
            "JSONLD_RDF_SOURCE",
            "Named graph inventory must be an array",
        ));
    };
    for graph_nodes in groups.values_mut() {
        if let Err(failure) = collapse_rdf_lists(graph_nodes, ctx) {
            if failure.is_control_failure() || failure.code == "LIMIT" {
                return Err(failure);
            }
            set_field(
                &mut report,
                "diagnostics",
                Value::Array(vec![report_diagnostic(
                    "JSONLD_RDF_LIST",
                    &failure
                        .message
                        .to_utf8()
                        .unwrap_or_else(|_| "Malformed RDF collection".to_owned()),
                    "error",
                )]),
            )?;
            return Ok(report);
        }
    }
    let mut nodes = Vec::new();
    let default_nodes = groups.remove(&None).unwrap_or_default();
    for (_, fields) in default_nodes {
        nodes.push(Value::Object(fields));
    }
    for (graph_id, graph_nodes) in groups {
        let graph_id =
            graph_id.ok_or_else(|| error("JSONLD_RDF_SOURCE", "Named graph id missing"))?;
        let mut members = Vec::with_capacity(graph_nodes.len());
        for (_, fields) in graph_nodes {
            members.push(Value::Object(fields));
        }
        nodes.push(Value::Object(vec![
            (Utf16::from("@id"), Value::String(graph_id)),
            (Utf16::from("@graph"), Value::Array(members)),
        ]));
    }
    ctx.charge_work(
        named_graphs.len().saturating_mul(quads.len()),
        Utf16::default(),
    )?;
    for graph in named_graphs {
        let present = quads
            .iter()
            .any(|quad| field(quad, "graph") == Some(&graph));
        if present {
            continue;
        }
        let kind = string(field(&graph, "kind"));
        let raw = string(field(&graph, "value"))
            .map(|value| clone_text(value, ctx))
            .transpose()?
            .unwrap_or_default();
        let id = if kind == Some(&Utf16::from("blank")) {
            let value = Utf16::from("_:");
            let mut units = value.units().to_vec();
            units.extend_from_slice(raw.units());
            Utf16::new(units)
        } else {
            raw
        };
        nodes.push(Value::Object(vec![
            (Utf16::from("@id"), Value::String(id)),
            (Utf16::from("@graph"), Value::Array(Vec::new())),
        ]));
    }
    let mut projected = Value::Array(nodes);
    if !compound_values.is_empty() {
        let mut used = BTreeSet::new();
        if let Err(failure) =
            replace_compound_references(&mut projected, &compound_values, &mut used, ctx)
        {
            if failure.is_control_failure() || failure.code == "LIMIT" {
                return Err(failure);
            }
            set_field(
                &mut report,
                "diagnostics",
                Value::Array(vec![report_diagnostic(
                    "JSONLD_RDF_DIRECTION",
                    &failure
                        .message
                        .to_utf8()
                        .unwrap_or_else(|_| "Compound literal replacement failed".to_owned()),
                    "error",
                )]),
            )?;
            return Ok(report);
        }
        if used.len() != compound_values.len() {
            set_field(
                &mut report,
                "diagnostics",
                Value::Array(vec![report_diagnostic(
                    "JSONLD_RDF_DIRECTION",
                    "An unreferenced compound literal component cannot be removed safely",
                    "error",
                )]),
            )?;
            return Ok(report);
        }
    }
    if let Err(failure) = apply_from_rdf_options(
        &mut projected,
        use_native_types,
        use_rdf_type,
        rdf_direction == Some(&Utf16::from("i18n-datatype")),
        ctx,
    ) {
        if failure.code == "JSONLD_RDF_DIRECTION" {
            set_field(
                &mut report,
                "diagnostics",
                Value::Array(vec![report_diagnostic(
                    "JSONLD_RDF_DIRECTION",
                    &failure
                        .message
                        .to_utf8()
                        .unwrap_or_else(|_| "Malformed direction datatype".to_owned()),
                    "error",
                )]),
            )?;
            return Ok(report);
        }
        return Err(failure);
    }
    let output_source = serialization::write_json_value(&projected, Format::Json, ctx)?;
    let mut output_source = output_source.to_utf8().map_err(|_| {
        error(
            "JSONLD_FROM_RDF",
            "Generated JSON-LD is not well-formed UTF-16",
        )
    })?;
    for (marker, raw_json) in raw_json_tokens {
        let quoted = format!("\"{marker}\"");
        if output_source.matches(&quoted).count() != 1 {
            return Err(error(
                "JSONLD_RDF_JSON",
                "RDF JSON marker was ambiguous in generated output",
            ));
        }
        ctx.charge_text(raw_json.encode_utf16().count(), Utf16::default())?;
        output_source = output_source.replacen(&quoted, &raw_json, 1);
    }
    let output_source = Utf16::from(output_source);
    let payload = match import_jsonld_document(
        &output_source,
        id,
        base_iri,
        Some(processing_mode),
        &[],
        None,
        jsonld_runtime,
        ctx,
    ) {
        Ok(payload) => payload,
        Err(failure) if failure.is_control_failure() || failure.code == "RESOURCE_LIMIT" => {
            return Err(failure)
        }
        Err(failure) => {
            let diagnostic = Value::Object(vec![
                (
                    Utf16::from("code"),
                    Value::string_utf8("JSONLD_FROM_RDF_BLOCKED"),
                ),
                (
                    Utf16::from("path"),
                    Value::String(clone_text(&failure.path, ctx)?),
                ),
                (
                    Utf16::from("message"),
                    Value::String(clone_text(&failure.message, ctx)?),
                ),
                (Utf16::from("severity"), Value::string_utf8("error")),
            ]);
            set_field(&mut report, "diagnostics", Value::Array(vec![diagnostic]))?;
            return Ok(report);
        }
    };
    set_field(&mut report, "candidate", payload)?;
    set_field(&mut report, "status", Value::string_utf8("candidate"))?;
    let mut diagnostics = Vec::with_capacity(2);
    if native_types_changed {
        ctx.charge_work(1, Utf16::default())?;
        diagnostics.push(report_diagnostic(
            "JSONLD_RDF_NATIVE_TYPES",
            "Native scalar conversion may change RDF datatype and lexical representation; the full RDF source is retained in this report.",
            "warning",
        ));
    }
    ctx.charge_work(1, Utf16::default())?;
    diagnostics.push(report_diagnostic(
        "JSONLD_FROM_RDF",
        "JSON-LD is a derived view; the complete RDF source remains authoritative in the report.",
        "warning",
    ));
    set_field(&mut report, "diagnostics", Value::Array(diagnostics))?;
    Ok(report)
}

#[cfg(test)]
mod jsonld_rdf_projection_tests {
    use super::*;

    #[test]
    fn jsonld_rdf_and_back_produce_derived_candidates() {
        let mut ctx = Context::ordinary();
        let jsonld_runtime = JsonLdRuntime::new(&mut ctx).unwrap();
        let rdf_runtime = crate::rdf::RdfRuntime::new(&mut ctx).unwrap();
        let source = Utf16::from(
            r#"{"@context":{"name":"https://schema.org/name"},"@id":"https://example.test/alice","name":{"@value":"Ada","@language":"en"}}"#,
        );
        let document = import_jsonld_document(
            &source,
            &Utf16::from("alice"),
            &Utf16::from("https://example.test/"),
            None,
            &[],
            None,
            &jsonld_runtime,
            &mut ctx,
        )
        .unwrap();
        let to_rdf = propose_jsonld_to_rdf(
            &document,
            &Utf16::from("alice-rdf"),
            false,
            &Utf16::from("strict"),
            &Utf16::from("report"),
            None,
            &jsonld_runtime,
            &rdf_runtime,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            string(field(&to_rdf, "status")),
            Some(&Utf16::from("candidate"))
        );
        let rdf = field(&to_rdf, "candidate").unwrap();
        let nquads = crate::rdf::export_rdf_nquads(&rdf_runtime, rdf, Some(false), &mut ctx)
            .unwrap()
            .to_utf8()
            .unwrap();
        assert!(nquads.contains("https://example.test/alice"));
        assert!(nquads.contains("https://schema.org/name"));
        assert!(nquads.contains("\"Ada\"@en"));

        let from_rdf = propose_rdf_to_jsonld(
            rdf,
            &Utf16::from("alice-view"),
            &Utf16::from("https://example.test/"),
            &Utf16::from("json-ld-1.1"),
            &Utf16::from("report"),
            false,
            false,
            None,
            &rdf_runtime,
            &jsonld_runtime,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            string(field(&from_rdf, "status")),
            Some(&Utf16::from("candidate"))
        );
        let expanded = export_jsonld_document(
            field(&from_rdf, "candidate").unwrap(),
            &jsonld_runtime,
            &mut ctx,
        )
        .unwrap()
        .to_utf8()
        .unwrap();
        assert!(expanded.contains("https://schema.org/name"));
        assert!(expanded.contains("Ada"));
        assert!(expanded.contains("@language"));
    }

    #[test]
    fn strict_jsonld_to_rdf_refuses_exact_number_rounding() {
        let mut ctx = Context::ordinary();
        let jsonld_runtime = JsonLdRuntime::new(&mut ctx).unwrap();
        let rdf_runtime = crate::rdf::RdfRuntime::new(&mut ctx).unwrap();
        let source = Utf16::from(
            r#"{"@id":"https://example.test/n","https://schema.org/n":[{"@value":9007199254740993}]}"#,
        );
        let document = import_jsonld_document(
            &source,
            &Utf16::from("number"),
            &Utf16::from("https://example.test/"),
            None,
            &[],
            None,
            &jsonld_runtime,
            &mut ctx,
        )
        .unwrap();
        let report = propose_jsonld_to_rdf(
            &document,
            &Utf16::from("number-rdf"),
            false,
            &Utf16::from("strict"),
            &Utf16::from("report"),
            None,
            &jsonld_runtime,
            &rdf_runtime,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            string(field(&report, "status")),
            Some(&Utf16::from("blocked"))
        );
        assert!(field(&report, "candidate").is_none());
        assert!(
            matches!(field(&report, "diagnostics"), Some(Value::Array(items)) if items.iter().any(|item| string(field(item, "code")) == Some(&Utf16::from("JSONLD_RDF_NUMBER"))))
        );
    }

    #[test]
    fn from_rdf_reconstructs_lists_in_order_and_json_literals_as_native_json() {
        let mut ctx = Context::ordinary();
        let jsonld_runtime = JsonLdRuntime::new(&mut ctx).unwrap();
        let rdf_runtime = crate::rdf::RdfRuntime::new(&mut ctx).unwrap();
        let nquads = Utf16::from(
            "<https://example.test/s> <https://schema.org/items> _:cell0 .\n\
             _:cell0 <http://www.w3.org/1999/02/22-rdf-syntax-ns#first> \"first\" .\n\
             _:cell0 <http://www.w3.org/1999/02/22-rdf-syntax-ns#rest> _:cell1 .\n\
             _:cell1 <http://www.w3.org/1999/02/22-rdf-syntax-ns#first> \"second\" .\n\
             _:cell1 <http://www.w3.org/1999/02/22-rdf-syntax-ns#rest> <http://www.w3.org/1999/02/22-rdf-syntax-ns#nil> .\n\
             <https://example.test/s> <https://schema.org/json> \"{\\\"n\\\":9007199254740993}\"^^<http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON> .\n",
        );
        let rdf = crate::rdf::import_rdf_nquads(
            &rdf_runtime,
            nquads.units(),
            &Utf16::from("list-json"),
            None,
            &mut ctx,
        )
        .unwrap();
        let report = propose_rdf_to_jsonld(
            &rdf,
            &Utf16::from("list-json-view"),
            &Utf16::from("https://example.test/"),
            &Utf16::from("json-ld-1.1"),
            &Utf16::from("report"),
            false,
            false,
            None,
            &rdf_runtime,
            &jsonld_runtime,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            string(field(&report, "status")),
            Some(&Utf16::from("candidate"))
        );
        let rendered = export_jsonld_document(
            field(&report, "candidate").unwrap(),
            &jsonld_runtime,
            &mut ctx,
        )
        .unwrap()
        .to_utf8()
        .unwrap();
        assert!(rendered.contains("\"@list\""));
        assert!(rendered.find("first").unwrap() < rendered.find("second").unwrap());
        assert!(rendered.contains("@json"));
        assert!(rendered.contains("\"n\":9007199254740993"));
    }

    #[test]
    fn i18n_direction_uses_the_selected_rdf_datatype_mapping() {
        let mut ctx = Context::ordinary();
        let jsonld_runtime = JsonLdRuntime::new(&mut ctx).unwrap();
        let rdf_runtime = crate::rdf::RdfRuntime::new(&mut ctx).unwrap();
        let source = Utf16::from(
            r#"[{"@id":"https://example.test/person","https://schema.org/name":[{"@value":"שלום","@language":"he","@direction":"rtl"}]}]"#,
        );
        let document = import_jsonld_document(
            &source,
            &Utf16::from("direction"),
            &Utf16::from("https://example.test/"),
            None,
            &[],
            None,
            &jsonld_runtime,
            &mut ctx,
        )
        .unwrap();
        let rdf = propose_jsonld_to_rdf(
            &document,
            &Utf16::from("direction-rdf"),
            false,
            &Utf16::from("strict"),
            &Utf16::from("report"),
            Some(&Utf16::from("i18n-datatype")),
            &jsonld_runtime,
            &rdf_runtime,
            &mut ctx,
        )
        .unwrap();
        let candidate = field(&rdf, "candidate").unwrap();
        let nquads = crate::rdf::export_rdf_nquads(&rdf_runtime, candidate, Some(false), &mut ctx)
            .unwrap()
            .to_utf8()
            .unwrap();
        assert!(nquads.contains("https://www.w3.org/ns/i18n#he_rtl"));
        let jsonld = propose_rdf_to_jsonld(
            candidate,
            &Utf16::from("direction-view"),
            &Utf16::from("https://example.test/"),
            &Utf16::from("json-ld-1.1"),
            &Utf16::from("report"),
            false,
            false,
            Some(&Utf16::from("i18n-datatype")),
            &rdf_runtime,
            &jsonld_runtime,
            &mut ctx,
        )
        .unwrap();
        let output = export_jsonld_document(
            field(&jsonld, "candidate").unwrap(),
            &jsonld_runtime,
            &mut ctx,
        )
        .unwrap()
        .to_utf8()
        .unwrap();
        let output_tree =
            crate::native_json::NativeJsonTree::parse_json(Utf16::from(output).units(), &mut ctx)
                .unwrap();
        fn has_direction_language(node: &crate::native_json::NativeJsonNode) -> bool {
            use crate::native_json::NativeJsonNode as Node;
            match node {
                Node::Object(fields) => {
                    let direction = fields.iter().any(|(key, value)| {
                        key == &Utf16::from("@direction")
                            && matches!(value, Node::String(value) if value == &Utf16::from("rtl"))
                    });
                    let language = fields.iter().any(|(key, value)| {
                        key == &Utf16::from("@language")
                            && matches!(value, Node::String(value) if value == &Utf16::from("he"))
                    });
                    (direction && language)
                        || fields
                            .iter()
                            .any(|(_, value)| has_direction_language(value))
                }
                Node::Array(items) => items.iter().any(has_direction_language),
                Node::Null | Node::Boolean(_) | Node::String(_) | Node::Number(_) => false,
            }
        }
        assert!(has_direction_language(output_tree.root()));

        let malformed_source = Utf16::from(
            "<https://example.test/person> <https://schema.org/name> \"שלום\"^^<https://www.w3.org/ns/i18n#foo_bar_ltr> .\n",
        );
        let malformed_rdf = crate::rdf::import_rdf_nquads(
            &rdf_runtime,
            malformed_source.units(),
            &Utf16::from("malformed-direction"),
            None,
            &mut ctx,
        )
        .unwrap();
        let malformed = propose_rdf_to_jsonld(
            &malformed_rdf,
            &Utf16::from("malformed-direction-view"),
            &Utf16::from("https://example.test/"),
            &Utf16::from("json-ld-1.1"),
            &Utf16::from("report"),
            false,
            false,
            Some(&Utf16::from("i18n-datatype")),
            &rdf_runtime,
            &jsonld_runtime,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            string(field(&malformed, "status")),
            Some(&Utf16::from("blocked"))
        );
        assert!(matches!(
            field(&malformed, "diagnostics"),
            Some(Value::Array(items)) if items.iter().any(|item| string(field(item, "code")) == Some(&Utf16::from("JSONLD_RDF_DIRECTION")))
        ));
    }

    #[test]
    fn native_scalar_conversion_is_reported_and_rejected_when_requested() {
        let mut ctx = Context::ordinary();
        let jsonld_runtime = JsonLdRuntime::new(&mut ctx).unwrap();
        let rdf_runtime = crate::rdf::RdfRuntime::new(&mut ctx).unwrap();
        let source = Utf16::from(
            "<https://example.test/alice> <https://schema.org/age> \"42\"^^<http://www.w3.org/2001/XMLSchema#integer> .\n",
        );
        let rdf = crate::rdf::import_rdf_nquads(
            &rdf_runtime,
            source.units(),
            &Utf16::from("age-rdf"),
            None,
            &mut ctx,
        )
        .unwrap();
        let report = propose_rdf_to_jsonld(
            &rdf,
            &Utf16::from("age-view"),
            &Utf16::from("https://example.test/"),
            &Utf16::from("json-ld-1.1"),
            &Utf16::from("report"),
            true,
            false,
            None,
            &rdf_runtime,
            &jsonld_runtime,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            string(field(&report, "status")),
            Some(&Utf16::from("candidate"))
        );
        assert!(matches!(
            field(&report, "diagnostics"),
            Some(Value::Array(items)) if items.iter().any(|item| string(field(item, "code")) == Some(&Utf16::from("JSONLD_RDF_NATIVE_TYPES")))
        ));
        fn contains_native_number(
            node: &crate::native_json::NativeJsonNode,
            expected: &str,
        ) -> bool {
            use crate::native_json::NativeJsonNode as Node;
            match node {
                Node::Number(token) => token == expected,
                Node::Array(items) => items
                    .iter()
                    .any(|item| contains_native_number(item, expected)),
                Node::Object(fields) => fields
                    .iter()
                    .any(|(_, value)| contains_native_number(value, expected)),
                Node::Null | Node::Boolean(_) | Node::String(_) => false,
            }
        }
        let candidate = field(&report, "candidate").unwrap();
        let payload = payload_from_valid_document(candidate, &mut ctx).unwrap();
        assert!(contains_native_number(payload.root.root(), "42"));

        let rejected = propose_rdf_to_jsonld(
            &rdf,
            &Utf16::from("age-view-rejected"),
            &Utf16::from("https://example.test/"),
            &Utf16::from("json-ld-1.1"),
            &Utf16::from("reject"),
            true,
            false,
            None,
            &rdf_runtime,
            &jsonld_runtime,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            string(field(&rejected, "status")),
            Some(&Utf16::from("blocked"))
        );
        assert!(field(&rejected, "candidate").is_none());
    }

    #[test]
    fn generalized_rdf_named_node_literal_projects_to_jsonld() {
        let mut ctx = Context::ordinary();
        let jsonld_runtime = JsonLdRuntime::new(&mut ctx).unwrap();
        let rdf_runtime = crate::rdf::RdfRuntime::new(&mut ctx).unwrap();
        let source = Utf16::from(
            r#"[{"subject":{"termType":"NamedNode","value":"https://example.test/s"},"predicate":{"termType":"NamedNode","value":"https://schema.org/name"},"object":{"termType":"Literal","value":"Ada","datatype":{"termType":"NamedNode","value":"http://www.w3.org/2001/XMLSchema#string"}},"graph":{"termType":"DefaultGraph","value":""}},{"subject":{"termType":"NamedNode","value":"https://example.test/s"},"predicate":{"termType":"NamedNode","value":"https://schema.org/data"},"object":{"termType":"Literal","value":"{\"n\":9007199254740993}","datatype":{"termType":"NamedNode","value":"http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON"}},"graph":{"termType":"DefaultGraph","value":""}}]"#,
        );
        let rdf = crate::rdf::import_generalized_rdf_dataset(
            &rdf_runtime,
            source.units(),
            &Utf16::from("generalized"),
            None,
            &mut ctx,
        )
        .unwrap();
        let report = propose_generalized_rdf_to_jsonld(
            &rdf,
            &Utf16::from("generalized-view"),
            &Utf16::from("https://example.test/"),
            &Utf16::from("json-ld-1.1"),
            &Utf16::from("report"),
            &rdf_runtime,
            &jsonld_runtime,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            string(field(&report, "status")),
            Some(&Utf16::from("candidate"))
        );
        let rendered = export_jsonld_document(
            field(&report, "candidate").unwrap(),
            &jsonld_runtime,
            &mut ctx,
        )
        .unwrap()
        .to_utf8()
        .unwrap();
        assert!(rendered.contains("https://schema.org/name"));
        assert!(rendered.contains("Ada"));
        assert!(rendered.contains("@json"));
        let parsed =
            NativeJsonTree::parse_json(&Utf16::from(rendered.as_str()).units(), &mut ctx).unwrap();
        fn has_exact_number(node: &NativeJsonNode, token: &str) -> bool {
            match node {
                NativeJsonNode::Number(number) => number == token,
                NativeJsonNode::Array(items) => {
                    items.iter().any(|item| has_exact_number(item, token))
                }
                NativeJsonNode::Object(fields) => fields
                    .iter()
                    .any(|(_, value)| has_exact_number(value, token)),
                _ => false,
            }
        }
        assert!(has_exact_number(parsed.root(), "9007199254740993"));
    }

    #[test]
    fn generalized_blank_predicate_returns_blocked_report() {
        let mut ctx = Context::ordinary();
        let jsonld_runtime = JsonLdRuntime::new(&mut ctx).unwrap();
        let rdf_runtime = crate::rdf::RdfRuntime::new(&mut ctx).unwrap();
        let source = Utf16::from(
            r#"[{"subject":{"termType":"NamedNode","value":"https://example.test/s"},"predicate":{"termType":"BlankNode","value":"p"},"object":{"termType":"Literal","value":"x","datatype":{"termType":"NamedNode","value":"http://www.w3.org/2001/XMLSchema#string"}},"graph":{"termType":"DefaultGraph","value":""}}]"#,
        );
        let rdf = crate::rdf::import_generalized_rdf_dataset(
            &rdf_runtime,
            source.units(),
            &Utf16::from("generalized-blank-predicate"),
            None,
            &mut ctx,
        )
        .unwrap();
        let report = propose_generalized_rdf_to_jsonld(
            &rdf,
            &Utf16::from("generalized-blank-view"),
            &Utf16::from("https://example.test/"),
            &Utf16::from("json-ld-1.1"),
            &Utf16::from("report"),
            &rdf_runtime,
            &jsonld_runtime,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            string(field(&report, "status")),
            Some(&Utf16::from("blocked"))
        );
        assert!(field(&report, "candidate").is_none());
    }

    #[test]
    fn framing_selects_matching_expanded_nodes_and_retains_number_tokens() {
        let mut ctx = Context::ordinary();
        let runtime = JsonLdRuntime::new(&mut ctx).unwrap();
        let source = Utf16::from(
            r#"[{"@id":"https://example.test/person","@type":["https://schema.org/Person"],"https://schema.org/name":[{"@value":"Ada"}],"https://schema.org/count":[{"@value":9007199254740993}]}]"#,
        );
        let document = import_jsonld_document(
            &source,
            &Utf16::from("person"),
            &Utf16::from("https://example.test/"),
            None,
            &[],
            None,
            &runtime,
            &mut ctx,
        )
        .unwrap();
        let mut document = document;
        if let Value::Object(fields) = &mut document {
            fields.push((
                Utf16::from("futureMetadata"),
                Value::String(Utf16::new(vec![0xD800])),
            ));
        }
        let report = propose_jsonld_framing(
            &document,
        &Utf16::from(
            r#"{"@context":{"Person":"https://schema.org/Person","name":"https://schema.org/name"},"@type":"Person","name":{}}"#,
        ),
            &Utf16::from("report"),
            true,
            true,
            false,
            true,
            false,
            false,
            false,
            true,
            true,
            &Utf16::from("@once"),
            &runtime,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            string(field(&report, "status")),
            Some(&Utf16::from("candidate"))
        );
        assert_eq!(
            field(field(&report, "candidate").unwrap(), "futureMetadata"),
            Some(&Value::String(Utf16::new(vec![0xD800])))
        );
        let rendered =
            export_jsonld_document(field(&report, "candidate").unwrap(), &runtime, &mut ctx)
                .unwrap()
                .to_utf8()
                .unwrap();
        assert!(rendered.contains("Person"));
        assert!(rendered.contains("name"));
        assert!(rendered.contains("9007199254740993"));
        let refused_option = propose_jsonld_framing(
            &document,
            &Utf16::from(
                r#"{"@context":{"Person":"https://schema.org/Person","name":"https://schema.org/name"},"@type":"Person","name":{}}"#,
            ),
            &Utf16::from("report"),
            true,
            true,
            true,
            false,
            false,
            true,
            true,
            true,
            &Utf16::from("@once"),
            &runtime,
            &mut ctx,
        )
        .unwrap_err();
        assert_eq!(refused_option.code, "JSONLD_OPTIONS");
    }

    #[test]
    fn compound_direction_round_trips_blank_component_value() {
        let mut ctx = Context::ordinary();
        let jsonld_runtime = JsonLdRuntime::new(&mut ctx).unwrap();
        let rdf_runtime = crate::rdf::RdfRuntime::new(&mut ctx).unwrap();
        let source = Utf16::from(
            "<https://example.test/person> <https://schema.org/name> _:list .\n_:list <http://www.w3.org/1999/02/22-rdf-syntax-ns#first> _:direction .\n_:list <http://www.w3.org/1999/02/22-rdf-syntax-ns#rest> <http://www.w3.org/1999/02/22-rdf-syntax-ns#nil> .\n_:direction <http://www.w3.org/1999/02/22-rdf-syntax-ns#value> \"שלום\" .\n_:direction <http://www.w3.org/1999/02/22-rdf-syntax-ns#direction> \"rtl\" .\n_:direction <http://www.w3.org/1999/02/22-rdf-syntax-ns#language> \"he\" .\n",
        );
        let rdf = crate::rdf::import_rdf_nquads(
            &rdf_runtime,
            source.units(),
            &Utf16::from("compound-direction"),
            None,
            &mut ctx,
        )
        .unwrap();
        let report = propose_rdf_to_jsonld(
            &rdf,
            &Utf16::from("compound-direction-view"),
            &Utf16::from("https://example.test/"),
            &Utf16::from("json-ld-1.1"),
            &Utf16::from("report"),
            false,
            false,
            Some(&Utf16::from("compound-literal")),
            &rdf_runtime,
            &jsonld_runtime,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            string(field(&report, "status")),
            Some(&Utf16::from("candidate"))
        );
        let expanded = export_jsonld_document(
            field(&report, "candidate").unwrap(),
            &jsonld_runtime,
            &mut ctx,
        )
        .unwrap()
        .to_utf8()
        .unwrap();
        assert!(expanded.contains("\"@value\":\"שלום\""));
        assert!(expanded.contains("\"@direction\":\"rtl\""));
        assert!(expanded.contains("\"@language\":\"he\""));
        assert!(expanded.contains("\"@list\""));
        assert!(!expanded.contains("_:direction"));
    }

    #[test]
    fn malformed_compound_direction_component_blocks_without_candidate() {
        let mut ctx = Context::ordinary();
        let jsonld_runtime = JsonLdRuntime::new(&mut ctx).unwrap();
        let rdf_runtime = crate::rdf::RdfRuntime::new(&mut ctx).unwrap();
        let source = Utf16::from(
            "<https://example.test/person> <https://schema.org/name> _:direction .\n_:direction <http://www.w3.org/1999/02/22-rdf-syntax-ns#value> \"hello\" .\n_:direction <http://www.w3.org/1999/02/22-rdf-syntax-ns#direction> \"sideways\" .\n",
        );
        let rdf = crate::rdf::import_rdf_nquads(
            &rdf_runtime,
            source.units(),
            &Utf16::from("bad-compound-direction"),
            None,
            &mut ctx,
        )
        .unwrap();
        let report = propose_rdf_to_jsonld(
            &rdf,
            &Utf16::from("bad-compound-direction-view"),
            &Utf16::from("https://example.test/"),
            &Utf16::from("json-ld-1.1"),
            &Utf16::from("report"),
            false,
            false,
            Some(&Utf16::from("compound-literal")),
            &rdf_runtime,
            &jsonld_runtime,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            string(field(&report, "status")),
            Some(&Utf16::from("blocked"))
        );
        assert!(field(&report, "candidate").is_none());
        assert!(matches!(
            field(&report, "diagnostics"),
            Some(Value::Array(items)) if items.iter().any(|item| string(field(item, "code")) == Some(&Utf16::from("JSONLD_RDF_DIRECTION")))
        ));
    }

    #[test]
    fn compound_component_reference_from_named_subject_in_other_graph_is_blocked() {
        let mut ctx = Context::ordinary();
        let jsonld_runtime = JsonLdRuntime::new(&mut ctx).unwrap();
        let rdf_runtime = crate::rdf::RdfRuntime::new(&mut ctx).unwrap();
        let source = Utf16::from(
            "<https://example.test/person> <https://schema.org/name> _:direction .\n_:direction <http://www.w3.org/1999/02/22-rdf-syntax-ns#value> \"hello\" <https://example.test/components> .\n_:direction <http://www.w3.org/1999/02/22-rdf-syntax-ns#direction> \"rtl\" <https://example.test/components> .\n",
        );
        let rdf = crate::rdf::import_rdf_nquads(
            &rdf_runtime,
            source.units(),
            &Utf16::from("cross-graph-compound"),
            None,
            &mut ctx,
        )
        .unwrap();
        let report = propose_rdf_to_jsonld(
            &rdf,
            &Utf16::from("cross-graph-compound-view"),
            &Utf16::from("https://example.test/"),
            &Utf16::from("json-ld-1.1"),
            &Utf16::from("report"),
            false,
            false,
            Some(&Utf16::from("compound-literal")),
            &rdf_runtime,
            &jsonld_runtime,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            string(field(&report, "status")),
            Some(&Utf16::from("blocked"))
        );
        assert!(field(&report, "candidate").is_none());
    }
}

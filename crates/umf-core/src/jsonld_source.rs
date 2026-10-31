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
    native_json::NativeJsonTree,
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
    let mut processor_options = json_ld::Options::default();
    processor_options.base = Some(base.clone());
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
    let input = json_ld::RemoteDocument::new(Some(base), None, document_json);
    let mut vocabulary = json_ld::rdf_types::vocabulary::IndexVocabulary::new();
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
            use contextual::WithContext;
            let printed = expanded.with(&vocabulary).compact_print();
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
            ctx.charge_text(writer.units, Utf16::default())?;
            let rendered_units = writer.output.encode_utf16().collect::<Vec<_>>();
            let root = NativeJsonTree::parse_json(&rendered_units, ctx)?;
            let mut candidate = source_copy_for_candidate(document, ctx)?;
            let payload = find_payload_mut(&mut candidate)?;
            set_field(payload, "root", root.tagged_value_preserving_extras(ctx)?)?;
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
    let (input, loader, _base, mut options) = processor_input(&payload, ctx)?;
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
    let mut vocabulary = json_ld::rdf_types::vocabulary::IndexVocabulary::new();
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
    let (input, loader, _base, mut options) = processor_input(&payload, ctx)?;
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
    let mut vocabulary = json_ld::rdf_types::vocabulary::IndexVocabulary::new();
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
        json_ld::RemoteDocument,
        SuppliedContextLoader,
        json_ld::IriBuf,
        json_ld::Options,
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
    options.base = Some(base.clone());
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
        json_ld::RemoteDocument::new(Some(base.clone()), None, document),
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

impl<N, W: fmt::Display> json_ld::warning::Handler<N, W> for ProcessorWarnings {
    fn handle(&mut self, _vocabulary: &N, warning: W) {
        self.messages.push(warning.to_string());
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

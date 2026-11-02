// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned TypeSpec source admission around an explicit host compiler.
//! The TypeSpec compiler and emitter remain external capabilities.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet},
    error::{Diagnostic, EngineError, Severity, Validation},
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const EXT: &str = "umf.typespec";
const EXT_VERSION: &str = "0.1.0";
const CORE_VERSION: &str = "0.10.0";
static EMPTY_OBJECT: Value = Value::Object(Vec::new());

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TypeSpecOperation {
    Compile,
    SemanticGraph,
    EmitJsonSchema,
}

/// Immutable Rust-prepared call. The host gets only a bounded compiler request;
/// the original document and operation are retained until completion.
pub struct PreparedTypeSpecOperation {
    operation: TypeSpecOperation,
    document: Value,
    request: Value,
    operands: Option<Value>,
}
pub struct PreparedTypeSpecSyntax {
    source: Utf16,
}
pub struct PreparedTypeSpecInspection {
    document: Value,
    files: Value,
    importing: bool,
    editing: bool,
}
impl PreparedTypeSpecInspection {
    pub fn is_importing(&self) -> bool {
        self.importing
    }
    pub fn is_editing(&self) -> bool {
        self.editing
    }
}
impl PreparedTypeSpecSyntax {
    pub fn request(&self, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        ctx.charge_text(self.source.len(), Utf16::default())?;
        Ok(object(vec![
            ("profile", s("umf.typespec-parser-host/1")),
            ("operation", s("syntax")),
            ("source", Value::String(self.source.clone())),
        ]))
    }
}
impl PreparedTypeSpecOperation {
    pub fn request(&self) -> &Value {
        &self.request
    }
}

pub struct TypeSpecRuntime {
    engine: Engine,
    registry: Registry,
    report_schemas: [CompiledSchema; 3],
}
impl TypeSpecRuntime {
    pub fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        let engine = Engine::new(
            ResourceSet::new(
                json(include_str!("../../../spec/core/schema.json"), ctx)?,
                json(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
                json(
                    include_str!("../../../spec/core/extension-package.schema.json"),
                    ctx,
                )?,
                json(
                    include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                    ctx,
                )?,
                json(
                    include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                    ctx,
                )?,
            ),
            ctx,
        )?;
        let resources = engine.schema_resources_with_context(ctx)?;
        let package = json(
            include_str!("../../../spec/extensions/typespec/package.json"),
            ctx,
        )?;
        let mut registry = Registry::new();
        registry.register(&package, None, engine.package_schema(), &resources, ctx)?;
        let report_schemas = [
            compile_schema(
                include_str!("../../../spec/extensions/typespec/compiler-report.schema.json"),
                &resources,
                ctx,
            )?,
            compile_schema(
                include_str!("../../../spec/extensions/typespec/semantic-graph.schema.json"),
                &resources,
                ctx,
            )?,
            compile_schema(
                include_str!("../../../spec/extensions/typespec/json-schema-emission.schema.json"),
                &resources,
                ctx,
            )?,
        ];
        Ok(Self {
            engine,
            registry,
            report_schemas,
        })
    }

    pub fn inspect(
        &self,
        document: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Validation, EngineError> {
        self.engine
            .validate_document(document, &self.registry, &mut NoCapabilities, ctx)
    }

    /// Semantic payload inspection remains in Rust. The host supplies only
    /// parser diagnostics from the pinned TypeSpec AST parser; it does not
    /// choose UMF issue codes, paths, severity, or source validity.
    pub fn inspect_payload(
        &self,
        document: &Value,
        parser_diagnostics: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Validation, EngineError> {
        let mut validation = self.inspect(document, ctx)?;
        let Some(payload) = find_payload(document, ctx)? else {
            return Ok(validation);
        };
        let mut add = Vec::new();
        if let Value::Object(fields) = &payload {
            for (key, _) in fields {
                ctx.charge_work(key.len().saturating_add(1), key.clone())?;
                if !["profile", "entrypoint", "files", "libraries"]
                    .iter()
                    .any(|name| key == &kstr(name))
                {
                    add.push(diagnostic(
                        "TYPESPEC_REPRESENTATION",
                        Utf16::from("/"),
                        Utf16::from(
                            "Unknown source representation field cannot be emitted natively",
                        ),
                        Severity::Warning,
                    ));
                }
            }
        }
        let entrypoint = member(&payload, "entrypoint").and_then(as_string);
        if let Some(Value::Object(libraries)) = member(&payload, "libraries") {
            let supported = json(
                include_str!("../../../spec/extensions/typespec/libraries.json"),
                ctx,
            )?;
            for (name, version) in libraries {
                ctx.charge_work(name.len().saturating_add(1), name.clone())?;
                let known = member(&supported, name.to_utf8().as_deref().unwrap_or(""));
                if !matches!((known.and_then(|v| member(v, "version")), version), (Some(Value::String(expected)), Value::String(actual)) if expected == actual)
                {
                    add.push(diagnostic(
                        "TYPESPEC_LIBRARY_UNAVAILABLE",
                        pointer_path("/libraries/", name, ctx)?,
                        Utf16::from("Unregistered library selection retained"),
                        Severity::Warning,
                    ));
                }
            }
        }
        if let Some(Value::Object(files)) = member(&payload, "files") {
            let mut total = 0usize;
            let mut entry_seen = false;
            for (path, source) in files {
                ctx.charge_work(path.len().saturating_add(1), path.clone())?;
                let path_text = path.to_utf8();
                if path_text
                    .as_deref()
                    .ok()
                    .is_none_or(|path| !valid_tsp_path(path))
                {
                    add.push(diagnostic(
                        "TYPESPEC_PATH",
                        pointer_path("/files/", path, ctx)?,
                        Utf16::from("Source paths must be relative .tsp paths without traversal"),
                        Severity::Error,
                    ));
                    continue;
                }
                entry_seen |= Some(path) == entrypoint;
                if let Value::String(source) = source {
                    total = total.saturating_add(source.len());
                    if total > ctx.limits().max_text_units {
                        add.push(diagnostic(
                            "LIMIT",
                            Utf16::from("/files"),
                            Utf16::from("Source bundle exceeds text limit"),
                            Severity::Error,
                        ));
                        break;
                    }
                }
            }
            if !entry_seen {
                add.push(diagnostic(
                    "TYPESPEC_ENTRYPOINT",
                    Utf16::from("/entrypoint"),
                    Utf16::from("Entrypoint must name a supplied file"),
                    Severity::Error,
                ));
            }
        }
        if let Value::Array(parser_diagnostics) = parser_diagnostics {
            for raw in parser_diagnostics {
                ctx.charge_work(1, Utf16::default())?;
                let code = member(raw, "code").and_then(as_string).ok_or_else(|| {
                    err(
                        "TYPESPEC_HOST_RESPONSE",
                        "Parser diagnostic code is missing",
                    )
                })?;
                let message = member(raw, "message").and_then(as_string).ok_or_else(|| {
                    err(
                        "TYPESPEC_HOST_RESPONSE",
                        "Parser diagnostic message is missing",
                    )
                })?;
                let path = member(raw, "path")
                    .and_then(as_string)
                    .cloned()
                    .unwrap_or_default();
                let severity = match member(raw, "severity")
                    .and_then(as_string)
                    .and_then(|v| v.to_utf8().ok())
                    .as_deref()
                {
                    Some("error") => Severity::Error,
                    Some("warning") => Severity::Warning,
                    _ => {
                        return Err(err(
                            "TYPESPEC_HOST_RESPONSE",
                            "Parser diagnostic severity is invalid",
                        ));
                    }
                };
                let prefixed = Utf16::from("TYPESPEC_");
                let full_code = join_utf16(&[&prefixed, code], ctx)?;
                let path = pointer_path("/files/", &path, ctx)?;
                add.push(diagnostic_utf16(full_code, path, message.clone(), severity));
            }
        } else {
            return Err(err(
                "TYPESPEC_HOST_RESPONSE",
                "Parser diagnostics must be an array",
            ));
        }
        add.push(diagnostic("TYPESPEC_COMPILATION_REQUIRED", Utf16::default(), Utf16::from("Syntax preservation does not establish compiler validity; call compileTypeSpecDocument with supplied imports"), Severity::Warning));
        validation.valid &= !add.iter().any(|d| d.severity == Severity::Error);
        validation.diagnostics.extend(add);
        Ok(validation)
    }

    pub fn inspect_extension_payload(
        &self,
        payload: &Value,
        parser_diagnostics: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Validation, EngineError> {
        let document = object(vec![
            ("umf", s(CORE_VERSION)),
            ("id", s("typespec-inspection")),
            (
                "vocabularies",
                object(vec![(EXT, object(vec![("version", s(EXT_VERSION))]))]),
            ),
            (
                "modules",
                Value::Array(vec![object(vec![
                    ("id", s("schema")),
                    ("namespace", s("")),
                    (
                        "elements",
                        Value::Array(vec![object(vec![
                            ("id", s("schema")),
                            ("extensions", object(vec![(EXT, copy_json(payload, ctx)?)])),
                        ])]),
                    ),
                ])]),
            ),
        ]);
        self.inspect_payload(&document, parser_diagnostics, ctx)
    }

    pub fn prepare_inspection(
        &self,
        document: &Value,
        importing: bool,
        ctx: &mut Context<'_>,
    ) -> Result<(PreparedTypeSpecInspection, Value), EngineError> {
        let validation = self.inspect_payload(document, &Value::Array(Vec::new()), ctx)?;
        if !validation.valid {
            return Err(validation_error("TYPESPEC_DOCUMENT", validation));
        }
        let payload = find_payload(document, ctx)?
            .ok_or_else(|| err("TYPESPEC_PAYLOAD", "Missing TypeSpec source payload"))?;
        let files = member(&payload, "files")
            .ok_or_else(|| err("TYPESPEC_FILES", "Source files are required"))?;
        let state = PreparedTypeSpecInspection {
            document: copy_json(document, ctx)?,
            files: copy_json(files, ctx)?,
            importing,
            editing: false,
        };
        let request = object(vec![
            ("profile", s("umf.typespec-parser-host/1")),
            ("operation", s("inspect")),
            ("files", copy_json(&state.files, ctx)?),
        ]);
        Ok((state, request))
    }

    pub fn finish_inspection(
        &self,
        prepared: PreparedTypeSpecInspection,
        parser_diagnostics: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let validation = self.inspect_payload(&prepared.document, parser_diagnostics, ctx)?;
        if prepared.importing {
            if !validation.valid {
                return Err(validation_error("TYPESPEC_DOCUMENT", validation));
            }
            Ok(prepared.document)
        } else if prepared.editing {
            Ok(object(vec![
                ("document", prepared.document),
                ("validation", validation_value(validation, ctx)?),
            ]))
        } else {
            validation_value(validation, ctx)
        }
    }

    pub fn prepare_edit_source(
        &self,
        document: &Value,
        path: &Value,
        replacement: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<(PreparedTypeSpecInspection, Value), EngineError> {
        let edited = self.edit_source(document, path, replacement, ctx)?;
        let candidate = member(&edited, "document")
            .ok_or_else(|| err("TYPESPEC_EDIT", "Edited document is missing"))?;
        let (mut prepared, request) = self.prepare_inspection(candidate, false, ctx)?;
        prepared.editing = true;
        Ok((prepared, request))
    }

    pub fn prepare_syntax(
        &self,
        document: &Value,
        path: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<PreparedTypeSpecSyntax, EngineError> {
        let validation = self.inspect_payload(document, &Value::Array(Vec::new()), ctx)?;
        if !validation.valid {
            return Err(validation_error("TYPESPEC_DOCUMENT", validation));
        }
        let payload = find_payload(document, ctx)?
            .ok_or_else(|| err("TYPESPEC_PAYLOAD", "Missing TypeSpec source payload"))?;
        let path = as_string(path).ok_or_else(|| err("TYPESPEC_FILE", "File path must be text"))?;
        let files = member(&payload, "files")
            .ok_or_else(|| err("TYPESPEC_FILES", "Source files are required"))?;
        let source = match files {
            Value::Object(fields) => fields
                .iter()
                .find(|(name, _)| name == path)
                .map(|(_, source)| source),
            _ => None,
        }
        .and_then(as_string)
        .ok_or_else(|| err("TYPESPEC_FILE", "No supplied source file"))?;
        ctx.charge_work(source.len(), Utf16::default())?;
        Ok(PreparedTypeSpecSyntax {
            source: source.clone(),
        })
    }

    pub fn finish_syntax(
        &self,
        prepared: PreparedTypeSpecSyntax,
        response: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let nodes = member(response, "nodes")
            .ok_or_else(|| err("TYPESPEC_HOST_RESPONSE", "Syntax node list is missing"))?;
        let Value::Array(nodes) = nodes else {
            return Err(err(
                "TYPESPEC_HOST_RESPONSE",
                "Syntax nodes must be an array",
            ));
        };
        if nodes.len() > ctx.limits().max_values {
            return Err(err("LIMIT", "Syntax traversal exceeds structural limit"));
        }
        ctx.charge_work(nodes.len(), Utf16::default())?;
        let mut output = Vec::with_capacity(nodes.len());
        for node in nodes {
            ctx.charge_work(1, Utf16::default())?;
            let kind = member(node, "kind")
                .and_then(as_string)
                .ok_or_else(|| err("TYPESPEC_HOST_RESPONSE", "Syntax kind must be text"))?;
            let start = member(node, "start")
                .and_then(number_usize)
                .ok_or_else(|| {
                    err(
                        "TYPESPEC_HOST_RESPONSE",
                        "Syntax start must be a nonnegative integer",
                    )
                })?;
            let end = member(node, "end").and_then(number_usize).ok_or_else(|| {
                err(
                    "TYPESPEC_HOST_RESPONSE",
                    "Syntax end must be a nonnegative integer",
                )
            })?;
            if start > end || end > prepared.source.len() {
                return Err(err(
                    "TYPESPEC_HOST_RESPONSE",
                    "Syntax span is outside its retained source",
                ));
            }
            ctx.charge_work(kind.len(), kind.clone())?;
            output.push(object(vec![
                ("kind", Value::String(kind.clone())),
                ("start", Value::Number(start as f64)),
                ("end", Value::Number(end as f64)),
            ]));
        }
        Ok(Value::Array(output))
    }

    pub fn import_sources(
        &self,
        input: &Value,
        id: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let input = copy_json(input, ctx)?;
        require_object(
            &input,
            &["entrypoint", "files", "libraries"],
            "TYPESPEC_INPUT",
        )?;
        if !matches!(member(&input, "entrypoint"), Some(Value::String(_)))
            || !matches!(member(&input, "files"), Some(Value::Object(_)))
        {
            return Err(err(
                "TYPESPEC_INPUT",
                "Source entrypoint and files are required",
            ));
        }
        let mut payload = vec![
            ("profile", s("typespec-1.16.0-sources")),
            (
                "entrypoint",
                copy_json(member(&input, "entrypoint").unwrap(), ctx)?,
            ),
            ("files", copy_json(member(&input, "files").unwrap(), ctx)?),
        ];
        if let Some(libraries) = member(&input, "libraries") {
            payload.push(("libraries", copy_json(libraries, ctx)?));
        }
        let document = object(vec![
            ("umf", s(CORE_VERSION)),
            ("id", copy_json(id, ctx)?),
            (
                "vocabularies",
                object(vec![(EXT, object(vec![("version", s(EXT_VERSION))]))]),
            ),
            (
                "modules",
                Value::Array(vec![object(vec![
                    ("id", s("schema")),
                    ("namespace", s("")),
                    (
                        "elements",
                        Value::Array(vec![object(vec![
                            ("id", s("schema")),
                            ("extensions", object(vec![(EXT, object(payload))])),
                        ])]),
                    ),
                ])]),
            ),
        ]);
        let validation = self.inspect(&document, ctx)?;
        if !validation.valid {
            return Err(validation_error("TYPESPEC_DOCUMENT", validation));
        }
        Ok(document)
    }

    pub fn import_sources_checked(
        &self,
        input: &Value,
        id: &Value,
        parser_diagnostics: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let document = self.import_sources(input, id, ctx)?;
        let validation = self.inspect_payload(&document, parser_diagnostics, ctx)?;
        if !validation.valid {
            return Err(validation_error("TYPESPEC_DOCUMENT", validation));
        }
        Ok(document)
    }

    pub fn prepare_import(
        &self,
        input: &Value,
        id: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<(PreparedTypeSpecInspection, Value), EngineError> {
        let document = self.import_sources(input, id, ctx)?;
        self.prepare_inspection(&document, true, ctx)
    }

    pub fn export_sources(
        &self,
        document: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let validation = self.inspect_payload(document, &Value::Array(Vec::new()), ctx)?;
        if !validation.valid {
            return Err(validation_error("TYPESPEC_DOCUMENT", validation));
        }
        let payload = find_payload(document, ctx)?
            .ok_or_else(|| err("TYPESPEC_PAYLOAD", "Missing TypeSpec source payload"))?;
        if !matches!(payload, Value::Object(_)) {
            return Err(err(
                "TYPESPEC_PAYLOAD",
                "TypeSpec source payload must be an object",
            ));
        }
        if member(&payload, "profile") != Some(&s("typespec-1.16.0-sources")) {
            return Err(err("TYPESPEC_PAYLOAD", "Missing TypeSpec source profile"));
        }
        if find_ext_version(document) != Some(&s(EXT_VERSION)) {
            return Err(err(
                "TYPESPEC_PAYLOAD",
                "Missing TypeSpec extension version",
            ));
        }
        if let Value::Object(fields) = &payload {
            if fields.iter().any(|(key, _)| {
                key.to_utf8().ok().is_none_or(|key| {
                    !["profile", "entrypoint", "files", "libraries"].contains(&key.as_str())
                })
            }) {
                return Err(err(
                    "TYPESPEC_REPRESENTATION",
                    "Native export would discard unknown source representation fields",
                ));
            }
        }
        let mut exported = vec![
            (
                "entrypoint",
                copy_json(
                    member(&payload, "entrypoint")
                        .ok_or_else(|| err("TYPESPEC_PAYLOAD", "Entrypoint is missing"))?,
                    ctx,
                )?,
            ),
            (
                "files",
                copy_json(
                    member(&payload, "files")
                        .ok_or_else(|| err("TYPESPEC_PAYLOAD", "Files are missing"))?,
                    ctx,
                )?,
            ),
        ];
        if let Some(libraries) = member(&payload, "libraries") {
            exported.push(("libraries", copy_json(libraries, ctx)?));
        }
        Ok(object(exported))
    }

    pub fn edit_source(
        &self,
        document: &Value,
        path: &Value,
        replacement: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let path = as_string(path).ok_or_else(|| err("TYPESPEC_EDIT", "File path must be text"))?;
        if !matches!(replacement, Value::String(_)) {
            return Err(err("TYPESPEC_EDIT", "Replacement source must be text"));
        }
        let validation = self.inspect_payload(document, &Value::Array(Vec::new()), ctx)?;
        if !validation.valid {
            return Err(validation_error("TYPESPEC_DOCUMENT", validation));
        }
        let source_payload = find_payload(document, ctx)?
            .ok_or_else(|| err("TYPESPEC_PAYLOAD", "Missing TypeSpec source payload"))?;
        if !matches!(source_payload, Value::Object(_)) {
            return Err(err(
                "TYPESPEC_PAYLOAD",
                "TypeSpec source payload must be an object",
            ));
        }
        if member(&source_payload, "profile") != Some(&s("typespec-1.16.0-sources")) {
            return Err(err("TYPESPEC_PAYLOAD", "Missing TypeSpec source profile"));
        }
        if find_ext_version(document) != Some(&s(EXT_VERSION)) {
            return Err(err(
                "TYPESPEC_PAYLOAD",
                "Missing TypeSpec extension version",
            ));
        }
        let files = member(&source_payload, "files")
            .ok_or_else(|| err("TYPESPEC_FILES", "Files are missing"))?;
        let existing = match files {
            Value::Object(fields) => fields.iter().any(|(key, _)| key == path),
            _ => false,
        };
        if !existing {
            return Err(err(
                "TYPESPEC_EDIT",
                "Edit must replace a supplied source file",
            ));
        }
        let mut candidate = copy_json(document, ctx)?;
        let payload = find_payload_mut(&mut candidate)
            .ok_or_else(|| err("TYPESPEC_PAYLOAD", "Missing TypeSpec source payload"))?;
        let file_map = member_mut(payload, "files")
            .ok_or_else(|| err("TYPESPEC_FILES", "Files are missing"))?;
        let entry = match file_map {
            Value::Object(fields) => fields
                .iter_mut()
                .find(|(key, _)| key == path)
                .map(|(_, value)| value),
            _ => None,
        }
        .ok_or_else(|| err("TYPESPEC_EDIT", "Edit must replace a supplied source file"))?;
        *entry = copy_json(replacement, ctx)?;
        let validation = self.inspect_payload(&candidate, &Value::Array(Vec::new()), ctx)?;
        Ok(object(vec![
            ("document", candidate),
            ("validation", validation_value(validation, ctx)?),
        ]))
    }

    pub fn prepare(
        &self,
        document: &Value,
        operation: TypeSpecOperation,
        operands: Option<&Value>,
        ctx: &mut Context<'_>,
    ) -> Result<PreparedTypeSpecOperation, EngineError> {
        let admitted = copy_json(document, ctx)?;
        let validation = self.inspect(&admitted, ctx)?;
        if !validation.valid {
            return Err(validation_error("TYPESPEC_DOCUMENT", validation));
        }
        let payload = find_payload(&admitted, ctx)?
            .ok_or_else(|| err("TYPESPEC_PAYLOAD", "Missing TypeSpec source payload"))?;
        if member(&payload, "profile") != Some(&s("typespec-1.16.0-sources"))
            || find_ext_version(&admitted) != Some(&s(EXT_VERSION))
        {
            return Err(err(
                "TYPESPEC_PAYLOAD",
                "Missing TypeSpec 1.16.0 source profile",
            ));
        }
        if matches!(&payload, Value::Object(fields) if fields.iter().any(|(key, _)| key.to_utf8().ok().is_none_or(|key| !["profile", "entrypoint", "files", "libraries"].contains(&key.as_str()))))
        {
            return Err(err(
                "TYPESPEC_REPRESENTATION",
                "Native compiler operations would discard unknown source representation fields",
            ));
        }
        let entrypoint = member(&payload, "entrypoint")
            .and_then(as_string)
            .ok_or_else(|| err("TYPESPEC_ENTRYPOINT", "Entrypoint must be text"))?;
        let files = member(&payload, "files")
            .ok_or_else(|| err("TYPESPEC_FILES", "Source files are required"))?;
        validate_files(files, entrypoint, ctx)?;
        let libraries = member(&payload, "libraries").unwrap_or(&EMPTY_OBJECT);
        validate_libraries(libraries, ctx)?;
        let mut fields = vec![
            ("profile", s("umf.typespec-host/1")),
            ("operation", s(operation_name(operation))),
            (
                "entrypoint",
                copy_json(
                    member(&payload, "entrypoint")
                        .ok_or_else(|| err("TYPESPEC_ENTRYPOINT", "Entrypoint is required"))?,
                    ctx,
                )?,
            ),
            ("files", copy_json(files, ctx)?),
            ("libraries", copy_json(libraries, ctx)?),
        ];
        let admitted_operands = operands.map(|v| copy_json(v, ctx)).transpose()?;
        match operation {
            TypeSpecOperation::Compile => {
                ensure_empty_operands(operands, "compile", ctx)?;
            }
            TypeSpecOperation::SemanticGraph => {
                let roots = exact_member(operands, "roots", "TYPESPEC_GRAPH_OPTIONS")?;
                validate_roots(roots, ctx)?;
                fields.push(("roots", copy_json(roots, ctx)?));
                fields.push(("source", copy_json(&admitted, ctx)?));
            }
            TypeSpecOperation::EmitJsonSchema => {
                let options = exact_member(operands, "options", "TYPESPEC_EMISSION_POLICY")?;
                validate_emitter_options(options, &libraries, ctx)?;
                fields.push(("emitter", s("@typespec/json-schema@1.16.0")));
                fields.push(("options", copy_json(options, ctx)?));
                fields.push(("source", copy_json(&admitted, ctx)?));
            }
        }
        let request = object(fields);
        ctx.charge_work(1, Utf16::default())?;
        Ok(PreparedTypeSpecOperation {
            operation,
            document: admitted,
            request,
            operands: admitted_operands,
        })
    }

    pub fn finish(
        &self,
        prepared: PreparedTypeSpecOperation,
        response: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let response = copy_json(response, ctx)?;
        let valid = match member(&response, "valid") {
            Some(Value::Bool(valid)) => *valid,
            _ => {
                return Err(err(
                    "TYPESPEC_HOST_RESPONSE",
                    "Host valid flag must be boolean",
                ));
            }
        };
        let diagnostics = member(&response, "diagnostics")
            .ok_or_else(|| err("TYPESPEC_HOST_RESPONSE", "Host diagnostics are required"))?;
        if let Value::Array(diagnostics) = diagnostics {
            let has_error = diagnostics
                .iter()
                .any(|d| member(d, "severity") == Some(&s("error")));
            if valid == has_error {
                return Err(err(
                    "TYPESPEC_HOST_RESPONSE",
                    "Host validity disagrees with compiler diagnostics",
                ));
            }
        } else {
            return Err(err(
                "TYPESPEC_HOST_RESPONSE",
                "Host diagnostics must be an array",
            ));
        }
        let compiler = compiler_report(prepared.request(), valid, diagnostics, ctx)?;
        let response = match prepared.operation {
            TypeSpecOperation::Compile => compiler,
            TypeSpecOperation::SemanticGraph => {
                let expected_roots =
                    member(prepared.operands.as_ref().unwrap_or(&Value::Null), "roots")
                        .and_then(|v| {
                            if let Value::Array(a) = v {
                                Some(a.len())
                            } else {
                                None
                            }
                        })
                        .unwrap_or(usize::MAX);
                let requested_roots =
                    member(prepared.operands.as_ref().unwrap_or(&Value::Null), "roots")
                        .ok_or_else(|| {
                            err("TYPESPEC_SESSION", "Retained graph roots are missing")
                        })?;
                let (roots, nodes, issues) = project_graph(&response, requested_roots, ctx)?;
                object(vec![
                    (
                        "status",
                        s(if valid && array_len(&roots) == expected_roots {
                            "available"
                        } else {
                            "blocked"
                        }),
                    ),
                    ("source", copy_json(&prepared.document, ctx)?),
                    ("compilation", compiler),
                    ("roots", roots),
                    ("nodes", nodes),
                    ("issues", issues),
                    ("complete", Value::Bool(false)),
                    (
                        "limitations",
                        strings(&[
                            "Selected compiled type graph only; compiler state maps, arbitrary decorator effects and reverse relationships are not fully serialized",
                            "Node IDs are snapshot-local, not stable cross-version identities",
                            "Source remains authoritative; snapshot editing and cross-system equivalence are not established",
                        ]),
                    ),
                ])
            }
            TypeSpecOperation::EmitJsonSchema => {
                let files = member(&response, "files")
                    .ok_or_else(|| err("TYPESPEC_HOST_RESPONSE", "Emitter files are required"))?;
                let options = member(
                    prepared.operands.as_ref().unwrap_or(&Value::Null),
                    "options",
                )
                .ok_or_else(|| {
                    err(
                        "TYPESPEC_EMISSION_POLICY",
                        "Retained emitter options are missing",
                    )
                })?;
                let emitted_count = array_or_object_len(files);
                let mut compilation = compiler;
                if let Value::Object(fields) = &mut compilation {
                    if let Some((_, Value::Array(limitations))) =
                        fields.iter_mut().find(|(k, _)| k == &kstr("limitations"))
                    {
                        if let Some(Value::String(first)) = limitations.first_mut() {
                            *first = Utf16::from(
                                "Compiler ran the selected pinned JSON Schema emitter in the memory host; arbitrary project JavaScript remains unregistered",
                            );
                        }
                    }
                }
                object(vec![
                    (
                        "status",
                        s(if !valid {
                            "blocked"
                        } else if emitted_count == 0 {
                            "empty"
                        } else {
                            "emitted"
                        }),
                    ),
                    ("source", copy_json(&prepared.document, ctx)?),
                    ("emitter", s("@typespec/json-schema@1.16.0")),
                    (
                        "policy",
                        object(vec![("options", copy_json(options, ctx)?)]),
                    ),
                    ("compilation", compilation),
                    (
                        "files",
                        if valid {
                            copy_json(files, ctx)?
                        } else {
                            object(Vec::new())
                        },
                    ),
                    ("complete", Value::Bool(false)),
                    (
                        "limitations",
                        strings(&[
                            "Native emitter output is not proof of lossless TypeSpec semantic projection",
                            "Native JSON Schema 1.16.0 emission can round exact numeric literals through JavaScript numbers (9007199254740993 becomes 9007199254740992); int64-strategy does not prevent literal rounding",
                            "Native JSON Schema 1.16.0 emission omits int64/uint64 bounds; string strategy also omits numeric syntax constraints. Generated validators can therefore accept values outside the source scalar domain",
                            "TypeSpec operations, decorators, source identity and runtime semantics are retained in source, not guaranteed by generated validators",
                        ]),
                    ),
                ])
            }
        };
        let schema = &self.report_schemas[match prepared.operation {
            TypeSpecOperation::Compile => 0,
            TypeSpecOperation::SemanticGraph => 1,
            TypeSpecOperation::EmitJsonSchema => 2,
        }];
        let errors = schema.validate(&response, ctx)?;
        if !errors.is_empty() {
            return Err(schema_error("TYPESPEC_HOST_RESPONSE", errors));
        }
        ctx.charge_work(1, Utf16::default())?;
        Ok(response)
    }
}

fn validate_files(
    files: &Value,
    entrypoint: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(files) = files else {
        return Err(err("TYPESPEC_FILES", "Files must be an object"));
    };
    if files.is_empty() || files.len() > ctx.limits().max_values {
        return Err(err(
            "LIMIT",
            "TypeSpec source file count exceeds structural limit",
        ));
    }
    let mut total = 0usize;
    let mut entry = false;
    for (path, text) in files {
        ctx.charge_work(1, path.clone())?;
        let Ok(path) = path.to_utf8() else {
            return Err(err(
                "TYPESPEC_PATH",
                "TypeSpec paths must be portable UTF-8",
            ));
        };
        if !valid_tsp_path(&path) {
            return Err(err(
                "TYPESPEC_PATH",
                "Source paths must be relative .tsp paths without traversal",
            ));
        }
        entry |= path.encode_utf16().eq(entrypoint.units().iter().copied());
        let Value::String(text) = text else {
            return Err(err("TYPESPEC_FILES", "Source file values must be strings"));
        };
        total = total.saturating_add(text.len());
        if total > ctx.limits().max_text_units {
            return Err(err("LIMIT", "Source bundle exceeds text limit"));
        }
    }
    if !entry {
        return Err(err(
            "TYPESPEC_ENTRYPOINT",
            "Entrypoint must name a supplied file",
        ));
    }
    Ok(())
}
fn valid_tsp_path(path: &str) -> bool {
    if !path.ends_with(".tsp") {
        return false;
    }
    path.split('/').all(|part| {
        !part.is_empty()
            && part != "."
            && part != ".."
            && part
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
    })
}
fn validate_libraries(libraries: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let Value::Object(entries) = libraries else {
        return Err(err("TYPESPEC_LIBRARIES", "Libraries must be an object"));
    };
    for (name, version) in entries {
        ctx.charge_work(1, name.clone())?;
        if name.is_empty() || !matches!(version, Value::String(v) if !v.is_empty()) {
            return Err(err(
                "TYPESPEC_LIBRARIES",
                "Library names and versions must be nonempty strings",
            ));
        }
    }
    Ok(())
}
fn validate_roots(roots: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let Value::Array(roots) = roots else {
        return Err(err("TYPESPEC_GRAPH_OPTIONS", "roots must be an array"));
    };
    if roots.is_empty() || roots.len() > 1000 {
        return Err(err(
            "TYPESPEC_GRAPH_OPTIONS",
            "Select 1–1000 native type expressions",
        ));
    }
    for root in roots {
        ctx.charge_work(1, Utf16::default())?;
        if !matches!(root, Value::String(v) if !v.is_empty()) {
            return Err(err(
                "TYPESPEC_GRAPH_OPTIONS",
                "Type expressions must be nonempty strings",
            ));
        }
    }
    Ok(())
}
fn validate_emitter_options(
    options: &Value,
    libraries: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(fields) = options else {
        return Err(err(
            "TYPESPEC_EMISSION_POLICY",
            "Emitter options must be an object",
        ));
    };
    if fields.iter().any(|(k, _)| k == &kstr("emitter-output-dir")) {
        return Err(err(
            "TYPESPEC_EMISSION_POLICY",
            "Output location is controlled by the memory host",
        ));
    }
    if !matches!(member(options,"int64-strategy"),Some(Value::String(v)) if v == &kstr("string") || v == &kstr("number"))
    {
        return Err(err(
            "TYPESPEC_EMISSION_POLICY",
            "Emitter options must explicitly select int64-strategy string or number",
        ));
    }
    if member(libraries, "@typespec/json-schema") != Some(&s("1.16.0")) {
        return Err(err(
            "TYPESPEC_EMISSION_LIBRARY",
            "Select @typespec/json-schema 1.16.0 explicitly",
        ));
    }
    ctx.charge_work(fields.len(), Utf16::default())?;
    Ok(())
}
fn ensure_empty_operands(
    operands: Option<&Value>,
    op: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if let Some(Value::Object(entries)) = operands {
        ctx.charge_work(entries.len(), Utf16::default())?;
        if !entries.is_empty() {
            return Err(err("REQUEST", "Compile takes no operation options"));
        }
    } else if operands.is_some() {
        return Err(err("REQUEST", "Compile options must be an object"));
    }
    let _ = op;
    Ok(())
}
fn exact_member<'a>(
    value: Option<&'a Value>,
    name: &str,
    code: &str,
) -> Result<&'a Value, EngineError> {
    let value = value.ok_or_else(|| err(code, "Operation input is required"))?;
    if !matches!(value, Value::Object(_)) {
        return Err(err(code, "Operation input must be an object"));
    }
    let fields = match value {
        Value::Object(v) => v,
        _ => unreachable!(),
    };
    if fields.iter().any(|(k, _)| k != &kstr(name)) {
        return Err(err(code, "Unknown operation input member"));
    }
    member(value, name).ok_or_else(|| err(code, "Operation input is required"))
}
fn find_payload(document: &Value, ctx: &mut Context<'_>) -> Result<Option<Value>, EngineError> {
    let Some(Value::Array(modules)) = member(document, "modules") else {
        return Ok(None);
    };
    for module in modules {
        ctx.charge_work(1, Utf16::default())?;
        if member(module, "id") != Some(&s("schema")) {
            continue;
        }
        let Some(Value::Array(elements)) = member(module, "elements") else {
            continue;
        };
        for element in elements {
            ctx.charge_work(1, Utf16::default())?;
            if member(element, "id") == Some(&s("schema")) {
                return member(member(element, "extensions").unwrap_or(&Value::Null), EXT)
                    .map(|v| copy_json(v, ctx))
                    .transpose();
            }
        }
    }
    Ok(None)
}
fn find_ext_version(document: &Value) -> Option<&Value> {
    member(member(document, "vocabularies")?, EXT).and_then(|v| member(v, "version"))
}
fn find_payload_mut(document: &mut Value) -> Option<&mut Value> {
    let modules = member_mut(document, "modules")?;
    let Value::Array(modules) = modules else {
        return None;
    };
    for module in modules {
        if member(module, "id") != Some(&s("schema")) {
            continue;
        }
        let Some(Value::Array(elements)) = member_mut(module, "elements") else {
            continue;
        };
        for element in elements {
            if member(element, "id") != Some(&s("schema")) {
                continue;
            }
            if let Some(payload) = member_mut(member_mut(element, "extensions")?, EXT) {
                return Some(payload);
            }
        }
    }
    None
}
fn require_object(value: &Value, allowed: &[&str], code: &str) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(err(code, "Expected an object"));
    };
    let mut seen = std::collections::BTreeSet::new();
    for (key, _) in fields {
        let Ok(key) = key.to_utf8() else {
            return Err(err(code, "Object keys must be UTF-8"));
        };
        if !seen.insert(key.clone()) {
            return Err(err(code, "Duplicate object member"));
        }
        if !allowed.contains(&key.as_str()) {
            return Err(err(code, "Unknown object member"));
        }
    }
    Ok(())
}
fn validation_value(validation: Validation, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(validation.diagnostics.len(), Utf16::default())?;
    let mut diagnostics = Vec::with_capacity(validation.diagnostics.len());
    for d in validation.diagnostics {
        ctx.charge_work(
            d.code
                .len()
                .saturating_add(d.path.len())
                .saturating_add(d.message.len()),
            Utf16::default(),
        )?;
        diagnostics.push(object(vec![
            ("code", Value::String(d.code)),
            ("path", Value::String(d.path)),
            (
                "severity",
                s(match d.severity {
                    Severity::Error => "error",
                    Severity::Warning => "warning",
                }),
            ),
            ("message", Value::String(d.message)),
        ]));
    }
    Ok(object(vec![
        ("valid", Value::Bool(validation.valid)),
        ("complete", Value::Bool(validation.complete)),
        ("diagnostics", Value::Array(diagnostics)),
    ]))
}
fn operation_name(op: TypeSpecOperation) -> &'static str {
    match op {
        TypeSpecOperation::Compile => "compile",
        TypeSpecOperation::SemanticGraph => "semanticGraph",
        TypeSpecOperation::EmitJsonSchema => "emitJsonSchema",
    }
}
fn compile_schema(
    text: &str,
    resources: &SchemaResources,
    ctx: &mut Context<'_>,
) -> Result<CompiledSchema, EngineError> {
    CompiledSchema::compile_consumer(&json(text, ctx)?, resources, false, ctx)
}
fn json(text: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let units = text.encode_utf16().collect::<Vec<_>>();
    ctx.charge_text(units.len(), Utf16::default())?;
    serialization::read_json_value(&units, Format::Json, ctx)
}
fn validation_error(code: &str, validation: Validation) -> EngineError {
    match validation.diagnostics.into_iter().next() {
        Some(diagnostic) => EngineError::new(code, diagnostic.path, diagnostic.message),
        None => err(code, "Invalid TypeSpec document"),
    }
}
fn schema_error(code: &str, errors: Vec<crate::schema::StructuralError>) -> EngineError {
    err(code, &format!("{} structural errors", errors.len()))
}
fn compiler_report(
    request: &Value,
    valid: bool,
    diagnostics: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let libraries = member(request, "libraries")
        .ok_or_else(|| err("TYPESPEC_SESSION", "Retained library selection is missing"))?;
    Ok(object(vec![
        ("compiler", s("@typespec/compiler@1.16.0")),
        ("libraries", copy_json(libraries, ctx)?),
        ("valid", Value::Bool(valid)),
        ("complete", Value::Bool(false)),
        ("diagnostics", copy_json(diagnostics, ctx)?),
        (
            "limitations",
            strings(&[
                "Compiler checks supplied TypeSpec and the pinned standard library; only explicitly selected registered libraries are available; arbitrary JavaScript and emitters are not loaded",
                "Compiler validity does not establish cross-system projection equivalence",
            ]),
        ),
    ]))
}
fn project_graph(
    response: &Value,
    requested_roots: &Value,
    ctx: &mut Context<'_>,
) -> Result<(Value, Value, Value), EngineError> {
    let raw_nodes = match member(response, "nodes") {
        Some(Value::Array(nodes)) => nodes,
        _ => {
            return Err(err(
                "TYPESPEC_HOST_RESPONSE",
                "Raw compiler nodes must be an array",
            ));
        }
    };
    if raw_nodes.len() > ctx.limits().max_values {
        return Err(err(
            "LIMIT",
            "TypeSpec graph node count exceeds structural limit",
        ));
    }
    ctx.charge_work(raw_nodes.len(), Utf16::default())?;
    let mut ids = std::collections::BTreeMap::<Utf16, Utf16>::new();
    for (index, raw) in raw_nodes.iter().enumerate() {
        let key = member(raw, "key")
            .and_then(as_string)
            .ok_or_else(|| err("TYPESPEC_HOST_RESPONSE", "Compiler node key is missing"))?;
        ctx.charge_work(key.len().saturating_add(16), key.clone())?;
        let id = Utf16::from_utf8(&format!("type_{index}"));
        if ids.insert(key.clone(), id).is_some() {
            return Err(err(
                "TYPESPEC_HOST_RESPONSE",
                "Duplicate compiler node identity",
            ));
        }
    }
    let raw_roots = match member(response, "roots") {
        Some(Value::Array(roots)) => roots,
        _ => {
            return Err(err(
                "TYPESPEC_HOST_RESPONSE",
                "Raw compiler roots must be an array",
            ));
        }
    };
    let requested_roots = match requested_roots {
        Value::Array(roots) => roots,
        _ => return Err(err("TYPESPEC_SESSION", "Retained graph roots are invalid")),
    };
    if raw_roots.len() != requested_roots.len() {
        return Err(err(
            "TYPESPEC_HOST_RESPONSE",
            "Compiler returned a different root count",
        ));
    }
    if raw_roots.len() > ctx.limits().max_values {
        return Err(err(
            "LIMIT",
            "TypeSpec graph root count exceeds structural limit",
        ));
    }
    let mut roots = Vec::new();
    let mut issues = Vec::new();
    for (index, raw) in raw_roots.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        let expression = member(raw, "expression")
            .and_then(as_string)
            .ok_or_else(|| {
                err(
                    "TYPESPEC_HOST_RESPONSE",
                    "Compiler root expression is missing",
                )
            })?;
        if member(raw, "expression") != Some(&requested_roots[index]) {
            return Err(err(
                "TYPESPEC_HOST_RESPONSE",
                "Compiler changed a retained root expression",
            ));
        }
        if let Some(target) = member(raw, "target").and_then(as_string) {
            let id = ids
                .get(target)
                .ok_or_else(|| err("TYPESPEC_HOST_RESPONSE", "Compiler root target is unknown"))?;
            ctx.charge_work(
                expression.len().saturating_add(id.len()),
                expression.clone(),
            )?;
            roots.push(object(vec![
                ("expression", Value::String(expression.clone())),
                ("target", Value::String(id.clone())),
            ]));
        } else {
            let mut messages = Vec::new();
            if let Some(Value::Array(ds)) = member(raw, "diagnostics") {
                for diagnostic in ds {
                    if let Some(message) = member(diagnostic, "message").and_then(as_string) {
                        messages.push(message);
                    }
                }
            }
            let prefix = Utf16::from_utf8("Cannot resolve ");
            let separator = Utf16::from_utf8("; ");
            let suffix = Utf16::from_utf8(": ");
            let mut parts: Vec<&Utf16> = vec![&prefix, expression, &suffix];
            for (index, message) in messages.iter().enumerate() {
                if index != 0 {
                    parts.push(&separator);
                }
                parts.push(message);
            }
            let detail = join_utf16(&parts, ctx)?;
            ctx.charge_work(1, Utf16::default())?;
            issues.push(object(vec![
                ("code", s("TYPESPEC_GRAPH_ROOT")),
                ("detail", Value::String(detail)),
            ]));
        }
    }
    let mut nodes = Vec::new();
    let mut total_edges = 0usize;
    for raw in raw_nodes {
        ctx.charge_work(1, Utf16::default())?;
        let key = member(raw, "key")
            .and_then(as_string)
            .ok_or_else(|| err("TYPESPEC_HOST_RESPONSE", "Compiler node key is missing"))?;
        let id = ids.get(key).ok_or_else(|| {
            err(
                "TYPESPEC_HOST_RESPONSE",
                "Compiler node identity is missing",
            )
        })?;
        let kind = member(raw, "kind")
            .and_then(as_string)
            .ok_or_else(|| err("TYPESPEC_HOST_RESPONSE", "Compiler node kind is missing"))?;
        let label = member(raw, "label")
            .and_then(as_string)
            .ok_or_else(|| err("TYPESPEC_HOST_RESPONSE", "Compiler node label is missing"))?;
        let fields = member(raw, "fields")
            .ok_or_else(|| err("TYPESPEC_HOST_RESPONSE", "Compiler node fields are missing"))?;
        let attributes = rewrite_refs(fields, &ids, ctx)?;
        let references = match member(raw, "references") {
            Some(Value::Array(refs)) => refs,
            _ => {
                return Err(err(
                    "TYPESPEC_HOST_RESPONSE",
                    "Compiler references must be an array",
                ));
            }
        };
        if references.len() > ctx.limits().max_values {
            return Err(err(
                "LIMIT",
                "TypeSpec graph edge count exceeds structural limit",
            ));
        }
        total_edges = total_edges.saturating_add(references.len());
        if total_edges > ctx.limits().max_values {
            return Err(err(
                "LIMIT",
                "TypeSpec graph edge count exceeds structural limit",
            ));
        }
        let kind_text = kind
            .to_utf8()
            .map_err(|_| err("TYPESPEC_HOST_RESPONSE", "Compiler node kind must be UTF-8"))?;
        ctx.charge_work(
            id.len()
                .saturating_add(kind.len())
                .saturating_add(label.len()),
            Utf16::default(),
        )?;
        let mut edges = Vec::new();
        for reference in references {
            ctx.charge_work(1, Utf16::default())?;
            let field = member(reference, "field")
                .and_then(as_string)
                .ok_or_else(|| {
                    err(
                        "TYPESPEC_HOST_RESPONSE",
                        "Compiler reference field is missing",
                    )
                })?
                .to_utf8()
                .map_err(|_| {
                    err(
                        "TYPESPEC_HOST_RESPONSE",
                        "Compiler reference field must be UTF-8",
                    )
                })?;
            let target = member(reference, "target")
                .and_then(as_string)
                .ok_or_else(|| {
                    err(
                        "TYPESPEC_HOST_RESPONSE",
                        "Compiler reference target is missing",
                    )
                })?;
            let target_id = ids.get(target).ok_or_else(|| {
                err(
                    "TYPESPEC_HOST_RESPONSE",
                    "Compiler reference target is unknown",
                )
            })?;
            let usage = member(reference, "usage")
                .and_then(as_string)
                .and_then(|v| v.to_utf8().ok());
            let role = reference_role(&kind_text, &field, usage.as_deref())
                .ok_or_else(|| err("TYPESPEC_HOST_RESPONSE", "Unknown compiler reference field"))?;
            let mut edge = vec![
                ("role", s(&role)),
                ("target", Value::String(target_id.clone())),
            ];
            if let Some(name) = member(reference, "name") {
                edge.push(("name", copy_json(name, ctx)?));
            }
            if let Some(index) = member(reference, "index") {
                edge.push(("index", copy_json(index, ctx)?));
            }
            ctx.charge_work(1, Utf16::default())?;
            edges.push(object(edge));
        }
        if member(fields, "hasConstructors") == Some(&Value::Bool(true)) {
            ctx.charge_work(1, Utf16::default())?;
            issues.push(object(vec![
                ("code", s("TYPESPEC_CONSTRUCTORS")),
                (
                    "detail",
                    Value::String(join_utf16(
                        &[
                            &label,
                            &Utf16::from_utf8(" has constructors retained in source"),
                        ],
                        ctx,
                    )?),
                ),
            ]));
        }
        if member(fields, "unexpandedKind").is_some() {
            ctx.charge_work(1, Utf16::default())?;
            issues.push(object(vec![
                ("code", s("TYPESPEC_GRAPH_KIND")),
                (
                    "detail",
                    Value::String(join_utf16(
                        &[
                            &Utf16::from_utf8("Unexpanded "),
                            &kind,
                            &Utf16::from_utf8(" "),
                            &label,
                            &Utf16::from_utf8(" remains in source"),
                        ],
                        ctx,
                    )?),
                ),
            ]));
        }
        if member(fields, "value")
            .is_some_and(|v| member(v, "unavailable") == Some(&Value::Bool(true)))
        {
            ctx.charge_work(1, Utf16::default())?;
            issues.push(object(vec![
                ("code", s("TYPESPEC_ENUM_NUMBER")),
                (
                    "detail",
                    Value::String(join_utf16(
                        &[
                            &label,
                            &Utf16::from_utf8(
                                " lacks an exact numeric source; value is retained only in source",
                            ),
                        ],
                        ctx,
                    )?),
                ),
            ]));
        }
        collect_value_issues(fields, &mut issues, ctx, 0)?;
        let mut node = vec![
            ("id", Value::String(id.clone())),
            ("kind", Value::String(kind.clone())),
            ("label", Value::String(label.clone())),
            ("attributes", attributes),
            ("edges", Value::Array(edges)),
        ];
        if let Some(location) = member(raw, "location") {
            node.push(("location", copy_json(location, ctx)?));
        }
        if let Some(doc) = member(raw, "doc") {
            let attr = node
                .iter_mut()
                .find(|(k, _)| *k == "attributes")
                .map(|(_, v)| v)
                .expect("attributes added");
            if let Value::Object(attr) = attr {
                ctx.charge_work(1, Utf16::default())?;
                attr.push((kstr("doc"), copy_json(doc, ctx)?));
            }
        }
        ctx.charge_work(1, Utf16::default())?;
        nodes.push(object(node));
    }
    Ok((
        Value::Array(roots),
        Value::Array(nodes),
        Value::Array(issues),
    ))
}
fn rewrite_refs(
    value: &Value,
    ids: &std::collections::BTreeMap<Utf16, Utf16>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if let Some(reference) = member(value, "ref").and_then(as_string) {
        let id = ids.get(reference).ok_or_else(|| {
            err(
                "TYPESPEC_HOST_RESPONSE",
                "Compiler value reference is unknown",
            )
        })?;
        ctx.charge_work(id.len(), id.clone())?;
        return Ok(Value::String(id.clone()));
    }
    match value {
        Value::Array(values) => values
            .iter()
            .map(|v| rewrite_refs(v, ids, ctx))
            .collect::<Result<Vec<_>, _>>()
            .map(Value::Array),
        Value::Object(fields) if member(value, "valueKind").is_some() => {
            let kind = member(value, "valueKind").expect("matched above");
            let mut projected = vec![(kstr("kind"), copy_json(kind, ctx)?)];
            for (key, child) in fields {
                if key == &kstr("valueKind") || key == &kstr("omitted") {
                    continue;
                }
                let name = if member(value, "valueKind") == Some(&s("EnumValue"))
                    && key == &kstr("value")
                {
                    kstr("member")
                } else {
                    key.clone()
                };
                ctx.charge_work(name.len(), name.clone())?;
                projected.push((name, rewrite_refs(child, ids, ctx)?));
            }
            Ok(Value::Object(projected))
        }
        Value::Object(fields) => fields
            .iter()
            .filter(|(key, value)| {
                !matches!(
                    key.to_utf8().as_deref(),
                    Ok("hasConstructors" | "unexpandedKind")
                ) && !(key == &kstr("value")
                    && member(value, "unavailable") == Some(&Value::Bool(true)))
            })
            .map(|(k, v)| {
                ctx.charge_work(1, k.clone())?;
                Ok((k.clone(), rewrite_refs(v, ids, ctx)?))
            })
            .collect::<Result<Vec<_>, EngineError>>()
            .map(Value::Object),
        _ => copy_json(value, ctx),
    }
}
fn reference_role(kind: &str, field: &str, usage: Option<&str>) -> Option<String> {
    let role = match (kind, field) {
        ("Model", "properties") => "property",
        ("Model", "baseModel") => "baseModel",
        ("Model", "sourceModel") => "sourceModel",
        ("Model", "sourceModels") => return usage.map(|v| format!("source:{v}")),
        ("Model", "indexerKey") => "indexKey",
        ("Model", "indexerValue") => "indexValue",
        ("ModelProperty", "type") | ("UnionVariant", "type") | ("StringTemplateSpan", "type") => {
            "type"
        }
        ("ModelProperty", "sourceProperty") => "sourceProperty",
        ("Scalar", "baseScalar") => "baseScalar",
        ("Interface", "operations") => "operation",
        ("Interface", "sourceInterfaces") => "sourceInterface",
        ("Operation", "parameters") => "parameters",
        ("Operation", "returnType") => "returnType",
        ("Operation", "sourceOperation") => "sourceOperation",
        ("Enum", "members") => "member",
        ("EnumMember", "sourceMember") => "sourceMember",
        ("Union", "variants") => "variant",
        ("Union", "baseType") => "baseType",
        ("Tuple", "values") => "item",
        ("StringTemplate", "spans") => "span",
        _ => return None,
    };
    Some(role.to_owned())
}
fn collect_value_issues(
    value: &Value,
    issues: &mut Vec<Value>,
    ctx: &mut Context<'_>,
    depth: usize,
) -> Result<(), EngineError> {
    if depth > ctx.limits().max_depth {
        return Err(err("LIMIT", "Raw compiler value exceeds structural depth"));
    }
    ctx.charge_work(1, Utf16::default())?;
    if let Some(kind) = member(value, "valueKind").and_then(as_string) {
        let recognized = matches!(
            kind.to_utf8().as_deref(),
            Ok("NumericValue"
                | "StringValue"
                | "BooleanValue"
                | "NullValue"
                | "EnumValue"
                | "ArrayValue"
                | "ObjectValue"
                | "ScalarValue")
        );
        if !recognized || member(value, "omitted").is_some() {
            issues.push(object(vec![
                ("code", s("TYPESPEC_VALUE_STATE")),
                (
                    "detail",
                    Value::String(join_utf16(
                        &[
                            &Utf16::from_utf8("Unencoded value kind "),
                            kind,
                            &Utf16::from_utf8(" retained in source"),
                        ],
                        ctx,
                    )?),
                ),
            ]));
        }
    }
    match value {
        Value::Array(values) => {
            for value in values {
                collect_value_issues(value, issues, ctx, depth + 1)?;
            }
        }
        Value::Object(fields) => {
            for (_, value) in fields {
                collect_value_issues(value, issues, ctx, depth + 1)?;
            }
        }
        _ => {}
    }
    Ok(())
}
fn join_utf16(parts: &[&Utf16], ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let total = parts
        .iter()
        .try_fold(0usize, |sum, part| sum.checked_add(part.len()))
        .ok_or_else(|| err("LIMIT", "TypeSpec diagnostic text length overflow"))?;
    ctx.charge_text(total, Utf16::default())?;
    let mut units = Vec::with_capacity(total);
    for part in parts {
        units.extend_from_slice(part.units());
    }
    Ok(Utf16::new(units))
}
fn pointer_path(prefix: &str, value: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let prefix_len = prefix.encode_utf16().count();
    let extra = value.len().saturating_add(
        value
            .units()
            .iter()
            .filter(|u| **u == 0x2f || **u == 0x7e)
            .count(),
    );
    ctx.charge_text(prefix_len.saturating_add(extra), Utf16::default())?;
    let mut units = prefix.encode_utf16().collect::<Vec<_>>();
    for unit in value.units() {
        match *unit {
            0x7e => units.extend_from_slice(&[0x7e, 0x30]),
            0x2f => units.extend_from_slice(&[0x7e, 0x31]),
            unit => units.push(unit),
        }
    }
    Ok(Utf16::new(units))
}
fn diagnostic(code: &str, path: Utf16, message: Utf16, severity: Severity) -> Diagnostic {
    diagnostic_utf16(Utf16::from(code), path, message, severity)
}
fn diagnostic_utf16(code: Utf16, path: Utf16, message: Utf16, severity: Severity) -> Diagnostic {
    Diagnostic {
        code,
        path,
        python_source_path: false,
        message,
        severity,
        python_text_origin: None,
    }
}
fn strings(values: &[&str]) -> Value {
    Value::Array(values.iter().map(|v| s(v)).collect())
}
fn array_len(value: &Value) -> usize {
    if let Value::Array(v) = value {
        v.len()
    } else {
        usize::MAX
    }
}
fn array_or_object_len(value: &Value) -> usize {
    match value {
        Value::Array(v) => v.len(),
        Value::Object(v) => v.len(),
        _ => usize::MAX,
    }
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn kstr(text: &str) -> Utf16 {
    Utf16::from(text)
}
fn s(text: &str) -> Value {
    Value::string_utf8(text)
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (kstr(k), v)).collect())
}
fn member<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    if let Value::Object(fields) = value {
        fields
            .iter()
            .find(|(k, _)| k == &kstr(name))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn member_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    if let Value::Object(fields) = value {
        fields
            .iter_mut()
            .find(|(k, _)| k == &kstr(name))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn as_string(value: &Value) -> Option<&Utf16> {
    if let Value::String(v) = value {
        Some(v)
    } else {
        None
    }
}
fn number_usize(value: &Value) -> Option<usize> {
    let Value::Number(value) = value else {
        return None;
    };
    if !value.is_finite() || *value < 0.0 || value.fract() != 0.0 || *value > usize::MAX as f64 {
        return None;
    }
    Some(*value as usize)
}
struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &crate::engine::SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

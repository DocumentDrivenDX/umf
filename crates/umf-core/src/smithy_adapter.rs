// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned admission and result construction for the pinned Smithy host.
//! The Smithy JavaScript/TeaVM runtime performs only native assembly/selection.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    native_json::NativeJsonTree,
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const EXT: &str = "umf.smithy";
const VERSION: &str = "0.1.0";
const CORE: &str = "0.10.0";
const BACKEND: &str = "smithy-model@1.73.0/teavm@0.15.0/umf-compat-v1";
const ASSEMBLY_NORMALIZATION_LIMITATION: &str = "Native assembly normalizes models and may serialize mixin overrides as explicit apply entries. Retained source preserves formatting and provenance.";

pub struct PreparedAssembly {
    document: Value,
    id: Utf16,
    compiler: Utf16,
    inputs: Value,
}
pub struct PreparedSelection {
    assembly: Value,
    selector: Utf16,
}

pub struct SmithyRuntime {
    engine: Engine,
    registry: Registry,
    assembly_schema: CompiledSchema,
    selection_schema: CompiledSchema,
    assembly_result_schema: CompiledSchema,
    selection_result_schema: CompiledSchema,
    native_structure_schema: CompiledSchema,
}

impl SmithyRuntime {
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
        let mut resources = engine.schema_resources_with_context(ctx)?;
        let package = json(
            include_str!("../../../spec/extensions/smithy/package.json"),
            ctx,
        )?;
        let mut registry = Registry::new();
        registry.register(&package, None, engine.package_schema(), &resources, ctx)?;
        let assembly_schema = compile_schema(
            include_str!("../../../spec/extensions/smithy/native-assembly.schema.json"),
            &resources,
            ctx,
        )?;
        let assembly_result_resource = json(
            include_str!("../../../spec/extensions/smithy/assembly-result.schema.json"),
            ctx,
        )?;
        resources.entries.push((
            Utf16::from("urn:umf:smithy:assembly-result:0.1.0"),
            copy_json(&assembly_result_resource, ctx)?,
        ));
        let selection_schema = compile_schema(
            include_str!("../../../spec/extensions/smithy/native-selection.schema.json"),
            &resources,
            ctx,
        )?;
        let assembly_result_schema = compile_schema(
            include_str!("../../../spec/extensions/smithy/assembly-result.schema.json"),
            &resources,
            ctx,
        )?;
        let selection_result_schema = compile_schema(
            include_str!("../../../spec/extensions/smithy/selection-result.schema.json"),
            &resources,
            ctx,
        )?;
        let native_structure_schema = compile_schema(
            include_str!("../../../spec/extensions/smithy/native-structure.schema.json"),
            &resources,
            ctx,
        )?;
        Ok(Self {
            engine,
            registry,
            assembly_schema,
            selection_schema,
            assembly_result_schema,
            selection_result_schema,
            native_structure_schema,
        })
    }

    pub fn inspect(
        &self,
        document: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Validation, EngineError> {
        let mut validation =
            self.engine
                .validate_document(document, &self.registry, &mut NoCapabilities, ctx)?;
        let payload = match smithy_payload(document, ctx) {
            Ok(value) => value,
            Err(error) if error.is_control_failure() => return Err(error),
            Err(_) => return Ok(validation),
        };
        let mut extras = Vec::new();
        let profile = member(&payload, "profile").and_then(text);
        if let Some(fields) = object_fields(&payload) {
            for (key, _) in fields {
                if !["profile", "root", "dependencies", "files"]
                    .iter()
                    .any(|known| key == &Utf16::from(*known))
                {
                    extras.push(diagnostic(
                        "SMITHY_REPRESENTATION",
                        &pointer_child(&Utf16::default(), key, ctx)?,
                        "Unknown Smithy payload field is retained",
                        Severity::Warning,
                    ));
                }
            }
        }
        if profile == Some(Utf16::from("smithy-idl-sources")) {
            if let Some(files) = member(&payload, "files").and_then(object_fields) {
                for (path, value) in files {
                    if !valid_source_path(path) {
                        extras.push(diagnostic("SMITHY_SOURCE_PATH", &pointer_child(&Utf16::from("/files"), path, ctx)?, "Source filenames must be relative .smithy/.json paths without traversal", Severity::Error));
                    }
                    if !matches!(value, Value::String(_)) {
                        extras.push(diagnostic(
                            "SMITHY_SOURCES",
                            &pointer_child(&Utf16::from("/files"), path, ctx)?,
                            "Source values must be strings",
                            Severity::Error,
                        ));
                    }
                }
            }
            extras.push(diagnostic(
                "SMITHY_SOURCE_UNVALIDATED",
                &Utf16::from("/files"),
                "Source text is retained without parsing or assembly",
                Severity::Warning,
            ));
        } else if profile == Some(Utf16::from("smithy-json-ast")) {
            for (name, path) in [("root", "/root")] {
                if let Some(value) = member(&payload, name) {
                    inspect_native(
                        value,
                        &Utf16::from(path),
                        &self.native_structure_schema,
                        &mut extras,
                        ctx,
                    )?;
                    inspect_known_ast_warnings(value, &Utf16::from(path), &mut extras, ctx)?;
                }
            }
            if let Some(Value::Array(dependencies)) = member(&payload, "dependencies") {
                let mut ids = std::collections::BTreeSet::new();
                for (index, dependency) in dependencies.iter().enumerate() {
                    if let Some(fields) = object_fields(dependency) {
                        for (key, _) in fields {
                            if key != &Utf16::from("id") && key != &Utf16::from("root") {
                                extras.push(diagnostic(
                                    "SMITHY_REPRESENTATION",
                                    &pointer_child(
                                        &Utf16::from(format!("/dependencies/{index}")),
                                        key,
                                        ctx,
                                    )?,
                                    "Unknown dependency representation field is retained",
                                    Severity::Warning,
                                ));
                            }
                        }
                    }
                    if let Some(id) = member(dependency, "id").and_then(text) {
                        if !ids.insert(id) {
                            extras.push(diagnostic(
                                "SMITHY_DEPENDENCY_ID",
                                &Utf16::from(format!("/dependencies/{index}/id")),
                                "Duplicate dependency ID",
                                Severity::Error,
                            ));
                        }
                    }
                    if let Some(root) = member(dependency, "root") {
                        inspect_native(
                            root,
                            &Utf16::from(format!("/dependencies/{index}/root")),
                            &self.native_structure_schema,
                            &mut extras,
                            ctx,
                        )?;
                        inspect_known_ast_warnings(
                            root,
                            &Utf16::from(format!("/dependencies/{index}/root")),
                            &mut extras,
                            ctx,
                        )?;
                    }
                }
            }
            extras.push(diagnostic(
                "SMITHY_ASSEMBLY_REQUIRED",
                &Utf16::from("/root"),
                "Smithy semantics require the separately supplied native model runtime",
                Severity::Warning,
            ));
        }
        validation.valid &= !extras.iter().any(|d| d.severity == Severity::Error);
        validation.complete = false;
        validation.diagnostics.extend(extras);
        Ok(validation)
    }

    pub fn inspect_payload(
        &self,
        payload: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let payload = copy_json(payload, ctx)?;
        let document = document_from_payload(&Utf16::from("smithy-inspector"), payload);
        let validation = self.inspect(&document, ctx)?;
        let projected = validation_value(&validation, ctx)?;
        let diagnostics = member(&projected, "diagnostics")
            .and_then(array)
            .ok_or_else(|| err("SMITHY_INSPECTOR", "Diagnostics missing"))?;
        let mut semantic = Vec::new();
        for diagnostic in diagnostics {
            ctx.charge_work(1, Utf16::default())?;
            let Some(Value::String(code)) = member(diagnostic, "code") else {
                continue;
            };
            ctx.charge_text(code.len(), Utf16::default())?;
            if code
                .to_utf8()
                .ok()
                .is_some_and(|code| code.starts_with("SMITHY_"))
            {
                semantic.push(copy_json(diagnostic, ctx)?);
            }
        }
        Ok(Value::Array(semantic))
    }

    pub fn import_json(
        &self,
        source: &Value,
        id: &Value,
        dependencies: Option<&Value>,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let id = text_copy(id, ctx)?
            .filter(|v| !v.is_empty())
            .ok_or_else(|| err("SMITHY_IMPORT_OPTIONS", "Document ID is required"))?;
        let root = NativeJsonTree::parse_json(
            &text_copy(source, ctx)?
                .ok_or_else(|| err("SMITHY_JSON", "Schema source must be text"))?
                .units(),
            ctx,
        )?
        .tagged_value_preserving_extras(ctx)?;
        let mut deps = Vec::new();
        if let Some(Value::Array(values)) = dependencies {
            let mut ids = std::collections::BTreeSet::new();
            for (index, dependency) in values.iter().enumerate() {
                if object_fields(dependency).is_none_or(|fields| {
                    fields
                        .iter()
                        .any(|(key, _)| key != &Utf16::from("id") && key != &Utf16::from("schema"))
                }) {
                    return Err(err(
                        "SMITHY_DEPENDENCY",
                        "Dependency input accepts only id and schema",
                    ));
                }
                let dep_id = text_copy(
                    member(dependency, "id")
                        .ok_or_else(|| err("SMITHY_DEPENDENCY_ID", "Dependency ID is required"))?,
                    ctx,
                )?
                .filter(|v| !v.is_empty())
                .ok_or_else(|| {
                    err(
                        "SMITHY_DEPENDENCY_ID",
                        "Dependency ID must be nonempty text",
                    )
                })?;
                if !ids.insert(dep_id.clone()) {
                    return Err(err("SMITHY_DEPENDENCY_ID", "Dependency IDs must be unique"));
                }
                let source = text_copy(
                    member(dependency, "schema").ok_or_else(|| {
                        err("SMITHY_DEPENDENCY_SCHEMA", "Dependency schema is required")
                    })?,
                    ctx,
                )?
                .ok_or_else(|| err("SMITHY_DEPENDENCY_SCHEMA", "Dependency schema must be text"))?;
                let root = NativeJsonTree::parse_json(source.units(), ctx)?
                    .tagged_value_preserving_extras(ctx)?;
                ctx.charge_work(index.saturating_add(1), Utf16::default())?;
                deps.push(object(vec![("id", Value::String(dep_id)), ("root", root)]));
            }
        } else if dependencies.is_some() {
            return Err(err("SMITHY_DEPENDENCIES", "Dependencies must be an array"));
        }
        let mut payload = vec![("profile", s("smithy-json-ast")), ("root", root)];
        if dependencies.is_some() {
            payload.push(("dependencies", Value::Array(deps)));
        }
        let document = document_from_payload(&id, object(payload));
        let checked = self.inspect(&document, ctx)?;
        if !checked.valid {
            return Err(validation_error("SMITHY_DOCUMENT", checked));
        }
        Ok(document)
    }

    pub fn import_sources(
        &self,
        files: &Value,
        id: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let id = text_copy(id, ctx)?
            .filter(|v| !v.is_empty())
            .ok_or_else(|| err("SMITHY_IMPORT_OPTIONS", "Document ID is required"))?;
        let source_files = object_fields(files)
            .ok_or_else(|| err("SMITHY_SOURCES", "Source files must be an object"))?;
        validate_source_files(source_files, ctx)?;
        let document = document_from_payload(
            &id,
            object(vec![
                ("profile", s("smithy-idl-sources")),
                ("files", copy_json(files, ctx)?),
            ]),
        );
        let checked = self.inspect(&document, ctx)?;
        if !checked.valid {
            return Err(validation_error("SMITHY_DOCUMENT", checked));
        }
        Ok(document)
    }

    pub fn export(
        &self,
        document: &Value,
        expected_profile: &str,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let validation = self.inspect(document, ctx)?;
        if !validation.valid {
            return Err(validation_error("SMITHY_DOCUMENT", validation));
        }
        let payload = smithy_payload(document, ctx)?;
        let profile = member(&payload, "profile")
            .and_then(text)
            .ok_or_else(|| err("SMITHY_PROFILE", "Missing Smithy profile"))?;
        if profile != Utf16::from(expected_profile) {
            return Err(err(
                "SMITHY_PROFILE",
                "Operation does not match the Smithy document profile",
            ));
        }
        reject_unknown_payload_fields(&payload)?;
        if profile == Utf16::from("smithy-json-ast") {
            let root = NativeJsonTree::from_tagged_value(
                member(&payload, "root").ok_or_else(|| err("SMITHY_AST", "Root AST missing"))?,
                ctx,
            )?;
            if root.has_representation_extras() {
                return Err(err(
                    "SMITHY_REPRESENTATION",
                    "Unknown tagged representation cannot be exported",
                ));
            }
            if array(member(&payload, "dependencies").unwrap_or(&Value::Null))
                .is_some_and(|v| !v.is_empty())
            {
                return Err(err(
                    "SMITHY_DEPENDENCIES_REQUIRED",
                    "Use exportBundle to retain supplied dependencies",
                ));
            }
            return Ok(Value::String(append_newline(
                root.render_compact(ctx)?,
                ctx,
            )?));
        }
        if profile == Utf16::from("smithy-idl-sources") {
            let files = member(&payload, "files")
                .ok_or_else(|| err("SMITHY_SOURCES", "Source files missing"))?;
            validate_source_files(
                object_fields(files)
                    .ok_or_else(|| err("SMITHY_SOURCES", "Source files must be an object"))?,
                ctx,
            )?;
            return Ok(object(vec![("files", copy_json(files, ctx)?)]));
        }
        Err(err("SMITHY_PROFILE", "Unsupported Smithy profile"))
    }

    pub fn export_bundle(
        &self,
        document: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let validation = self.inspect(document, ctx)?;
        if !validation.valid {
            return Err(validation_error("SMITHY_DOCUMENT", validation));
        }
        let payload = smithy_payload(document, ctx)?;
        let profile = member(&payload, "profile")
            .and_then(text)
            .ok_or_else(|| err("SMITHY_PROFILE", "Missing Smithy profile"))?;
        if profile != Utf16::from("smithy-json-ast") {
            return Err(err(
                "SMITHY_PROFILE",
                "Smithy bundle export requires the JSON AST profile",
            ));
        }
        reject_unknown_payload_fields(&payload)?;
        let schema = if profile == Utf16::from("smithy-json-ast") {
            let root = NativeJsonTree::from_tagged_value(
                member(&payload, "root").ok_or_else(|| err("SMITHY_AST", "Root AST missing"))?,
                ctx,
            )?;
            if root.has_representation_extras() {
                return Err(err(
                    "SMITHY_REPRESENTATION",
                    "Unknown tagged representation cannot be exported",
                ));
            }
            Value::String(append_newline(root.render_compact(ctx)?, ctx)?)
        } else {
            Value::Null
        };
        let mut dependencies = Vec::new();
        if profile == Utf16::from("smithy-json-ast") {
            if let Some(Value::Array(items)) = member(&payload, "dependencies") {
                for item in items {
                    let root = NativeJsonTree::from_tagged_value(
                        member(item, "root")
                            .ok_or_else(|| err("SMITHY_DEPENDENCIES", "Dependency root missing"))?,
                        ctx,
                    )?;
                    if root.has_representation_extras() {
                        return Err(err(
                            "SMITHY_REPRESENTATION",
                            "Unknown dependency representation cannot be exported",
                        ));
                    }
                    dependencies.push(object(vec![
                        (
                            "id",
                            copy_json(
                                member(item, "id").ok_or_else(|| {
                                    err("SMITHY_DEPENDENCY_ID", "Dependency ID missing")
                                })?,
                                ctx,
                            )?,
                        ),
                        (
                            "schema",
                            Value::String(append_newline(root.render_compact(ctx)?, ctx)?),
                        ),
                    ]));
                }
            }
        }
        Ok(object(vec![
            ("schema", schema),
            ("dependencies", Value::Array(dependencies)),
            ("source", copy_json(document, ctx)?),
            ("diagnostics", validation_value(&validation, ctx)?),
        ]))
    }

    pub fn get_node(
        &self,
        document: &Value,
        path: &Value,
        dependency_id: Option<&Value>,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let validation = self.inspect(document, ctx)?;
        if !validation.valid {
            return Err(validation_error("SMITHY_DOCUMENT", validation));
        }
        let payload = smithy_payload(document, ctx)?;
        let pointer = text_copy(path, ctx)?
            .ok_or_else(|| err("JSON_SCHEMA_POINTER", "Pointer must be text"))?;
        let target = if let Some(dep_id) = dependency_id {
            let dep_id = text_copy(dep_id, ctx)?
                .ok_or_else(|| err("SMITHY_DEPENDENCY_ID", "Dependency ID must be text"))?;
            let dependencies = array(member(&payload, "dependencies").unwrap_or(&Value::Null))
                .ok_or_else(|| err("SMITHY_DEPENDENCY_ID", "Unknown dependency ID"))?;
            dependencies
                .iter()
                .find(|d| member(d, "id") == Some(&Value::String(dep_id.clone())))
                .and_then(|d| member(d, "root"))
                .ok_or_else(|| err("SMITHY_DEPENDENCY_ID", "Unknown dependency ID"))?
        } else {
            member(&payload, "root").ok_or_else(|| err("SMITHY_AST", "Root missing"))?
        };
        let tree = NativeJsonTree::from_tagged_value(target, ctx)?;
        tree.subtree_clone(&pointer, ctx)?
            .tagged_value_preserving_extras(ctx)
    }

    pub fn edit_node(
        &self,
        document: &Value,
        path: &Value,
        replacement: &Value,
        dependency_id: Option<&Value>,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let validation = self.inspect(document, ctx)?;
        if !validation.valid {
            return Err(validation_error("SMITHY_DOCUMENT", validation));
        }
        let pointer = text_copy(path, ctx)?
            .ok_or_else(|| err("JSON_SCHEMA_POINTER", "Pointer must be text"))?;
        let replacement = text_copy(replacement, ctx)?
            .ok_or_else(|| err("JSON_SCHEMA_SYNTAX", "Replacement must be JSON text"))?;
        let replacement = NativeJsonTree::parse_json(replacement.units(), ctx)?;
        let mut candidate = copy_json(document, ctx)?;
        let payload = smithy_payload_mut(&mut candidate)?;
        let target = if let Some(dep_id) = dependency_id {
            let dep_id = text_copy(dep_id, ctx)?
                .ok_or_else(|| err("SMITHY_DEPENDENCY_ID", "Dependency ID must be text"))?;
            let deps = member_mut(payload, "dependencies")
                .and_then(array_mut)
                .ok_or_else(|| err("SMITHY_DEPENDENCY_ID", "Unknown dependency ID"))?;
            deps.iter_mut()
                .find(|dep| member(dep, "id") == Some(&Value::String(dep_id.clone())))
                .and_then(|dep| member_mut(dep, "root"))
                .ok_or_else(|| err("SMITHY_DEPENDENCY_ID", "Unknown dependency ID"))?
        } else {
            member_mut(payload, "root").ok_or_else(|| err("SMITHY_AST", "Root missing"))?
        };
        let tree = NativeJsonTree::from_tagged_value(target, ctx)?;
        let edited = tree.replace_node(&pointer, &replacement, ctx)?;
        *target = edited.tagged_value_preserving_extras(ctx)?;
        let validation = self.inspect(&candidate, ctx)?;
        if !validation.valid {
            return Err(validation_error("SMITHY_DOCUMENT", validation));
        }
        Ok(object(vec![
            ("document", candidate),
            ("validation", validation_value(&validation, ctx)?),
        ]))
    }

    pub fn edit_source(
        &self,
        document: &Value,
        path: &Value,
        source: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let validation = self.inspect(document, ctx)?;
        if !validation.valid {
            return Err(validation_error("SMITHY_DOCUMENT", validation));
        }
        let path =
            text_copy(path, ctx)?.ok_or_else(|| err("SMITHY_SOURCE_EDIT", "Path must be text"))?;
        let source = text_copy(source, ctx)?
            .ok_or_else(|| err("SMITHY_SOURCE_EDIT", "Source must be text"))?;
        if !valid_source_path(&path) {
            return Err(err("SMITHY_SOURCE_PATH", "Source path is not admitted"));
        }
        let mut candidate = copy_json(document, ctx)?;
        let payload = smithy_payload_mut(&mut candidate)?;
        let files = member_mut(payload, "files")
            .and_then(object_fields_mut)
            .ok_or_else(|| err("SMITHY_PROFILE", "Document does not contain source files"))?;
        let target = files
            .iter_mut()
            .find(|(key, _)| key == &path)
            .map(|(_, value)| value)
            .ok_or_else(|| {
                err(
                    "SMITHY_SOURCE_EDIT",
                    "Source edit must replace an existing file",
                )
            })?;
        *target = Value::String(source);
        let validation = self.inspect(&candidate, ctx)?;
        Ok(object(vec![
            ("document", candidate),
            ("validation", validation_value(&validation, ctx)?),
        ]))
    }

    /// Admits the complete source document and prepares the only files the host may see.
    pub fn prepare_assembly(
        &self,
        document: &Value,
        id: &Value,
        compiler: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<(PreparedAssembly, Value), EngineError> {
        let admitted = copy_json(document, ctx)?;
        let validation = self.inspect(&admitted, ctx)?;
        if !validation.valid {
            return Err(validation_error("SMITHY_DOCUMENT", validation));
        }
        let id = text_copy(id, ctx)?
            .filter(|s| !s.is_empty())
            .ok_or_else(|| err("SMITHY_ASSEMBLY_OPTIONS", "Output document ID is required"))?;
        let compiler = text_copy(compiler, ctx)?
            .filter(|s| !s.is_empty())
            .ok_or_else(|| err("SMITHY_ASSEMBLY_OPTIONS", "Backend identity is required"))?;
        if compiler != Utf16::from(BACKEND) {
            return Err(err(
                "SMITHY_BACKEND",
                "Only the pinned Smithy 1.73.0 compatibility runtime is admitted",
            ));
        }
        let payload = smithy_payload(&admitted, ctx)?;
        reject_unknown_payload_fields(&payload)?;
        let profile = text(
            member(&payload, "profile")
                .ok_or_else(|| err("SMITHY_PROFILE", "Profile is required"))?,
        )
        .ok_or_else(|| err("SMITHY_PROFILE", "Profile must be text"))?;
        let mut files = Vec::new();
        let mut inputs = Vec::new();
        if profile == Utf16::from("smithy-idl-sources") {
            let source_files = member(&payload, "files")
                .and_then(object_fields)
                .ok_or_else(|| err("SMITHY_SOURCES", "Source files must be an object"))?;
            let mut paths = std::collections::BTreeSet::new();
            for (path, value) in source_files {
                if !paths.insert(path) {
                    return Err(err(
                        "SMITHY_SOURCE_PATH",
                        "Duplicate source filename members cannot be represented in the host file map",
                    ));
                }
                let source = text_copy(value, ctx)?
                    .ok_or_else(|| err("SMITHY_SOURCES", "Source values must be strings"))?;
                if !valid_source_path(path) {
                    return Err(err(
                        "SMITHY_SOURCE_PATH",
                        "Source filenames must be relative .smithy/.json paths without traversal",
                    ));
                }
                ctx.charge_work(path.len().saturating_add(source.len()), Utf16::default())?;
                files.push((path.clone(), Value::String(source)));
                inputs.push(object(vec![("file", Value::String(path.clone()))]));
            }
            if files.is_empty() {
                return Err(err(
                    "SMITHY_SOURCES",
                    "At least one source file is required",
                ));
            }
        } else if profile == Utf16::from("smithy-json-ast") {
            let root = member(&payload, "root")
                .ok_or_else(|| err("SMITHY_AST", "Root AST is required"))?;
            let root = NativeJsonTree::from_tagged_value(root, ctx)?;
            if root.has_representation_extras() {
                return Err(err(
                    "SMITHY_REPRESENTATION",
                    "Unknown tagged representation cannot be assembled",
                ));
            }
            files.push((
                Utf16::from("root.json"),
                Value::String(root.render_compact(ctx)?),
            ));
            inputs.push(object(vec![("file", s("root.json"))]));
            if let Some(deps) = member(&payload, "dependencies") {
                let Value::Array(deps) = deps else {
                    return Err(err("SMITHY_DEPENDENCIES", "Dependencies must be an array"));
                };
                let mut seen = std::collections::BTreeSet::new();
                for (index, dep) in deps.iter().enumerate() {
                    let dep_id = match member(dep, "id") {
                        Some(v) => text_copy(v, ctx)?,
                        None => None,
                    }
                    .filter(|x| !x.is_empty())
                    .ok_or_else(|| {
                        err("SMITHY_DEPENDENCY_ID", "Dependency IDs must be nonempty")
                    })?;
                    if !seen.insert(dep_id.clone()) {
                        return Err(err("SMITHY_DEPENDENCY_ID", "Dependency IDs must be unique"));
                    }
                    let root = member(dep, "root")
                        .ok_or_else(|| err("SMITHY_DEPENDENCIES", "Dependency root is required"))?;
                    let root = NativeJsonTree::from_tagged_value(root, ctx)?;
                    if root.has_representation_extras() {
                        return Err(err(
                            "SMITHY_REPRESENTATION",
                            "Unknown dependency representation cannot be assembled",
                        ));
                    }
                    let filename = Utf16::from(format!("dependency-{index}.json"));
                    files.push((filename.clone(), Value::String(root.render_compact(ctx)?)));
                    inputs.push(object(vec![
                        ("file", Value::String(filename)),
                        ("dependencyId", Value::String(dep_id)),
                    ]));
                }
            }
        } else {
            return Err(err(
                "SMITHY_PROFILE",
                "Expected Smithy AST or source profile",
            ));
        }
        let files = Value::Object(files);
        let request = object(vec![
            ("profile", s("umf.smithy-host/1")),
            ("operation", s("assemble")),
            ("identity", Value::String(compiler.clone())),
            ("files", copy_json(&files, ctx)?),
        ]);
        ctx.charge_work(1, Utf16::default())?;
        Ok((
            PreparedAssembly {
                document: admitted,
                id,
                compiler,
                inputs: Value::Array(inputs),
            },
            request,
        ))
    }

    /// Validate pinned native bridge output and construct the public result in Rust.
    pub fn complete_assembly(
        &self,
        state: PreparedAssembly,
        response: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let compiler =
            text_copy(&Value::String(state.compiler.clone()), ctx)?.unwrap_or_else(Utf16::default);
        let source = copy_json(&state.document, ctx)?;
        let inputs = copy_json(&state.inputs, ctx)?;
        let admitted_events = match self.assembly_schema.validate(response, ctx) {
            Ok(errors) if errors.is_empty() => member(response, "events")
                .map(|events| copy_json(events, ctx))
                .transpose()?
                .unwrap_or(Value::Array(Vec::new())),
            Ok(_) => Value::Array(Vec::new()),
            Err(error) if error.is_control_failure() => return Err(error),
            Err(_) => Value::Array(Vec::new()),
        };
        match self.complete_assembly_inner(state, response, ctx) {
            Ok(value) => Ok(value),
            Err(error) if !error.is_control_failure() => {
                self.blocked_assembly(compiler, source, inputs, admitted_events, error, ctx)
            }
            Err(error) => Err(error),
        }
    }

    fn complete_assembly_inner(
        &self,
        state: PreparedAssembly,
        response: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let response = copy_json(response, ctx)?;
        let errors = self.assembly_schema.validate(&response, ctx)?;
        if !errors.is_empty() {
            return Err(err(
                "SMITHY_HOST_RESPONSE",
                "Native assembly response does not match its pinned schema",
            ));
        }
        let valid = matches!(member(&response, "valid"), Some(Value::Bool(true)));
        let events = copy_json(member(&response, "events").unwrap(), ctx)?;
        let has_error = array_contains_severity(&events, "ERROR");
        if valid && has_error {
            return Err(err(
                "SMITHY_HOST_RESPONSE",
                "Assembler reported success with ERROR events",
            ));
        }
        let mut result = vec![
            ("status", s(if valid { "assembled" } else { "blocked" })),
            ("compiler", Value::String(state.compiler)),
            ("source", state.document),
            ("inputs", state.inputs),
            ("events", events),
            ("issues", Value::Array(Vec::new())),
            ("complete", Value::Bool(false)),
            (
                "limitations",
                strings(&[
                    "Pinned Smithy 1.73.0 runtime only; generic-superclass reflection remains unsupported",
                    ASSEMBLY_NORMALIZATION_LIMITATION,
                    "This operation does not establish protocol execution or cross-system projection equivalence",
                ]),
            ),
        ];
        if valid {
            let native_model = text_copy(member(&response, "modelJson").unwrap(), ctx)?
                .ok_or_else(|| err("SMITHY_HOST_RESPONSE", "modelJson must be text"))?;
            let tree = NativeJsonTree::parse_json(native_model.units(), ctx)?;
            let tagged = tree.tagged_value_preserving_extras(ctx)?;
            let model = document_from_tagged(&state.id, tagged)?;
            let validation = self.inspect(&model, ctx)?;
            if !validation.valid {
                return Err(validation_error("SMITHY_ASSEMBLED_MODEL", validation));
            }
            result.push(("model", model));
            result.push(("nativeModel", Value::String(native_model)));
        }
        let value = object(result);
        validate_response(&self.assembly_result_schema, &value, "SMITHY_RESULT", ctx)?;
        Ok(value)
    }

    fn blocked_assembly(
        &self,
        compiler: Utf16,
        source: Value,
        inputs: Value,
        events: Value,
        error: EngineError,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let issue = object(vec![
            ("code", Value::String(Utf16::from(error.code.as_str()))),
            ("path", Value::String(error.path)),
            ("severity", s("error")),
            ("message", Value::String(error.message)),
        ]);
        let result = object(vec![
            ("status", s("blocked")),
            ("compiler", Value::String(compiler)),
            ("source", source),
            ("inputs", inputs),
            ("events", events),
            ("issues", Value::Array(vec![issue])),
            ("complete", Value::Bool(false)),
            (
                "limitations",
                strings(&[
                    "Native assembly response or assembled model could not be admitted",
                    ASSEMBLY_NORMALIZATION_LIMITATION,
                    "Assembly success does not establish protocol behavior or cross-system equivalence",
                ]),
            ),
        ]);
        validate_response(&self.assembly_result_schema, &result, "SMITHY_RESULT", ctx)?;
        Ok(result)
    }

    pub fn fail_assembly(
        &self,
        state: PreparedAssembly,
        code: &Value,
        message: Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let compiler = state.compiler;
        let source = state.document;
        let inputs = state.inputs;
        let code = failure_code(
            code,
            "SMITHY_ASSEMBLY_FAILED",
            "SMITHY_ASSEMBLY_CANCELLED",
            "SMITHY_ASSEMBLY_TIMEOUT",
        )?;
        self.blocked_assembly(
            compiler,
            source,
            inputs,
            Value::Array(Vec::new()),
            EngineError::new(code, Utf16::default(), message),
            ctx,
        )
    }

    pub fn prepare_selection(
        &self,
        assembly_result: &Value,
        selector: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<(PreparedSelection, Value), EngineError> {
        if member(assembly_result, "status") != Some(&s("assembled")) {
            return Err(err(
                "SMITHY_ASSEMBLY_REQUIRED",
                "Selection requires a successful native assembly result",
            ));
        }
        let assembly = copy_json(assembly_result, ctx)?;
        let native_model = text_copy(
            member(assembly_result, "nativeModel").ok_or_else(|| {
                err(
                    "SMITHY_ASSEMBLY_REQUIRED",
                    "Successful assembly has no native model",
                )
            })?,
            ctx,
        )?
        .ok_or_else(|| err("SMITHY_SELECTION", "Assembled native model is required"))?;
        let selector = text_copy(selector, ctx)?
            .filter(|v| !v.is_empty())
            .ok_or_else(|| err("SMITHY_SELECTION_OPTIONS", "Selector must be nonempty text"))?;
        if selector.len() > ctx.limits().max_text_units {
            return Err(err("LIMIT", "Selector exceeds text limit"));
        }
        let state = PreparedSelection {
            assembly,
            selector: selector.clone(),
        };
        let request = object(vec![
            ("profile", s("umf.smithy-host/1")),
            ("operation", s("select")),
            ("identity", s(BACKEND)),
            ("modelJson", Value::String(native_model)),
            ("selector", Value::String(selector)),
        ]);
        ctx.charge_work(1, Utf16::default())?;
        Ok((state, request))
    }

    pub fn blocked_selection_for_assembly(
        &self,
        assembly: &Value,
        selector: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        if member(assembly, "status") != Some(&s("blocked")) {
            return Err(err(
                "SMITHY_ASSEMBLY_REQUIRED",
                "Only a blocked assembly can produce a blocked selection result",
            ));
        }
        let selector = text_copy(selector, ctx)?
            .filter(|s| !s.is_empty())
            .ok_or_else(|| err("SMITHY_SELECTION_OPTIONS", "Selector must be nonempty text"))?;
        let result = object(vec![
            ("status", s("blocked")),
            ("selector", Value::String(selector)),
            ("assembly", copy_json(assembly, ctx)?),
            ("issues", Value::Array(Vec::new())),
            ("complete", Value::Bool(false)),
        ]);
        validate_response(
            &self.selection_result_schema,
            &result,
            "SMITHY_SELECTION_RESULT",
            ctx,
        )?;
        Ok(result)
    }

    pub fn complete_selection(
        &self,
        state: PreparedSelection,
        response: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let assembly = copy_json(&state.assembly, ctx)?;
        let selector =
            text_copy(&Value::String(state.selector.clone()), ctx)?.unwrap_or_else(Utf16::default);
        match self.complete_selection_inner(state, response, ctx) {
            Ok(value) => Ok(value),
            Err(error) if !error.is_control_failure() => {
                self.blocked_selection(assembly, selector, error, ctx)
            }
            Err(error) => Err(error),
        }
    }

    fn complete_selection_inner(
        &self,
        state: PreparedSelection,
        response: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let response = copy_json(response, ctx)?;
        let errors = self.selection_schema.validate(&response, ctx)?;
        if !errors.is_empty() {
            return Err(err(
                "SMITHY_HOST_RESPONSE",
                "Native selector response does not match its pinned schema",
            ));
        }
        let ids = copy_json(member(&response, "shapeIds").unwrap(), ctx)?;
        let mut ids = match ids {
            Value::Array(ids) => ids,
            _ => unreachable!(),
        };
        ids.sort_by(|a, b| text(a).cmp(&text(b)));
        let result = object(vec![
            ("status", s("selected")),
            ("selector", Value::String(state.selector)),
            ("assembly", state.assembly),
            ("shapeIds", Value::Array(ids)),
            ("issues", Value::Array(Vec::new())),
            ("complete", Value::Bool(false)),
        ]);
        validate_response(
            &self.selection_result_schema,
            &result,
            "SMITHY_SELECTION_RESULT",
            ctx,
        )?;
        Ok(result)
    }

    fn blocked_selection(
        &self,
        assembly: Value,
        selector: Utf16,
        error: EngineError,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let issue = object(vec![
            ("code", Value::String(Utf16::from(error.code.as_str()))),
            ("path", Value::String(error.path)),
            ("severity", s("error")),
            ("message", Value::String(error.message)),
        ]);
        let result = object(vec![
            ("status", s("blocked")),
            ("selector", Value::String(selector)),
            ("assembly", assembly),
            ("issues", Value::Array(vec![issue])),
            ("complete", Value::Bool(false)),
        ]);
        validate_response(
            &self.selection_result_schema,
            &result,
            "SMITHY_SELECTION_RESULT",
            ctx,
        )?;
        Ok(result)
    }

    pub fn fail_selection(
        &self,
        state: PreparedSelection,
        code: &Value,
        message: Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let code = failure_code(
            code,
            "SMITHY_SELECTION_FAILED",
            "SMITHY_SELECTION_CANCELLED",
            "SMITHY_SELECTION_TIMEOUT",
        )?;
        self.blocked_selection(
            state.assembly,
            state.selector,
            EngineError::new(code, Utf16::default(), message),
            ctx,
        )
    }
}

fn document_from_tagged(id: &Utf16, root: Value) -> Result<Value, EngineError> {
    Ok(object(vec![
        ("umf", s(CORE)),
        ("id", Value::String(id.clone())),
        (
            "vocabularies",
            object(vec![(EXT, object(vec![("version", s(VERSION))]))]),
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
                        (
                            "extensions",
                            object(vec![(
                                EXT,
                                object(vec![("profile", s("smithy-json-ast")), ("root", root)]),
                            )]),
                        ),
                    ])]),
                ),
            ])]),
        ),
    ]))
}
fn inspect_native(
    tagged: &Value,
    path: &Utf16,
    schema: &CompiledSchema,
    diagnostics: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let tree = NativeJsonTree::from_tagged_value(tagged, ctx)?;
    for extra in tree.representation_extra_paths(path, ctx)? {
        diagnostics.push(Diagnostic {
            code: Utf16::from("SMITHY_REPRESENTATION"),
            path: extra,
            python_source_path: false,
            message: Utf16::from("Unknown tagged-tree content is retained but cannot be exported"),
            severity: Severity::Warning,
            python_text_origin: None,
        });
    }
    let native = tagged_native(tagged, path, ctx)?;
    for error in schema.validate(&native, ctx)? {
        diagnostics.push(Diagnostic {
            code: Utf16::from("SMITHY_STRUCTURE"),
            path: append_path(path, &error.instance_path, ctx)?,
            python_source_path: false,
            message: error.message,
            severity: Severity::Error,
            python_text_origin: None,
        });
    }
    if let Value::Object(fields) = &native {
        for (key, _) in fields {
            if !["smithy", "shapes", "metadata"]
                .iter()
                .any(|known| key == &Utf16::from(*known))
            {
                diagnostics.push(Diagnostic {
                    code: Utf16::from("SMITHY_NATIVE_FIELD"),
                    path: pointer_child(path, key, ctx)?,
                    python_source_path: false,
                    message: Utf16::from("Unknown native Smithy content is retained"),
                    severity: Severity::Warning,
                    python_text_origin: None,
                });
            }
        }
    }
    Ok(())
}
fn inspect_known_ast_warnings(
    tagged: &Value,
    path: &Utf16,
    diagnostics: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let native = tagged_native(tagged, path, ctx)?;
    let Some(fields) = object_fields(&native) else {
        return Ok(());
    };
    if let Some(Value::String(version)) = member(&native, "smithy") {
        if version != &Utf16::from("2") && version != &Utf16::from("2.0") {
            diagnostics.push(diagnostic(
                "SMITHY_VERSION",
                &pointer_child(path, &Utf16::from("smithy"), ctx)?,
                "Uninterpreted Smithy version is retained",
                Severity::Warning,
            ));
        }
    }
    let known_types = [
        "blob",
        "boolean",
        "document",
        "string",
        "byte",
        "short",
        "integer",
        "long",
        "float",
        "double",
        "bigInteger",
        "bigDecimal",
        "timestamp",
        "list",
        "map",
        "structure",
        "union",
        "enum",
        "intEnum",
        "service",
        "resource",
        "operation",
        "apply",
    ];
    if let Some(Value::Object(shapes)) = member(&native, "shapes") {
        for (id, shape) in shapes {
            if let Some(Value::String(kind)) = member(shape, "type") {
                if !known_types.iter().any(|known| kind == &Utf16::from(*known)) {
                    let shape_path =
                        pointer_child(&pointer_child(path, &Utf16::from("shapes"), ctx)?, id, ctx)?;
                    diagnostics.push(diagnostic(
                        "SMITHY_SHAPE_TYPE",
                        &pointer_child(&shape_path, &Utf16::from("type"), ctx)?,
                        "Unknown Smithy shape type is retained",
                        Severity::Warning,
                    ));
                }
            }
        }
    }
    let _ = fields;
    Ok(())
}
fn diagnostic(code: &str, path: &Utf16, message: &str, severity: Severity) -> Diagnostic {
    Diagnostic {
        code: Utf16::from(code),
        path: path.clone(),
        python_source_path: false,
        message: Utf16::from(message),
        severity,
        python_text_origin: None,
    }
}
fn tagged_native(value: &Value, path: &Utf16, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, path.clone())?;
    let kind = member(value, "kind")
        .and_then(text)
        .ok_or_else(|| err("SMITHY_REPRESENTATION", "Tagged native value has no kind"))?;
    match kind.to_utf8().ok().as_deref() {
        Some("null") => Ok(Value::Null),
        Some("boolean") => match member(value, "value") {
            Some(Value::Bool(v)) => Ok(Value::Bool(*v)),
            _ => Err(err(
                "SMITHY_REPRESENTATION",
                "Tagged boolean value is invalid",
            )),
        },
        Some("string") => match member(value, "value") {
            Some(Value::String(v)) => Ok(Value::String(copy_text(v, ctx)?)),
            _ => Err(err(
                "SMITHY_REPRESENTATION",
                "Tagged string value is invalid",
            )),
        },
        Some("number") => {
            // The tagged tree has already admitted the exact JSON number token.
            // Smithy's pinned structure schema imposes no numeric constraints;
            // this finite placeholder is used only to check JSON-kind shape.
            // Export and native assembly continue to consume the original token.
            Ok(Value::Number(0.0))
        }
        Some("array") => {
            let items =
                array(member(value, "items").ok_or_else(|| {
                    err("SMITHY_REPRESENTATION", "Tagged array items are missing")
                })?)
                .ok_or_else(|| {
                    err(
                        "SMITHY_REPRESENTATION",
                        "Tagged array items must be an array",
                    )
                })?;
            ctx.charge_work(items.len(), path.clone())?;
            let mut output = Vec::with_capacity(items.len());
            for (index, item) in items.iter().enumerate() {
                output.push(tagged_native(
                    item,
                    &pointer_child(path, &Utf16::from(index.to_string()), ctx)?,
                    ctx,
                )?);
            }
            Ok(Value::Array(output))
        }
        Some("object") => {
            let members = object_fields(member(value, "members").ok_or_else(|| {
                err("SMITHY_REPRESENTATION", "Tagged object members are missing")
            })?)
            .ok_or_else(|| {
                err(
                    "SMITHY_REPRESENTATION",
                    "Tagged object members must be an object",
                )
            })?;
            ctx.charge_work(members.len(), path.clone())?;
            let mut output = Vec::with_capacity(members.len());
            for (key, item) in members {
                output.push((
                    copy_text(key, ctx)?,
                    tagged_native(item, &pointer_child(path, key, ctx)?, ctx)?,
                ));
            }
            Ok(Value::Object(output))
        }
        _ => Err(err(
            "SMITHY_REPRESENTATION",
            "Tagged native kind is not admitted",
        )),
    }
}
fn pointer_child(path: &Utf16, child: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let mut escaped = Vec::new();
    for unit in child.units() {
        match *unit {
            0x7e => escaped.extend_from_slice(&[0x7e, 0x30]),
            0x2f => escaped.extend_from_slice(&[0x7e, 0x31]),
            other => escaped.push(other),
        }
    }
    let size = path.len().saturating_add(1).saturating_add(escaped.len());
    ctx.charge_text(size, Utf16::default())?;
    let mut output = Vec::with_capacity(size);
    output.extend_from_slice(path.units());
    output.push(0x2f);
    output.extend(escaped);
    Ok(Utf16::new(output))
}
fn append_path(
    prefix: &Utf16,
    suffix: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    if prefix.is_empty() {
        return copy_text(suffix, ctx);
    }
    if suffix.is_empty() {
        return copy_text(prefix, ctx);
    }
    let size = prefix.len().saturating_add(suffix.len());
    ctx.charge_text(size, Utf16::default())?;
    let mut output = Vec::with_capacity(size);
    output.extend_from_slice(prefix.units());
    output.extend_from_slice(suffix.units());
    Ok(Utf16::new(output))
}
fn document_from_payload(id: &Utf16, payload: Value) -> Value {
    object(vec![
        ("umf", s(CORE)),
        ("id", Value::String(id.clone())),
        (
            "vocabularies",
            object(vec![(EXT, object(vec![("version", s(VERSION))]))]),
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
                        ("extensions", object(vec![(EXT, payload)])),
                    ])]),
                ),
            ])]),
        ),
    ])
}
fn smithy_payload_mut(document: &mut Value) -> Result<&mut Value, EngineError> {
    let modules = member_mut(document, "modules")
        .and_then(array_mut)
        .ok_or_else(|| err("SMITHY_DOCUMENT", "Modules missing"))?;
    let module = modules
        .iter_mut()
        .find(|value| member(value, "id") == Some(&s("schema")))
        .ok_or_else(|| err("SMITHY_DOCUMENT", "Schema module missing"))?;
    let elements = member_mut(module, "elements")
        .and_then(array_mut)
        .ok_or_else(|| err("SMITHY_DOCUMENT", "Schema elements missing"))?;
    let element = elements
        .iter_mut()
        .find(|value| member(value, "id") == Some(&s("schema")))
        .ok_or_else(|| err("SMITHY_DOCUMENT", "Schema element missing"))?;
    member_mut(element, "extensions")
        .and_then(|value| member_mut(value, EXT))
        .ok_or_else(|| err("SMITHY_PAYLOAD", "Smithy payload missing"))
}
fn validate_source_files(
    files: &[(Utf16, Value)],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut paths = std::collections::BTreeSet::new();
    let mut size = 0usize;
    for (path, content) in files {
        if !paths.insert(path) {
            return Err(err(
                "SMITHY_SOURCE_PATH",
                "Duplicate filename members cannot be represented losslessly",
            ));
        }
        if !valid_source_path(path) {
            return Err(err(
                "SMITHY_SOURCE_PATH",
                "Source filename is not an admitted relative .smithy/.json path",
            ));
        }
        let content = text_copy(content, ctx)?
            .ok_or_else(|| err("SMITHY_SOURCES", "Source values must be strings"))?;
        size = size.saturating_add(content.len());
        if size > ctx.limits().max_text_units {
            return Err(err("LIMIT", "Smithy source bundle exceeds text limit"));
        }
    }
    if files.is_empty() {
        return Err(err(
            "SMITHY_SOURCES",
            "At least one source file is required",
        ));
    }
    Ok(())
}
fn append_newline(mut value: Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_text(1, Utf16::default())?;
    let mut units = value.into_units();
    units.push(10);
    Ok(Utf16::new(units))
}
pub fn validation_value(
    validation: &Validation,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut diagnostics = Vec::with_capacity(validation.diagnostics.len());
    ctx.charge_work(validation.diagnostics.len(), Utf16::default())?;
    for d in &validation.diagnostics {
        diagnostics.push(object(vec![
            ("code", Value::String(copy_text(&d.code, ctx)?)),
            ("path", Value::String(copy_text(&d.path, ctx)?)),
            ("message", Value::String(copy_text(&d.message, ctx)?)),
            (
                "severity",
                s(match d.severity {
                    Severity::Error => "error",
                    Severity::Warning => "warning",
                }),
            ),
        ]));
    }
    Ok(object(vec![
        ("valid", Value::Bool(validation.valid)),
        ("complete", Value::Bool(validation.complete)),
        ("diagnostics", Value::Array(diagnostics)),
    ]))
}
fn copy_text(value: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_text(value.len(), Utf16::default())?;
    Ok(value.clone())
}
fn smithy_payload(document: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let schema_module = member(document, "modules")
        .and_then(array)
        .and_then(|modules| {
            modules
                .iter()
                .find(|m| member(m, "id") == Some(&s("schema")))
        })
        .ok_or_else(|| err("SMITHY_DOCUMENT", "Schema module missing"))?;
    let schema_element = member(schema_module, "elements")
        .and_then(array)
        .and_then(|elements| {
            elements
                .iter()
                .find(|e| member(e, "id") == Some(&s("schema")))
        })
        .ok_or_else(|| err("SMITHY_DOCUMENT", "Schema element missing"))?;
    let ext = member(schema_element, "extensions")
        .and_then(|e| member(e, EXT))
        .ok_or_else(|| err("SMITHY_PAYLOAD", "Smithy extension payload missing"))?;
    copy_json(ext, ctx)
}
fn reject_unknown_payload_fields(payload: &Value) -> Result<(), EngineError> {
    if let Some(fields) = object_fields(payload) {
        if fields.iter().any(|(k, _)| {
            !["profile", "files", "root", "dependencies"]
                .iter()
                .any(|n| k == &Utf16::from(*n))
        }) {
            return Err(err(
                "SMITHY_REPRESENTATION",
                "Unknown payload fields cannot be assembled losslessly",
            ));
        }
    }
    if let Some(Value::Array(dependencies)) = member(payload, "dependencies") {
        let id = Utf16::from("id");
        let root = Utf16::from("root");
        if dependencies.iter().any(|dependency| {
            object_fields(dependency)
                .is_some_and(|fields| fields.iter().any(|(key, _)| key != &id && key != &root))
        }) {
            return Err(err(
                "SMITHY_REPRESENTATION",
                "Unknown dependency representation cannot be exported",
            ));
        }
    }
    Ok(())
}
fn valid_source_path(path: &Utf16) -> bool {
    let Ok(path) = path.to_utf8() else {
        return false;
    };
    let segments = path.split('/').collect::<Vec<_>>();
    !path.starts_with('/')
        && segments.iter().all(|segment| {
            !segment.is_empty()
                && *segment != "."
                && *segment != ".."
                && segment
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
        })
        && segments.last().is_some_and(|file| {
            file.strip_suffix(".smithy")
                .or_else(|| file.strip_suffix(".json"))
                .is_some_and(|stem| !stem.is_empty())
        })
}
fn array_contains_severity(value: &Value, severity: &str) -> bool {
    array(value).is_some_and(|a| {
        a.iter().any(|v| {
            member(v, "severity")
                .and_then(text)
                .and_then(|s| s.to_utf8().ok())
                .as_deref()
                == Some(severity)
        })
    })
}
fn compile_schema(
    text: &str,
    resources: &SchemaResources,
    ctx: &mut Context<'_>,
) -> Result<CompiledSchema, EngineError> {
    CompiledSchema::compile_consumer(&json(text, ctx)?, resources, false, ctx)
}
fn json(text: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let units: Vec<u16> = text.encode_utf16().collect();
    ctx.charge_text(units.len(), Utf16::default())?;
    serialization::read_json_value(&units, Format::Json, ctx)
}
fn validation_error(code: &str, v: Validation) -> EngineError {
    match v.diagnostics.into_iter().next() {
        Some(d) => EngineError::new(code, d.path, d.message),
        None => err(code, "Invalid Smithy document"),
    }
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), Utf16::from(message))
}
fn object(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect())
}
fn s(v: &str) -> Value {
    Value::string_utf8(v)
}
fn strings(v: &[&str]) -> Value {
    Value::Array(v.iter().map(|x| s(x)).collect())
}
fn member<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    object_fields(v)?
        .iter()
        .find(|(key, _)| key == &Utf16::from(k))
        .map(|(_, v)| v)
}
fn object_fields(v: &Value) -> Option<&Vec<(Utf16, Value)>> {
    if let Value::Object(v) = v {
        Some(v)
    } else {
        None
    }
}
fn object_fields_mut(v: &mut Value) -> Option<&mut Vec<(Utf16, Value)>> {
    if let Value::Object(v) = v {
        Some(v)
    } else {
        None
    }
}
fn array_mut(v: &mut Value) -> Option<&mut Vec<Value>> {
    if let Value::Array(v) = v {
        Some(v)
    } else {
        None
    }
}
fn member_mut<'a>(v: &'a mut Value, k: &str) -> Option<&'a mut Value> {
    object_fields_mut(v)?
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from(k))
        .map(|(_, value)| value)
}
fn array(v: &Value) -> Option<&Vec<Value>> {
    if let Value::Array(v) = v {
        Some(v)
    } else {
        None
    }
}
fn text(v: &Value) -> Option<Utf16> {
    if let Value::String(v) = v {
        Some(v.clone())
    } else {
        None
    }
}
fn text_copy(v: &Value, ctx: &mut Context<'_>) -> Result<Option<Utf16>, EngineError> {
    match v {
        Value::String(s) => {
            ctx.charge_text(s.len(), Utf16::default())?;
            Ok(Some(s.clone()))
        }
        _ => Ok(None),
    }
}
fn failure_code(
    value: &Value,
    failed: &'static str,
    cancelled: &'static str,
    timeout: &'static str,
) -> Result<&'static str, EngineError> {
    match text(value).and_then(|s| s.to_utf8().ok()).as_deref() {
        None => Ok(failed),
        Some(v) if v == failed => Ok(failed),
        Some(v) if v == cancelled => Ok(cancelled),
        Some(v) if v == timeout => Ok(timeout),
        _ => Err(err("SMITHY_HOST_RESPONSE", "Failure code is not admitted")),
    }
}
fn validate_response(
    schema: &CompiledSchema,
    value: &Value,
    code: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let errors = schema.validate(value, ctx)?;
    if errors.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "Constructed Smithy result does not match its pinned public schema",
        ))
    }
}
struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

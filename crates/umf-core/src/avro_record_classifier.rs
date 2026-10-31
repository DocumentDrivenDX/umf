// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in Avro record/error membership classification.
//!
//! This composes the bounded declaration inventory, direct-field discovery,
//! field classifier and core-kind receipt verifier. It does not claim scalar,
//! logical-type, presence or value-domain equivalence.

use crate::{
    avro_document, avro_field_classifier,
    avro_fields::{derive_avro_fields, AvroDependency},
    avro_record_declarations::{inventory_record_declarations, AvroRecordDeclaration},
    context::Context,
    core_kind,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    native_json::NativeJsonTree,
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/avro-record-classification.schema.json");
const CORE_SCHEMA: &str = include_str!("../../../spec/core/schema.json");
const KIND_SCHEMA: &str = include_str!("../../../spec/core/kind-operation-v6.schema.json");

fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (k(key), value))
            .collect(),
    )
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &k(name))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn string(value: &Value) -> Option<&Utf16> {
    if let Value::String(value) = value {
        Some(value)
    } else {
        None
    }
}
fn err(code: &str, path: &str, message: impl Into<String>) -> EngineError {
    EngineError::new(code, k(path), message.into())
}
fn parse_json(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}

struct NoCallbacks;
impl Capabilities for NoCallbacks {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

struct Runtime {
    engine: Engine,
    registry: Registry,
    result_schema: CompiledSchema,
    request_schema: CompiledSchema,
}

fn runtime(ctx: &mut Context<'_>) -> Result<std::sync::Arc<Runtime>, EngineError> {
    use std::sync::{Arc, OnceLock};
    static RESOURCES: OnceLock<Arc<Runtime>> = OnceLock::new();
    ctx.charge_work(1, k(""))?;
    let ordinary = ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary();
    if ordinary {
        if let Some(resources) = RESOURCES.get() {
            return Ok(Arc::clone(resources));
        }
    }
    // Build under the caller's controls and outside OnceLock initialization:
    // validation may invoke host callbacks, and failed builds are never cached.
    let resources = Arc::new(build_runtime(ctx)?);
    if ordinary {
        let _ = RESOURCES.set(Arc::clone(&resources));
    }
    Ok(resources)
}

fn build_runtime(
    ctx: &mut Context<'_>,
) -> Result<Runtime, EngineError> {
    let engine = Engine::new(
        ResourceSet::new(
            parse_json(CORE_SCHEMA, ctx)?,
            parse_json(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            parse_json(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            parse_json(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            parse_json(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                ctx,
            )?,
        ),
        ctx,
    )?;
    let resources = engine.schema_resources_with_context(ctx)?;
    let mut registry = Registry::new();
    registry.register(
        &parse_json(
            include_str!("../../../spec/extensions/avro/package.json"),
            ctx,
        )?,
        None,
        engine.package_schema(),
        &resources,
        ctx,
    )?;
    let resources = SchemaResources {
        entries: vec![
            (k("urn:umf:core:0.10.0"), parse_json(CORE_SCHEMA, ctx)?),
            (
                k("urn:umf:core:semantic-type-reference:1.0.0"),
                parse_json(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
            ),
            (
                k("urn:umf:core:kind-operation:6.0.0"),
                parse_json(KIND_SCHEMA, ctx)?,
            ),
        ],
    };
    let full = CompiledSchema::compile(&parse_json(RESULT_SCHEMA, ctx)?, &resources, ctx)?;
    let result_source = parse_json(RESULT_SCHEMA, ctx)?;
    let request_schema_value = copy_json(
        get(get(&result_source, "properties").unwrap(), "request").unwrap(),
        ctx,
    )?;
    let request = CompiledSchema::compile(&request_schema_value, &resources, ctx)?;
    Ok(Runtime { engine, registry, result_schema: full, request_schema: request })
}

fn validate_document(
    source: &Value,
    engine: &Engine,
    registry: &Registry,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut callbacks = NoCallbacks;
    let result = engine.validate_document(source, registry, &mut callbacks, ctx)?;
    if result.valid {
        Ok(())
    } else {
        Err(err(
            "AVRO_RECORD_VERSION",
            "",
            "Valid current 0.10.0 envelope required",
        ))
    }
}

fn modules(value: &Value) -> Option<&Vec<Value>> {
    match get(value, "modules")? {
        Value::Array(items) => Some(items),
        _ => None,
    }
}
fn locate_field(source: &Value, identity: &Utf16) -> Result<(usize, usize), EngineError> {
    let modules = modules(source)
        .ok_or_else(|| err("AVRO_RECORD_METADATA", "/modules", "Modules are required"))?;
    let mi = modules
        .iter()
        .position(|module| get(module, "id").and_then(string) == Some(&k("avro.fields")))
        .ok_or_else(|| {
            err(
                "AVRO_RECORD_METADATA",
                "/modules",
                "Derived field module is required",
            )
        })?;
    let elements = match get(&modules[mi], "elements") {
        Some(Value::Array(items)) => items,
        _ => {
            return Err(err(
                "AVRO_RECORD_METADATA",
                "/modules",
                "Derived field elements are required",
            ))
        }
    };
    let ei = elements
        .iter()
        .position(|element| get(element, "id").and_then(string) == Some(identity))
        .ok_or_else(|| {
            err(
                "AVRO_RECORD_METADATA",
                "/modules",
                "Derived field identity is absent",
            )
        })?;
    Ok((mi, ei))
}
fn set_kind(
    target: &mut Value,
    mi: usize,
    ei: usize,
    kind: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(kind.len().saturating_add(1), k("/modules"))?;
    let fields = target_field_mut(target, mi, ei)
        .ok_or_else(|| err("AVRO_RECORD_TARGET", "/modules", "Target field disappeared"))?;
    if let Some((_, value)) = fields.iter_mut().find(|(key, _)| key == &k("kind")) {
        *value = t(kind);
    } else {
        fields.push((k("kind"), t(kind)));
    }
    Ok(())
}
fn target_field_mut(target: &mut Value, mi: usize, ei: usize) -> Option<&mut Vec<(Utf16, Value)>> {
    let Value::Object(root) = target else {
        return None;
    };
    let Value::Array(modules) = &mut root.iter_mut().find(|(key, _)| key == &k("modules"))?.1
    else {
        return None;
    };
    let Value::Object(module) = modules.get_mut(mi)? else {
        return None;
    };
    let Value::Array(elements) = &mut module.iter_mut().find(|(key, _)| key == &k("elements"))?.1
    else {
        return None;
    };
    let Value::Object(element) = elements.get_mut(ei)? else {
        return None;
    };
    Some(element)
}

fn path_text(path: &Utf16) -> Result<String, EngineError> {
    path.to_utf8()
        .map_err(|_| err("AVRO_RECORD_SELECTION", "", "Record path must be UTF-8"))
}
fn selected<'a>(
    declarations: &'a [AvroRecordDeclaration],
    path: &Utf16,
    dependency: Option<&Utf16>,
) -> Result<&'a AvroRecordDeclaration, EngineError> {
    declarations
        .iter()
        .find(|entry| &entry.path == path && entry.dependency_id.as_ref() == dependency)
        .ok_or_else(|| {
            err(
                "AVRO_RECORD_IDENTITY",
                "",
                "Selected record declaration is missing",
            )
        })
}
fn append_record_module(
    target: &mut Value,
    request: &Value,
    declaration: &AvroRecordDeclaration,
    field_refs: Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let record_module = string(get(request, "recordModule").unwrap()).unwrap();
    let record_id = string(get(request, "recordId").unwrap()).unwrap();
    let modules = target_field_root(target).ok_or_else(|| {
        err(
            "AVRO_RECORD_TARGET",
            "/modules",
            "Target modules are absent",
        )
    })?;
    let index = modules.len();
    ctx.charge_work(
        index
            .saturating_add(5)
            .saturating_add(declaration.name.len())
            .saturating_add(declaration.namespace.len())
            .saturating_add(record_module.len())
            .saturating_add(record_id.len()),
        k("/modules"),
    )?;
    let name = declaration.name.clone();
    let namespace = declaration.namespace.clone();
    let mut element = vec![
        (k("id"), Value::String(record_id.clone())),
        (k("name"), Value::String(name)),
        (k("kind"), t("record")),
        (k("extensions"), Value::Object(Vec::new())),
        (k("references"), Value::Array(field_refs)),
    ];
    let module = obj(vec![
        ("id", Value::String(record_module.clone())),
        ("namespace", Value::String(namespace)),
        (
            "elements",
            Value::Array(vec![Value::Object(std::mem::take(&mut element))]),
        ),
    ]);
    modules.push(module);
    Ok(())
}
fn target_field_root(target: &mut Value) -> Option<&mut Vec<Value>> {
    let Value::Object(root) = target else {
        return None;
    };
    match &mut root.iter_mut().find(|(key, _)| key == &k("modules"))?.1 {
        Value::Array(items) => Some(items),
        _ => None,
    }
}

/// Classify one declared Avro record/error and its direct ordered field membership.
/// Returns the exact `classify-avro-record` 1.0.0 receipt shape.
pub fn classify_avro_record(
    source: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(source, ctx)?;
    let request = copy_json(request, ctx)?;
    let runtime = runtime(ctx)?;
    if let Some(first) = runtime.request_schema.validate(&request, ctx)?.first() {
        return Err(err(
            "AVRO_RECORD_REQUEST",
            &first.instance_path.to_utf8().unwrap_or_default(),
            first.message.to_utf8().unwrap_or_default(),
        ));
    }
    validate_document(&source, &runtime.engine, &runtime.registry, ctx)?;
    let native_source = string(get(&request, "nativeSource").unwrap()).unwrap();
    let bundle = avro_document::export_bundle(&source, ctx)?;
    let root = NativeJsonTree::parse_json(native_source.units(), ctx)?;
    let rendered = root.render_compact(ctx)?;
    if !bundle.schema_json.units().ends_with(&[10])
        || &bundle.schema_json.units()[..bundle.schema_json.len() - 1] != rendered.units()
    {
        return Err(err(
            "AVRO_RECORD_ARCHIVE",
            "",
            "Native bundle archive differs from retained schemas",
        ));
    }
    let mut parsed_dependencies = Vec::<(Utf16, NativeJsonTree)>::new();
    if let Some(Value::Array(deps)) = get(&request, "dependencies") {
        if bundle.dependencies.len() != deps.len() {
            return Err(err(
                "AVRO_RECORD_ARCHIVE",
                "",
                "Native bundle archive differs from retained schemas",
            ));
        }
        for (index, dep) in deps.iter().enumerate() {
            ctx.charge_work(1, k("/dependencies"))?;
            let id_ref = string(get(dep, "id").unwrap()).unwrap();
            ctx.charge_work(id_ref.len(), k("/dependencies"))?;
            let id = id_ref.clone();
            let schema = string(get(dep, "schema").unwrap()).unwrap();
            let tree = NativeJsonTree::parse_json(schema.units(), ctx)?;
            let rendered = tree.render_compact(ctx)?;
            let (actual_id, actual_schema) = &bundle.dependencies[index];
            if actual_id != &id
                || !actual_schema.units().ends_with(&[10])
                || &actual_schema.units()[..actual_schema.len() - 1] != rendered.units()
            {
                return Err(err(
                    "AVRO_RECORD_ARCHIVE",
                    "",
                    "Native bundle archive differs from retained schemas",
                ));
            }
            ctx.charge_work(1, k("/dependencies"))?;
            parsed_dependencies.push((id, tree));
        }
    } else if !bundle.dependencies.is_empty() {
        return Err(err(
            "AVRO_RECORD_ARCHIVE",
            "",
            "Native bundle archive differs from retained schemas",
        ));
    }
    ctx.charge_work(parsed_dependencies.len(), k("/dependencies"))?;
    let dependency_refs = parsed_dependencies
        .iter()
        .map(|(id, root)| AvroDependency { id, root })
        .collect::<Vec<_>>();
    let declarations = inventory_record_declarations(&root, &dependency_refs, ctx)?;
    let path = string(get(&request, "path").unwrap()).unwrap();
    let dependency_id = get(&request, "dependencyId").and_then(string);
    let declaration = selected(&declarations, path, dependency_id)?;
    path_text(&declaration.path)?;
    let fields = derive_avro_fields(&root, &dependency_refs, ctx)?;
    // Preserve the predecessor's exact selection predicate: all derived
    // fields whose dependency identity and resolved fullname match the record.
    // In malformed duplicate-name schemas this can include fields at another
    // declaration path, as in the TypeScript reference implementation.
    ctx.charge_work(fields.len(), declaration.path.clone())?;
    let direct = fields
        .into_iter()
        .filter(|field| {
            field.dependency_id.as_ref() == declaration.dependency_id.as_ref()
                && field.record == declaration.fullname
        })
        .collect::<Vec<_>>();

    let modules = modules(&source).unwrap();
    let record_module_collision = modules.iter().any(|module| {
        get(module, "id").and_then(string) == get(&request, "recordModule").and_then(string)
    });
    let record_module_len = modules.len();
    let mut reasons = Vec::new();
    if record_module_collision {
        let collision_path = format!("/modules/{record_module_len}/elements/0/kind");
        reasons.push((
            "RECORD_IDENTITY_COLLISION",
            collision_path,
            copy_json(get(&request, "recordModule").unwrap(), ctx)?,
            "Requested record module already exists; no merge is implied".to_owned(),
        ));
    }
    let mut author_by_id = std::collections::HashMap::<Utf16, Value>::new();
    if let Some(Value::Array(authors)) = get(&request, "authors") {
        let mut callbacks = NoCallbacks;
        for author in authors {
            let identity = get(author, "identity");
            let element = identity
                .and_then(|v| get(v, "element"))
                .and_then(string)
                .cloned()
                .unwrap_or_default();
            let module = identity.and_then(|v| get(v, "module")).and_then(string);
            let valid = core_kind::verify_core_kind_declaration(
                author,
                &source,
                &runtime.engine,
                &runtime.registry,
                &mut callbacks,
                ctx,
            );
            if let Err(error) = valid {
                if error.is_control_failure() || error.code == "LIMIT" {
                    return Err(error);
                }
                reasons.push((
                    "STALE_AUTHOR",
                    get(
                        get(author, "provenance").unwrap_or(&Value::Null),
                        "idealPath",
                    )
                    .and_then(string)
                    .map_or("".to_owned(), |v| v.to_utf8().unwrap_or_default()),
                    copy_json(author, ctx)?,
                    format!("Author receipt differs from source: {}", error.code),
                ));
            } else if module != Some(&k("avro.fields"))
                || !direct.iter().any(|field| field.element_id == element)
                || author_by_id.contains_key(&element)
            {
                ctx.charge_work(element.len(), k("/authors"))?;
                reasons.push((
                    "AUTHOR_IDENTITY",
                    get(
                        get(author, "provenance").unwrap_or(&Value::Null),
                        "idealPath",
                    )
                    .and_then(string)
                    .map_or("".to_owned(), |v| v.to_utf8().unwrap_or_default()),
                    Value::String(element),
                    "Duplicate or unrelated member author receipt".to_owned(),
                ));
            } else {
                ctx.charge_work(element.len().saturating_add(1), k("/authors"))?;
                author_by_id.insert(element, copy_json(author, ctx)?);
            }
        }
    }
    let mut mappings = Vec::new();
    for field in &direct {
        ctx.charge_work(
            field.element_id.len().saturating_add(native_source.len()),
            field.path.clone(),
        )?;
        let field_request = obj(vec![
            ("column", Value::String(field.element_id.clone())),
            ("nativeSource", Value::String(native_source.clone())),
            ("mode", copy_json(get(&request, "mode").unwrap(), ctx)?),
        ]);
        let mut field_request = field_request;
        if let Some(deps) = get(&request, "dependencies") {
            if let Value::Object(m) = &mut field_request {
                m.push((k("dependencies"), copy_json(deps, ctx)?));
            }
        }
        if let Some(author) = author_by_id.get(&field.element_id) {
            if let Value::Object(m) = &mut field_request {
                m.push((k("author"), copy_json(author, ctx)?));
            }
        }
        let classified = avro_field_classifier::classify_field(&source, &field_request, ctx)?;
        if let Some(mapping) = get(&classified, "mapping") {
            let mapping = copy_json(mapping, ctx)?;
            ctx.charge_work(1, field.path.clone())?;
            mappings.push(mapping);
        }
        if get(&classified, "status")
            .and_then(string)
            .is_some_and(|status| status == &k("blocked"))
        {
            if let Some(Value::Array(residuals)) = get(&classified, "residuals") {
                for residual in residuals {
                    reasons.push((
                        "FIELD_KIND_CONFLICT",
                        get(residual, "path")
                            .and_then(string)
                            .map_or("".to_owned(), |v| v.to_utf8().unwrap_or_default()),
                        get(residual, "value").cloned().unwrap_or(Value::Null),
                        get(residual, "reason")
                            .and_then(string)
                            .map_or("Field classification conflict".to_owned(), |v| {
                                v.to_utf8().unwrap_or_default()
                            }),
                    ));
                }
            }
        }
    }
    let mapping_path = format!("/modules/{}/elements/0", modules.len());
    let native_fragment = declaration.native.tagged_value_preserving_extras(ctx)?;
    let mut record_mapping = vec![
        (k("origin"), t("classified")),
        (k("kind"), t("record")),
        (
            k("idealPath"),
            Value::string_utf8(format!("{mapping_path}/kind")),
        ),
        (k("nativePath"), Value::String(declaration.path.clone())),
        (k("nativeFragment"), native_fragment),
        (k("basis"), t("checked-record-declaration")),
        (
            k("outcome"),
            t(if reasons.is_empty() {
                "exact"
            } else {
                "unknown"
            }),
        ),
    ];
    if let Some(id) = declaration.dependency_id.clone() {
        record_mapping.push((k("dependencyId"), Value::String(id)));
    }
    mappings.push(Value::Object(record_mapping));
    if !reasons.is_empty() {
        return blocked_result_with_mappings(
            source,
            request,
            mappings,
            reasons,
            &runtime.result_schema,
            ctx,
        );
    }
    let mut target = copy_json(&source, ctx)?;
    ctx.charge_work(
        direct.iter().fold(direct.len(), |work, field| {
            work.saturating_add(field.element_id.len())
        }),
        declaration.path.clone(),
    )?;
    let field_ref_values = direct
        .iter()
        .map(|field| {
            obj(vec![
                ("role", t("member")),
                ("module", t("avro.fields")),
                ("element", Value::String(field.element_id.clone())),
            ])
        })
        .collect::<Vec<_>>();
    for field in &direct {
        let (mi, ei) = locate_field(&target, &field.element_id)?;
        set_kind(&mut target, mi, ei, "field", ctx)?;
    }
    append_record_module(&mut target, &request, declaration, field_ref_values, ctx)?;
    validate_document(&target, &runtime.engine, &runtime.registry, ctx)?;
    let output = obj(vec![("operation", t("classify-avro-record")), ("version", t("1.0.0")), ("status", t("classified")), ("source", source), ("target", target), ("request", request), ("binding", obj(vec![("id", t("umf.avro.record")), ("version", t("1.0.0")), ("nativeVersion", t("1.12.0")), ("subset", t("Declared record/error with ordered fields and dependency-qualified identity; no value-domain or logical-type equivalence"))])), ("mappings", Value::Array(mappings)), ("residuals", Value::Array(Vec::new())), ("diagnostics", Value::Array(Vec::new()))]);
    let errors = runtime.result_schema.validate(&output, ctx)?;
    if let Some(first) = errors.first() {
        return Err(err(
            "AVRO_RECORD_RESULT",
            &first.instance_path.to_utf8().unwrap_or_default(),
            first.message.to_utf8().unwrap_or_default(),
        ));
    }
    Ok(output)
}

fn blocked_result_with_mappings(
    source: Value,
    request: Value,
    mappings: Vec<Value>,
    reasons: Vec<(&str, String, Value, String)>,
    result_schema: &CompiledSchema,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut residuals = Vec::new();
    let mut diagnostics = Vec::new();
    for (code, path, value, message) in reasons {
        ctx.charge_work(path.len().saturating_add(message.len()), k("/residuals"))?;
        residuals.push(obj(vec![("path", Value::string_utf8(path.clone())), ("value", value), ("reason", Value::string_utf8(message.clone())), ("recovery", t("Source and native fragments retained; resolve conflict then recompute whole record classification"))]));
        diagnostics.push(obj(vec![
            ("code", t(code)),
            ("path", Value::string_utf8(path)),
            ("message", Value::string_utf8(message)),
            ("severity", t("error")),
        ]));
    }
    let output = obj(vec![("operation", t("classify-avro-record")), ("version", t("1.0.0")), ("status", t("blocked")), ("source", source), ("request", request), ("binding", obj(vec![("id", t("umf.avro.record")), ("version", t("1.0.0")), ("nativeVersion", t("1.12.0")), ("subset", t("Declared record/error with ordered fields and dependency-qualified identity; no value-domain or logical-type equivalence"))])), ("mappings", Value::Array(mappings)), ("residuals", Value::Array(residuals)), ("diagnostics", Value::Array(diagnostics))]);
    let errors = result_schema.validate(&output, ctx)?;
    if let Some(first) = errors.first() {
        return Err(err(
            "AVRO_RECORD_RESULT",
            &first.instance_path.to_utf8().unwrap_or_default(),
            first.message.to_utf8().unwrap_or_default(),
        ));
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn source(schema: &str) -> Value {
        avro_document::import_schema(
            &k("record-test"),
            &schema.encode_utf16().collect::<Vec<_>>(),
            &[],
            &mut Context::ordinary(),
        )
        .unwrap()
    }
    fn request(path: &str) -> Value {
        obj(vec![
            ("recordModule", t("records")),
            ("recordId", t("selected")),
            ("mode", t("strict")),
            (
                "nativeSource",
                t(
                    r#"{"type":"record","name":"R","namespace":"sales","fields":[{"name":"id","type":"long"},{"name":"nested","type":{"type":"record","name":"N","fields":[{"name":"x","type":"string"}]}}]}"#,
                ),
            ),
            ("path", t(path)),
        ])
    }
    #[test]
    fn classifies_direct_members_in_order_and_excludes_nested_fields() {
        let source = source(
            r#"{"type":"record","name":"R","namespace":"sales","fields":[{"name":"id","type":"long"},{"name":"nested","type":{"type":"record","name":"N","fields":[{"name":"x","type":"string"}]}}]}"#,
        );
        let result = classify_avro_record(&source, &request(""), &mut Context::ordinary()).unwrap();
        assert_eq!(get(&result, "status"), Some(&t("classified")));
        let target = get(&result, "target").unwrap();
        let last = modules(target).unwrap().last().unwrap();
        assert_eq!(get(last, "id"), Some(&t("records")));
        let record = match get(last, "elements").unwrap() {
            Value::Array(items) => &items[0],
            _ => panic!("expected record elements"),
        };
        let references = match get(record, "references").unwrap() {
            Value::Array(items) => items,
            _ => panic!("expected field references"),
        };
        assert_eq!(
            references.len(),
            2,
            "nested record fields must not become parent members"
        );
        assert_eq!(
            get(&references[0], "element"),
            Some(&t(r#"[null,"/fields/0"]"#))
        );
        assert_eq!(
            get(&references[1], "element"),
            Some(&t(r#"[null,"/fields/1"]"#))
        );
        let mappings = match get(&result, "mappings").unwrap() {
            Value::Array(items) => items,
            _ => panic!("expected mappings"),
        };
        assert_eq!(get(&mappings[0], "nativePath"), Some(&t("/fields/0")));
        assert_eq!(get(&mappings[1], "nativePath"), Some(&t("/fields/1")));
    }
    #[test]
    fn refuses_invalid_selected_path_and_record_module_collision() {
        let source = source(
            r#"{"type":"record","name":"R","namespace":"sales","fields":[{"name":"id","type":"long"},{"name":"nested","type":{"type":"record","name":"N","fields":[{"name":"x","type":"string"}]}}]}"#,
        );
        let mut bad = request("/fields/0/type");
        assert!(classify_avro_record(&source, &bad, &mut Context::ordinary()).is_err());
        bad = request("");
        if let Value::Object(fields) = &mut bad {
            if let Some((_, value)) = fields.iter_mut().find(|(key, _)| key == &k("recordModule")) {
                *value = t("schema");
            }
        }
        let result = classify_avro_record(&source, &bad, &mut Context::ordinary()).unwrap();
        assert_eq!(get(&result, "status"), Some(&t("blocked")));
        assert!(get(&result, "target").is_none());
        assert_eq!(
            get(&result, "mappings").and_then(|value| if let Value::Array(items) = value {
                Some(items.len())
            } else {
                None
            }),
            Some(3)
        );
        assert_eq!(
            get(&result, "residuals").and_then(|value| if let Value::Array(items) = value {
                Some(items.len())
            } else {
                None
            }),
            Some(1)
        );
    }

    #[test]
    fn valid_author_receipt_conflicting_with_field_membership_blocks_with_field_mapping() {
        let schema = r#"{"type":"record","name":"R","namespace":"sales","fields":[{"name":"id","type":"long"},{"name":"nested","type":{"type":"record","name":"N","fields":[{"name":"x","type":"string"}]}}]}"#;
        let source = source(schema);
        let field_id = k(r#"[null,"/fields/1"]"#);
        let runtime = runtime(&mut Context::ordinary()).unwrap();
        let mut callbacks = NoCallbacks;
        let author = core_kind::declare_core_kind(
            &source,
            &core_kind::Identity {
                module: k("avro.fields"),
                element: field_id,
            },
            "record",
            &runtime.engine,
            &runtime.registry,
            &mut callbacks,
            &mut Context::ordinary(),
        )
        .unwrap();
        let authored_source =
            copy_json(get(&author, "target").unwrap(), &mut Context::ordinary()).unwrap();
        let mut request = request("");
        if let Value::Object(fields) = &mut request {
            fields.push((k("authors"), Value::Array(vec![author])));
        }
        let result =
            classify_avro_record(&authored_source, &request, &mut Context::ordinary()).unwrap();
        assert_eq!(get(&result, "status"), Some(&t("blocked")));
        assert!(get(&result, "target").is_none());
        assert_eq!(
            get(&result, "mappings").and_then(|value| if let Value::Array(items) = value {
                Some(items.len())
            } else {
                None
            }),
            Some(3)
        );
        let diagnostics = match get(&result, "diagnostics").unwrap() {
            Value::Array(items) => items,
            _ => panic!("expected diagnostics"),
        };
        assert!(
            diagnostics
                .iter()
                .any(|item| get(item, "code") == Some(&t("FIELD_KIND_CONFLICT"))),
            "diagnostics: {diagnostics:?}"
        );
    }
}

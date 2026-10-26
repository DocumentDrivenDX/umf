// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in Avro direct record-valued Field classification.
//!
//! This composes the retained Avro Record classifier with selected-field
//! discovery and adds one `record-type` reference. The implementation is
//! deliberately conservative around author receipts and existing assertions;
//! it never overwrites those assertions without a verified authoring path.

use crate::{
    avro_document, avro_field_classifier,
    avro_fields::AvroDependency,
    avro_record_classifier,
    avro_record_declarations::inventory_record_declarations,
    avro_record_type_candidate::{resolve_candidate, Resolution},
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    native_json::NativeJsonTree,
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/avro-record-type-classification.schema.json");

fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn decimal_len(mut value: usize) -> usize {
    let mut len = 1;
    while value >= 10 {
        value /= 10;
        len += 1;
    }
    len
}
fn text(s: &str) -> Value {
    Value::string_utf8(s)
}
fn copy_text(value: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_work(value.len(), Utf16::default())?;
    Ok(value.clone())
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
fn error(code: &'static str, message: impl Into<String>) -> EngineError {
    EngineError::new(code, Utf16::default(), message.into())
}
fn parse(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}
fn result_schemas(ctx: &mut Context<'_>) -> Result<(CompiledSchema, CompiledSchema), EngineError> {
    let schema = parse(RESULT_SCHEMA, ctx)?;
    let resources = SchemaResources {
        entries: vec![
            (
                k("urn:umf:core:0.10.0"),
                parse(include_str!("../../../spec/core/schema.json"), ctx)?,
            ),
            (
                k("urn:umf:core:semantic-type-reference:1.0.0"),
                parse(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
            ),
            (
                k("urn:umf:core:kind-operation:6.0.0"),
                parse(
                    include_str!("../../../spec/core/kind-operation-v6.schema.json"),
                    ctx,
                )?,
            ),
        ],
    };
    let result = CompiledSchema::compile(&schema, &resources, ctx)?;
    let request = get(
        get(&schema, "properties")
            .ok_or_else(|| error("AVRO_RECORD_TYPE_SCHEMA", "Result schema has no properties"))?,
        "request",
    )
    .ok_or_else(|| {
        error(
            "AVRO_RECORD_TYPE_SCHEMA",
            "Result schema has no request schema",
        )
    })?;
    Ok((result, CompiledSchema::compile(request, &resources, ctx)?))
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
fn validate_target(target: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let engine = Engine::new(
        ResourceSet::new(
            parse(include_str!("../../../spec/core/schema.json"), ctx)?,
            parse(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            parse(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            parse(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            parse(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                ctx,
            )?,
        ),
        ctx,
    )?;
    let mut registry = Registry::new();
    let resources = engine.schema_resources_with_context(ctx)?;
    registry.register(
        &parse(
            include_str!("../../../spec/extensions/avro/package.json"),
            ctx,
        )?,
        None,
        engine.package_schema(),
        &resources,
        ctx,
    )?;
    let mut callbacks = NoCallbacks;
    if engine
        .validate_document(target, &registry, &mut callbacks, ctx)?
        .valid
    {
        Ok(())
    } else {
        Err(error(
            "AVRO_RECORD_TYPE_TARGET",
            "Classified target failed current document validation",
        ))
    }
}

fn verify_author(
    author: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let engine = Engine::new(
        ResourceSet::new(
            parse(include_str!("../../../spec/core/schema.json"), ctx)?,
            parse(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            parse(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            parse(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            parse(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                ctx,
            )?,
        ),
        ctx,
    )?;
    let mut registry = Registry::new();
    let resources = engine.schema_resources_with_context(ctx)?;
    registry.register(
        &parse(
            include_str!("../../../spec/extensions/avro/package.json"),
            ctx,
        )?,
        None,
        engine.package_schema(),
        &resources,
        ctx,
    )?;
    let mut callbacks = NoCallbacks;
    crate::core_kind::verify_core_kind_receipt(author, &engine, &registry, &mut callbacks, ctx)?;
    crate::core_kind::finish_core_kind_verification(
        copy_json(author, ctx)?,
        copy_json(current, ctx)?,
        ctx,
    )?;
    Ok(())
}

fn request_for_record(
    request: &Value,
    path: &Utf16,
    dependency: Option<&Utf16>,
    authors: Option<Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut fields = vec![
        (
            k("recordModule"),
            copy_json(
                get(request, "recordModule")
                    .ok_or_else(|| error("AVRO_RECORD_TYPE_REQUEST", "recordModule is required"))?,
                ctx,
            )?,
        ),
        (
            k("recordId"),
            copy_json(
                get(request, "recordId")
                    .ok_or_else(|| error("AVRO_RECORD_TYPE_REQUEST", "recordId is required"))?,
                ctx,
            )?,
        ),
        (
            k("mode"),
            copy_json(
                get(request, "mode")
                    .ok_or_else(|| error("AVRO_RECORD_TYPE_REQUEST", "mode is required"))?,
                ctx,
            )?,
        ),
        (
            k("nativeSource"),
            copy_json(
                get(request, "nativeSource")
                    .ok_or_else(|| error("AVRO_RECORD_TYPE_REQUEST", "nativeSource is required"))?,
                ctx,
            )?,
        ),
        (k("path"), Value::String(copy_text(path, ctx)?)),
    ];
    if let Some(deps) = get(request, "dependencies") {
        fields.push((k("dependencies"), copy_json(deps, ctx)?));
    }
    if let Some(id) = dependency {
        fields.push((k("dependencyId"), Value::String(copy_text(id, ctx)?)));
    }
    if let Some(authors) = authors {
        fields.push((k("authors"), authors));
    }
    Ok(Value::Object(fields))
}

/// Classify a direct Avro record/error-valued field. `source` and `request`
/// remain in the result so unknown native data and archive provenance survive.
pub fn classify_avro_record_type(
    source: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(source, ctx)?;
    let request = copy_json(request, ctx)?;
    let (result_schema, request_schema) = result_schemas(ctx)?;
    if let Some(issue) = request_schema.validate(&request, ctx)?.first() {
        return Err(EngineError::new(
            "AVRO_RECORD_TYPE_REQUEST",
            issue.instance_path.clone(),
            issue.message.clone(),
        ));
    }
    let native_source = string(
        get(&request, "nativeSource")
            .ok_or_else(|| error("AVRO_RECORD_TYPE_REQUEST", "nativeSource is required"))?,
    )
    .ok_or_else(|| error("AVRO_RECORD_TYPE_REQUEST", "nativeSource must be text"))?;
    let root = NativeJsonTree::parse_json(native_source.units(), ctx)?;
    let mut dependencies = Vec::new();
    let mut dep_trees = Vec::<(Utf16, NativeJsonTree)>::new();
    if let Some(Value::Array(items)) = get(&request, "dependencies") {
        for item in items {
            let id = copy_text(
                string(get(item, "id").ok_or_else(|| {
                    error("AVRO_RECORD_TYPE_REQUEST", "dependency id is required")
                })?)
                .ok_or_else(|| error("AVRO_RECORD_TYPE_REQUEST", "dependency id must be text"))?,
                ctx,
            )?;
            let schema = string(get(item, "schema").ok_or_else(|| {
                error("AVRO_RECORD_TYPE_REQUEST", "dependency schema is required")
            })?)
            .ok_or_else(|| error("AVRO_RECORD_TYPE_REQUEST", "dependency schema must be text"))?;
            dep_trees.push((id, NativeJsonTree::parse_json(schema.units(), ctx)?));
        }
    }
    dependencies.extend(
        dep_trees
            .iter()
            .map(|(id, tree)| AvroDependency { id, root: tree }),
    );
    let column = copy_text(
        string(
            get(&request, "column")
                .ok_or_else(|| error("AVRO_RECORD_TYPE_REQUEST", "column is required"))?,
        )
        .ok_or_else(|| error("AVRO_RECORD_TYPE_REQUEST", "column must be text"))?,
        ctx,
    )?;
    let candidate = resolve_candidate(&root, &dependencies, &column, ctx)?;
    let (record_path, dependency_id) = match candidate.resolution {
        Resolution::Direct {
            path,
            dependency_id,
            ..
        }
        | Resolution::Qualified {
            path,
            dependency_id,
            ..
        } => (path, dependency_id),
        Resolution::Ambiguous { .. }
        | Resolution::Unresolved { .. }
        | Resolution::Unsupported { .. } => {
            let native_field = candidate
                .field
                .native_field
                .tagged_value_preserving_extras(ctx)?;
            let native_type = get(
                get(&native_field, "members").unwrap_or(&Value::Null),
                "type",
            )
            .map(|value| copy_json(value, ctx))
            .transpose()?
            .unwrap_or(Value::Null);
            let native_path = format!(
                "{}/type",
                candidate.field.path.to_utf8().map_err(|_| error(
                    "AVRO_RECORD_TYPE_NATIVE",
                    "Selected field path is not UTF-8"
                ))?
            );
            return blocked_unresolved_type(
                &source,
                &request,
                &column,
                &Utf16::from(native_path),
                native_type,
                ctx,
            );
        }
    };
    // Confirm the native captures are exactly the retained Avro bundle before
    // composing the record classifier. It independently repeats this check.
    let bundle = avro_document::export_bundle(&source, ctx)?;
    let rendered = root.render_compact(ctx)?;
    if !bundle.schema_json.units().ends_with(&[10])
        || &bundle.schema_json.units()[..bundle.schema_json.len() - 1] != rendered.units()
    {
        return Err(error(
            "AVRO_RECORD_TYPE_ARCHIVE",
            "Native bundle archive differs from retained schemas",
        ));
    }
    if bundle.dependencies.len() != dep_trees.len() {
        return Err(error(
            "AVRO_RECORD_TYPE_ARCHIVE",
            "Native bundle archive differs from retained schemas",
        ));
    }
    for ((id, tree), (actual_id, actual_schema)) in dep_trees.iter().zip(bundle.dependencies.iter())
    {
        let rendered = tree.render_compact(ctx)?;
        if id != actual_id
            || !actual_schema.units().ends_with(&[10])
            || &actual_schema.units()[..actual_schema.len() - 1] != rendered.units()
        {
            return Err(error(
                "AVRO_RECORD_TYPE_ARCHIVE",
                "Native bundle archive differs from retained schemas",
            ));
        }
    }
    let declarations = inventory_record_declarations(&root, &dependencies, ctx)?;
    if !declarations
        .iter()
        .any(|d| d.path == record_path && d.dependency_id == dependency_id)
    {
        return blocked(
            &source,
            &request,
            &column,
            "AVRO_RECORD_TYPE_UNRESOLVED",
            "Resolved declaration is absent from schema-position inventory",
            ctx,
        );
    }
    let authors = get(&request, "authors").and_then(|value| {
        if let Value::Array(items) = value {
            Some(items)
        } else {
            None
        }
    });
    if let Some(items) = authors {
        ctx.charge_work(items.len(), k("/authors"))?;
    }
    let selected_author_count = authors.map_or(0, |items| {
        items
            .iter()
            .filter(|author| {
                get(get(author, "identity").unwrap_or(&Value::Null), "module").and_then(string)
                    == Some(&k("avro.fields"))
                    && get(get(author, "identity").unwrap_or(&Value::Null), "element")
                        .and_then(string)
                        == Some(&column)
            })
            .count()
    });
    let mut verified_selected_field_author = false;
    let mut selected_author_conflict = false;
    if let Some(items) = authors {
        for author in items {
            let kind =
                get(get(author, "provenance").unwrap_or(&Value::Null), "kind").and_then(string);
            // A non-Field assertion on a selected Avro Field is a semantic
            // conflict, not an admitted authoring path; preserve it as a
            // blocked receipt after the Field classifier checks membership.
            if kind == Some(&k("field")) {
                verify_author(author, &source, ctx)?;
            }
        }
        for author in items.iter().filter(|author| {
            get(get(author, "identity").unwrap_or(&Value::Null), "module").and_then(string)
                == Some(&k("avro.fields"))
                && get(get(author, "identity").unwrap_or(&Value::Null), "element").and_then(string)
                    == Some(&column)
        }) {
            let mut field_request = obj(vec![
                ("column", Value::String(copy_text(&column, ctx)?)),
                (
                    "nativeSource",
                    copy_json(get(&request, "nativeSource").unwrap(), ctx)?,
                ),
                ("mode", copy_json(get(&request, "mode").unwrap(), ctx)?),
                ("author", copy_json(author, ctx)?),
            ]);
            if let Some(deps) = get(&request, "dependencies") {
                if let Value::Object(fields) = &mut field_request {
                    fields.push((k("dependencies"), copy_json(deps, ctx)?));
                }
            }
            let selected_result =
                avro_field_classifier::classify_field(&source, &field_request, ctx)?;
            if get(&selected_result, "status")
                .and_then(string)
                .is_some_and(|status| status == &k("blocked"))
            {
                selected_author_conflict = true;
            } else {
                verified_selected_field_author = true;
            }
        }
    }
    let record_authors = if let Some(items) = authors {
        let mut filtered = Vec::new();
        ctx.charge_work(items.len(), k("/authors"))?;
        for author in items {
            let identity = get(author, "identity").unwrap_or(&Value::Null);
            let is_selected = get(identity, "module").and_then(string) == Some(&k("avro.fields"))
                && get(identity, "element").and_then(string) == Some(&column);
            if !is_selected {
                filtered.push(copy_json(author, ctx)?);
            }
        }
        Some(Value::Array(filtered))
    } else {
        None
    };
    let record_request = request_for_record(
        &request,
        &record_path,
        dependency_id.as_ref(),
        record_authors,
        ctx,
    )?;
    let record = avro_record_classifier::classify_avro_record(&source, &record_request, ctx)?;
    if get(&record, "status")
        .and_then(string)
        .is_some_and(|s| s == &k("blocked"))
    {
        return blocked(
            &source,
            &request,
            &column,
            "AVRO_RECORD_TYPE_MEMBER_CONFLICT",
            "Selected record or member classification is blocked",
            ctx,
        );
    }
    let (module_index, element_index, element) = locate_field(&source, &column)?;
    if selected_author_conflict || selected_author_count > 1 {
        let message = if selected_author_conflict {
            "Authored kind conflicts with native record field membership"
        } else {
            "Duplicate or unrelated author receipt"
        };
        let residual_value = if selected_author_conflict {
            get(element, "kind")
                .map(|value| copy_json(value, ctx))
                .transpose()?
                .unwrap_or(Value::Null)
        } else {
            authors
                .and_then(|items| {
                    items.iter().find(|author| {
                        get(get(author, "identity").unwrap_or(&Value::Null), "module")
                            .and_then(string)
                            == Some(&k("avro.fields"))
                            && get(get(author, "identity").unwrap_or(&Value::Null), "element")
                                .and_then(string)
                                == Some(&column)
                    })
                })
                .map(|author| copy_json(author, ctx))
                .transpose()?
                .unwrap_or(Value::Null)
        };
        let mut mappings = copy_record_mappings(&record, ctx)?;
        let native_field = candidate
            .field
            .native_field
            .tagged_value_preserving_extras(ctx)?;
        let outcome = if selected_author_conflict {
            "unknown"
        } else {
            "exact"
        };
        ctx.charge_work(
            24 + decimal_len(module_index) + decimal_len(element_index),
            Utf16::default(),
        )?;
        let selected_ideal_path = format!("/modules/{module_index}/elements/{element_index}/kind");
        let mut selected_mapping = vec![
            (k("origin"), text("classified")),
            (k("kind"), text("field")),
            (k("idealPath"), text(&selected_ideal_path)),
            (
                k("nativePath"),
                Value::String(copy_text(&candidate.field.path, ctx)?),
            ),
            (k("nativeFragment"), copy_json(&native_field, ctx)?),
            (k("basis"), text("checked-record-field-membership")),
            (k("outcome"), text(outcome)),
        ];
        if let Some(id) = candidate.field.dependency_id.as_ref() {
            selected_mapping.push((k("dependencyId"), Value::String(copy_text(id, ctx)?)));
        }
        mappings.insert(0, Value::Object(selected_mapping));
        let native_members = get(&native_field, "members").ok_or_else(|| {
            error(
                "AVRO_RECORD_TYPE_NATIVE",
                "Selected native field is malformed",
            )
        })?;
        let native_type = copy_json(
            get(native_members, "type").ok_or_else(|| {
                error(
                    "AVRO_RECORD_TYPE_NATIVE",
                    "Selected field has no native type",
                )
            })?,
            ctx,
        )?;
        ctx.charge_work(
            candidate.field.path.len().saturating_add(5),
            Utf16::default(),
        )?;
        let native_path = format!(
            "{}/type",
            candidate.field.path.to_utf8().map_err(|_| error(
                "AVRO_RECORD_TYPE_NATIVE",
                "Selected field path is not UTF-8"
            ))?
        );
        ctx.charge_work(
            32 + decimal_len(module_index) + decimal_len(element_index),
            Utf16::default(),
        )?;
        let reference_ideal_path =
            format!("/modules/{module_index}/elements/{element_index}/references/0");
        let mut reference_mapping = vec![
            ("origin", text("classified")),
            ("kind", text("record-type")),
            ("idealPath", text(&reference_ideal_path)),
            ("nativePath", text(&native_path)),
            ("nativeFragment", native_type),
            ("basis", text("qualified-native-record-type")),
            ("outcome", text("unknown")),
        ];
        if let Some(id) = candidate.field.dependency_id.as_ref() {
            reference_mapping.push(("dependencyId", Value::String(copy_text(id, ctx)?)));
        }
        mappings.push(obj(reference_mapping));
        return blocked_with_mappings(
            &source,
            &request,
            &column,
            "AVRO_RECORD_TYPE_UNRESOLVED",
            message,
            residual_value,
            mappings,
            ctx,
        );
    }
    if (get(element, "kind").is_some() && !verified_selected_field_author) || get(element, "scalarType").is_some() || get(element, "references").is_some_and(|refs| matches!(refs, Value::Array(a) if a.iter().any(|r| get(r,"role").and_then(string)==Some(&k("record-type"))))) {
        return blocked(&source, &request, &column, "AVRO_RECORD_TYPE_EXISTING_ASSERTION", "Existing kind, scalar metadata or record-type assertion requires explicit provenance reconciliation", ctx);
    }
    let mut target = copy_json(get(&record, "target").unwrap(), ctx)?;
    let refs_len = get(element, "references")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a.len())
            } else {
                None
            }
        })
        .unwrap_or(0);
    let target_element = locate_field_mut(&mut target, module_index, element_index)?;
    if let Some((_, kind)) = target_element.iter_mut().find(|(key, _)| key == &k("kind")) {
        *kind = text("field");
    } else {
        target_element.push((k("kind"), text("field")));
    }
    if !target_element
        .iter()
        .any(|(key, _)| key == &k("references"))
    {
        target_element.push((k("references"), Value::Array(Vec::new())));
    }
    let refs = target_element
        .iter_mut()
        .find(|(key, _)| key == &k("references"))
        .and_then(|(_, value)| {
            if let Value::Array(items) = value {
                Some(items)
            } else {
                None
            }
        })
        .ok_or_else(|| error("AVRO_RECORD_TYPE_TARGET", "Field references are malformed"))?;
    refs.push(obj(vec![
        ("role", text("record-type")),
        (
            "module",
            copy_json(get(&request, "recordModule").unwrap(), ctx)?,
        ),
        (
            "element",
            copy_json(get(&request, "recordId").unwrap(), ctx)?,
        ),
    ]));
    validate_target(&target, ctx)?;
    let mut mappings = copy_record_mappings(&record, ctx)?;
    let native_field_value = candidate
        .field
        .native_field
        .tagged_value_preserving_extras(ctx)?;
    let native_members = get(&native_field_value, "members").ok_or_else(|| {
        error(
            "AVRO_RECORD_TYPE_NATIVE",
            "Selected native field is malformed",
        )
    })?;
    let native_type = copy_json(
        get(native_members, "type").ok_or_else(|| {
            error(
                "AVRO_RECORD_TYPE_NATIVE",
                "Selected field has no native type",
            )
        })?,
        ctx,
    )?;
    ctx.charge_work(
        candidate.field.path.len().saturating_add(5),
        Utf16::default(),
    )?;
    let native_field_path = candidate.field.path.to_utf8().map_err(|_| {
        error(
            "AVRO_RECORD_TYPE_NATIVE",
            "Selected field path is not UTF-8",
        )
    })?;
    let native_type_path = format!("{native_field_path}/type");
    let field_path = format!("/modules/{module_index}/elements/{element_index}/kind");
    let mut selected_mapping = vec![
        (k("origin"), text("classified")),
        (k("kind"), text("field")),
        (k("idealPath"), text(&field_path)),
        (
            k("nativePath"),
            Value::String(copy_text(&candidate.field.path, ctx)?),
        ),
        (k("nativeFragment"), copy_json(&native_field_value, ctx)?),
        (k("basis"), text("checked-record-field-membership")),
        (k("outcome"), text("exact")),
    ];
    if let Some(id) = candidate.field.dependency_id.as_ref() {
        selected_mapping.push((k("dependencyId"), Value::String(copy_text(id, ctx)?)));
    }
    mappings.insert(0, Value::Object(selected_mapping));
    let ideal_path =
        format!("/modules/{module_index}/elements/{element_index}/references/{refs_len}");
    let mut record_type_mapping = vec![
        ("origin", text("classified")),
        ("kind", text("record-type")),
        ("idealPath", text(&ideal_path)),
        ("nativePath", text(&native_type_path)),
        ("nativeFragment", native_type),
        ("basis", text("qualified-native-record-type")),
        ("outcome", text("exact")),
    ];
    if let Some(id) = candidate.field.dependency_id.as_ref() {
        record_type_mapping.push(("dependencyId", Value::String(copy_text(id, ctx)?)));
    }
    mappings.push(obj(record_type_mapping));
    let request_copy = request;
    let result = obj(vec![
        ("operation", text("classify-avro-record-type")),
        ("version", text("1.0.0")),
        ("status", text("classified")),
        ("source", source),
        ("target", target),
        ("request", request_copy),
        (
            "binding",
            obj(vec![
                ("id", text("umf.avro.record-type")),
                ("version", text("1.0.0")),
                ("nativeVersion", text("1.12.0")),
                (
                    "subset",
                    text(
                        "Direct record/error definitions and qualified named record references; unions and containers require separate bindings",
                    ),
                ),
            ]),
        ),
        ("mappings", Value::Array(std::mem::take(&mut mappings))),
        ("residuals", Value::Array(Vec::new())),
        ("diagnostics", Value::Array(Vec::new())),
    ]);
    if let Some(issue) = result_schema.validate(&result, ctx)?.first() {
        return Err(EngineError::new(
            "AVRO_RECORD_TYPE_RESULT",
            issue.instance_path.clone(),
            issue.message.clone(),
        ));
    }
    Ok(result)
}

fn locate_field<'a>(
    source: &'a Value,
    id: &Utf16,
) -> Result<(usize, usize, &'a Value), EngineError> {
    let modules = get(source, "modules")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .ok_or_else(|| error("AVRO_RECORD_TYPE_METADATA", "Modules are absent"))?;
    let mi = modules
        .iter()
        .position(|m| get(m, "id").and_then(string) == Some(&k("avro.fields")))
        .ok_or_else(|| error("AVRO_RECORD_TYPE_METADATA", "avro.fields module is absent"))?;
    let elements = get(&modules[mi], "elements")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .ok_or_else(|| {
            error(
                "AVRO_RECORD_TYPE_METADATA",
                "avro.fields elements are absent",
            )
        })?;
    let ei = elements
        .iter()
        .position(|e| get(e, "id").and_then(string) == Some(id))
        .ok_or_else(|| {
            error(
                "AVRO_RECORD_TYPE_COLUMN",
                "Selected field identity is absent",
            )
        })?;
    Ok((mi, ei, &elements[ei]))
}

fn copy_record_mappings(record: &Value, ctx: &mut Context<'_>) -> Result<Vec<Value>, EngineError> {
    let Some(Value::Array(items)) = get(record, "mappings") else {
        return Ok(Vec::new());
    };
    items
        .iter()
        .map(|item| {
            let mut item = copy_json(item, ctx)?;
            if let Value::Object(fields) = &mut item {
                if let Some(dependency_index) =
                    fields.iter().position(|(key, _)| key == &k("dependencyId"))
                {
                    let dependency = fields.remove(dependency_index);
                    let native_index = fields
                        .iter()
                        .position(|(key, _)| key == &k("nativeFragment"))
                        .unwrap_or(fields.len());
                    fields.insert(native_index, dependency);
                }
            }
            Ok(item)
        })
        .collect()
}
fn locate_field_mut(
    target: &mut Value,
    mi: usize,
    ei: usize,
) -> Result<&mut Vec<(Utf16, Value)>, EngineError> {
    let Value::Object(root) = target else {
        return Err(error("AVRO_RECORD_TYPE_TARGET", "Target is not an object"));
    };
    let modules = root
        .iter_mut()
        .find(|(key, _)| key == &k("modules"))
        .and_then(|(_, v)| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .ok_or_else(|| error("AVRO_RECORD_TYPE_TARGET", "Target modules are absent"))?;
    let module = modules
        .get_mut(mi)
        .ok_or_else(|| error("AVRO_RECORD_TYPE_TARGET", "Target module is absent"))?;
    let Value::Object(module) = module else {
        return Err(error(
            "AVRO_RECORD_TYPE_TARGET",
            "Target module is malformed",
        ));
    };
    let elements = module
        .iter_mut()
        .find(|(key, _)| key == &k("elements"))
        .and_then(|(_, v)| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .ok_or_else(|| error("AVRO_RECORD_TYPE_TARGET", "Target elements are absent"))?;
    let element = elements
        .get_mut(ei)
        .ok_or_else(|| error("AVRO_RECORD_TYPE_TARGET", "Target field is absent"))?;
    let Value::Object(element) = element else {
        return Err(error(
            "AVRO_RECORD_TYPE_TARGET",
            "Target field is malformed",
        ));
    };
    Ok(element)
}
fn blocked(
    source: &Value,
    request: &Value,
    column: &Utf16,
    code: &str,
    message: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (_, _, element) = locate_field(source, column)?;
    let value = copy_json(element, ctx)?;
    blocked_with_mappings(
        source,
        request,
        column,
        code,
        message,
        value,
        Vec::new(),
        ctx,
    )
}

fn blocked_unresolved_type(
    source: &Value,
    request: &Value,
    column: &Utf16,
    native_path: &Utf16,
    native_type: Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let authors = get(request, "authors").and_then(|value| match value {
        Value::Array(items) => Some(items.as_slice()),
        _ => None,
    });
    let selected_author = authors.and_then(|items| {
        items.iter().find(|author| {
            get(get(author, "identity").unwrap_or(&Value::Null), "module").and_then(string)
                == Some(&k("avro.fields"))
                && get(get(author, "identity").unwrap_or(&Value::Null), "element").and_then(string)
                    == Some(column)
        })
    });
    let mut field_request = obj(vec![
        ("column", Value::String(copy_text(column, ctx)?)),
        (
            "nativeSource",
            copy_json(
                get(request, "nativeSource")
                    .ok_or_else(|| error("AVRO_RECORD_TYPE_REQUEST", "nativeSource is required"))?,
                ctx,
            )?,
        ),
        (
            "mode",
            copy_json(
                get(request, "mode")
                    .ok_or_else(|| error("AVRO_RECORD_TYPE_REQUEST", "mode is required"))?,
                ctx,
            )?,
        ),
    ]);
    if let Some(dependencies) = get(request, "dependencies") {
        if let Value::Object(fields) = &mut field_request {
            fields.push((k("dependencies"), copy_json(dependencies, ctx)?));
        }
    }
    if let Some(author) = selected_author {
        if let Value::Object(fields) = &mut field_request {
            fields.push((k("author"), copy_json(author, ctx)?));
        }
    }
    let field_result = avro_field_classifier::classify_field(source, &field_request, ctx)?;
    let mappings = match get(&field_result, "mappings") {
        Some(Value::Array(items)) => items
            .iter()
            .map(|item| copy_json(item, ctx))
            .collect::<Result<Vec<_>, _>>()?,
        _ => get(&field_result, "mapping")
            .map(|mapping| copy_json(mapping, ctx))
            .transpose()?
            .into_iter()
            .collect(),
    };
    let (mi, ei, element) = locate_field(source, column)?;
    let mut residuals = Vec::new();
    if let Some(Value::Array(selected_residuals)) = get(&field_result, "residuals") {
        for selected in selected_residuals {
            residuals.push(obj(vec![
                (
                    "path",
                    copy_json(get(selected, "path").ok_or_else(|| error("AVRO_RECORD_TYPE_RECEIPT", "Field residual path is missing"))?, ctx)?,
                ),
                (
                    "value",
                    copy_json(get(selected, "value").ok_or_else(|| error("AVRO_RECORD_TYPE_RECEIPT", "Field residual value is missing"))?, ctx)?,
                ),
                (
                    "reason",
                    copy_json(get(selected, "reason").ok_or_else(|| error("AVRO_RECORD_TYPE_RECEIPT", "Field residual reason is missing"))?, ctx)?,
                ),
                (
                    "recovery",
                    text("Source and native fragments retained; resolve conflict then recompute whole record classification"),
                ),
            ]));
        }
    }
    let reason = "Native type is not a directly resolved record; scalar, union and container structure is retained";
    residuals.push(obj(vec![
        ("path", Value::String(copy_text(native_path, ctx)?)),
        ("value", native_type),
        ("reason", text(reason)),
        (
            "recovery",
            text("Source and native fragments retained; resolve conflict then recompute whole record classification"),
        ),
    ]));
    if get(element, "scalarType").is_some()
        || get(element, "references").is_some_and(|refs| {
            matches!(refs, Value::Array(items) if items.iter().any(|r| get(r, "role").and_then(string) == Some(&k("record-type"))))
        })
    {
        residuals.push(obj(vec![
            ("path", text(&format!("/modules/{mi}/elements/{ei}/kind"))),
            ("value", copy_json(element, ctx)?),
            ("reason", text("Scalar metadata or an existing record-type assertion prevents implicit reconciliation")),
            (
                "recovery",
                text("Source and native fragments retained; resolve conflict then recompute whole record classification"),
            ),
        ]));
    }
    let mut seen = Vec::<Utf16>::new();
    if let Some(authors) = authors {
        for author in authors {
            verify_author(author, source, ctx)?;
            let identity = get(author, "identity").unwrap_or(&Value::Null);
            let module = get(identity, "module").and_then(string);
            let element_id = get(identity, "element").and_then(string);
            let duplicate = element_id.is_some_and(|id| seen.contains(id));
            if module != Some(&k("avro.fields")) || duplicate || element_id != Some(column) {
                let provenance = get(author, "provenance").unwrap_or(&Value::Null);
                residuals.push(obj(vec![
                    (
                        "path",
                        copy_json(
                            get(provenance, "idealPath").ok_or_else(|| error("AVRO_RECORD_TYPE_RECEIPT", "Author idealPath is missing"))?,
                            ctx,
                        )?,
                    ),
                    ("value", copy_json(author, ctx)?),
                    ("reason", text("Duplicate or unrelated author receipt")),
                    (
                        "recovery",
                        text("Source and native fragments retained; resolve conflict then recompute whole record classification"),
                    ),
                ]));
            }
            if let Some(id) = element_id {
                seen.push(id.clone());
            }
        }
    }
    let diagnostics = residuals
        .iter()
        .map(|residual| {
            Ok(obj(vec![
                ("code", text("AVRO_RECORD_TYPE_UNRESOLVED")),
                (
                    "path",
                    copy_json(
                        get(residual, "path").ok_or_else(|| {
                            error("AVRO_RECORD_TYPE_RECEIPT", "Residual path is missing")
                        })?,
                        ctx,
                    )?,
                ),
                (
                    "message",
                    copy_json(
                        get(residual, "reason").ok_or_else(|| {
                            error("AVRO_RECORD_TYPE_RECEIPT", "Residual reason is missing")
                        })?,
                        ctx,
                    )?,
                ),
                ("severity", text("error")),
            ]))
        })
        .collect::<Result<Vec<_>, EngineError>>()?;
    let output = obj(vec![
        ("operation", text("classify-avro-record-type")),
        ("version", text("1.0.0")),
        ("status", text("blocked")),
        ("source", copy_json(source, ctx)?),
        ("request", copy_json(request, ctx)?),
        (
            "binding",
            obj(vec![
                ("id", text("umf.avro.record-type")),
                ("version", text("1.0.0")),
                ("nativeVersion", text("1.12.0")),
                ("subset", text("Direct record/error definitions and qualified named record references; unions and containers require separate bindings")),
            ]),
        ),
        ("mappings", Value::Array(mappings)),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    let (schema, _) = result_schemas(ctx)?;
    if let Some(issue) = schema.validate(&output, ctx)?.first() {
        return Err(EngineError::new(
            "AVRO_RECORD_TYPE_RESULT",
            issue.instance_path.clone(),
            issue.message.clone(),
        ));
    }
    Ok(output)
}

fn blocked_with_mappings(
    source: &Value,
    request: &Value,
    column: &Utf16,
    code: &str,
    message: &str,
    residual_value: Value,
    mappings: Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (mi, ei, _) = locate_field(source, column)?;
    let path = format!("/modules/{mi}/elements/{ei}/kind");
    let output = obj(vec![
        ("operation", text("classify-avro-record-type")),
        ("version", text("1.0.0")),
        ("status", text("blocked")),
        ("source", copy_json(source, ctx)?),
        ("request", copy_json(request, ctx)?),
        (
            "binding",
            obj(vec![
                ("id", text("umf.avro.record-type")),
                ("version", text("1.0.0")),
                ("nativeVersion", text("1.12.0")),
                (
                    "subset",
                    text(
                        "Direct record/error definitions and qualified named record references; unions and containers require separate bindings",
                    ),
                ),
            ]),
        ),
        ("mappings", Value::Array(mappings)),
        (
            "residuals",
            Value::Array(vec![obj(vec![
                ("path", text(&path)),
                ("value", residual_value),
                ("reason", text(message)),
                (
                    "recovery",
                    text(
                        "Source and native fragments retained; resolve conflict then recompute whole record classification",
                    ),
                ),
            ])]),
        ),
        (
            "diagnostics",
            Value::Array(vec![obj(vec![
                ("code", text(code)),
                ("path", text(&path)),
                ("message", text(message)),
                ("severity", text("error")),
            ])]),
        ),
    ]);
    let (result_schema, _) = result_schemas(ctx)?;
    if let Some(issue) = result_schema.validate(&output, ctx)?.first() {
        return Err(EngineError::new(
            "AVRO_RECORD_TYPE_RESULT",
            issue.instance_path.clone(),
            issue.message.clone(),
        ));
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::avro_record_type_recovery::recover_avro_record_type_bundle;
    fn source(schema: &str) -> Value {
        avro_document::import_schema(
            &k("record-type"),
            &schema.encode_utf16().collect::<Vec<_>>(),
            &[],
            &mut Context::ordinary(),
        )
        .unwrap()
    }
    fn req() -> Value {
        obj(vec![
            ("recordModule", text("records")),
            ("recordId", text("customer")),
            ("mode", text("strict")),
            (
                "nativeSource",
                text(
                    r#"{"type":"record","name":"Holder","namespace":"sales","fields":[{"name":"customer","type":{"type":"record","name":"Customer","fields":[{"name":"id","type":"long"}]}}]}"#,
                ),
            ),
            ("column", text(r#"[null,"/fields/0"]"#)),
        ])
    }
    fn set_native_source(request: &mut Value, schema: &str) {
        if let Value::Object(fields) = request {
            if let Some((_, value)) = fields.iter_mut().find(|(key, _)| key == &k("nativeSource")) {
                *value = text(schema);
            }
        }
    }
    fn author_receipt(source: &Value, identity: &str, kind: &str) -> Value {
        let mut ctx = Context::ordinary();
        let engine = Engine::new(
            ResourceSet::new(
                parse(include_str!("../../../spec/core/schema.json"), &mut ctx).unwrap(),
                parse(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    &mut ctx,
                )
                .unwrap(),
                parse(
                    include_str!("../../../spec/core/extension-package.schema.json"),
                    &mut ctx,
                )
                .unwrap(),
                parse(
                    include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                    &mut ctx,
                )
                .unwrap(),
                parse(
                    include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                    &mut ctx,
                )
                .unwrap(),
            ),
            &mut ctx,
        )
        .unwrap();
        let mut registry = Registry::new();
        let resources = engine.schema_resources_with_context(&mut ctx).unwrap();
        registry
            .register(
                &parse(
                    include_str!("../../../spec/extensions/avro/package.json"),
                    &mut ctx,
                )
                .unwrap(),
                None,
                engine.package_schema(),
                &resources,
                &mut ctx,
            )
            .unwrap();
        let mut callbacks = NoCallbacks;
        crate::core_kind::declare_core_kind(
            source,
            &crate::core_kind::Identity {
                module: k("avro.fields"),
                element: k(identity),
            },
            kind,
            &engine,
            &registry,
            &mut callbacks,
            &mut ctx,
        )
        .unwrap()
    }
    #[test]
    fn classifies_direct_record_field_and_retains_source_archive() {
        let schema = r#"{"type":"record","name":"Holder","namespace":"sales","fields":[{"name":"customer","type":{"type":"record","name":"Customer","fields":[{"name":"id","type":"long"}]}}]}"#;
        let source = source(schema);
        let result = classify_avro_record_type(&source, &req(), &mut Context::ordinary()).unwrap();
        assert_eq!(get(&result, "status"), Some(&text("classified")));
        assert_eq!(get(&result, "source"), Some(&source));
        let mappings = get(&result, "mappings")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            })
            .unwrap();
        assert_eq!(get(&mappings[0], "kind"), Some(&text("field")));
        assert_eq!(
            get(mappings.last().unwrap(), "kind"),
            Some(&text("record-type"))
        );
        let (_, _, element) =
            locate_field(get(&result, "target").unwrap(), &k(r#"[null,"/fields/0"]"#)).unwrap();
        assert_eq!(get(element, "kind"), Some(&text("field")));
    }
    #[test]
    fn blocks_union_and_preserves_request() {
        let schema = r#"{"type":"record","name":"Holder","fields":[{"name":"customer","type":["null","string"]}]}"#;
        let source = source(schema);
        let mut request = req();
        if let Value::Object(fields) = &mut request {
            if let Some((_, v)) = fields.iter_mut().find(|(key, _)| key == &k("nativeSource")) {
                *v = text(schema);
            }
        }
        let result =
            classify_avro_record_type(&source, &request, &mut Context::ordinary()).unwrap();
        assert_eq!(get(&result, "status"), Some(&text("blocked")));
        assert_eq!(get(&result, "request"), Some(&request));
    }
    #[test]
    fn author_conflict_is_retained_as_blocked_provenance() {
        let schema = r#"{"type":"record","name":"Holder","namespace":"sales","fields":[{"name":"customer","type":{"type":"record","name":"Customer","fields":[]}}]}"#;
        let source = source(schema);
        let author = author_receipt(&source, r#"[null,"/fields/0"]"#, "record");
        let current = copy_json(get(&author, "target").unwrap(), &mut Context::ordinary()).unwrap();
        let mut request = req();
        set_native_source(&mut request, schema);
        if let Value::Object(fields) = &mut request {
            fields.push((k("authors"), Value::Array(vec![author])));
        }
        let result =
            classify_avro_record_type(&current, &request, &mut Context::ordinary()).unwrap();
        assert_eq!(get(&result, "status"), Some(&text("blocked")));
        assert_eq!(get(&result, "request"), Some(&request));
    }
    #[test]
    fn caller_resource_limit_is_enforced() {
        let schema = r#"{"type":"record","name":"Holder","namespace":"sales","fields":[{"name":"customer","type":{"type":"record","name":"Customer","fields":[]}}]}"#;
        let source = source(schema);
        let mut request = req();
        if let Value::Object(fields) = &mut request {
            if let Some((_, v)) = fields.iter_mut().find(|(key, _)| key == &k("nativeSource")) {
                *v = text(schema);
            }
        }
        let mut limits = Context::ordinary().limits();
        limits.max_values = 1;
        let mut ctx =
            Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
        assert_eq!(
            classify_avro_record_type(&source, &request, &mut ctx)
                .unwrap_err()
                .code,
            "LIMIT"
        );
    }
    #[test]
    fn classifies_qualified_named_dependency_and_keeps_identity() {
        let root_schema = r#"{"type":"record","name":"Holder","namespace":"sales","fields":[{"name":"customer","type":"Customer"}]}"#;
        let dependency_schema = r#"{"type":"record","name":"Customer","namespace":"sales","fields":[{"name":"id","type":"long"}]}"#;
        let dep_id = k("customer-schema");
        let dep = avro_document::AvroDependencySource {
            id: &dep_id,
            schema_json: &dependency_schema.encode_utf16().collect::<Vec<_>>(),
        };
        let source = avro_document::import_schema(
            &k("record-type"),
            &root_schema.encode_utf16().collect::<Vec<_>>(),
            &[dep],
            &mut Context::ordinary(),
        )
        .unwrap();
        let mut request = req();
        if let Value::Object(fields) = &mut request {
            if let Some((_, value)) = fields.iter_mut().find(|(key, _)| key == &k("nativeSource")) {
                *value = text(root_schema);
            }
            fields.push((
                k("dependencies"),
                Value::Array(vec![obj(vec![
                    ("id", text("customer-schema")),
                    ("schema", text(dependency_schema)),
                ])]),
            ));
        }
        let result =
            classify_avro_record_type(&source, &request, &mut Context::ordinary()).unwrap();
        assert_eq!(get(&result, "status"), Some(&text("classified")));
        let mappings = get(&result, "mappings")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            })
            .unwrap();
        // The selected Field belongs to the root; its named Record declaration
        // belongs to the dependency. Their provenance must remain distinct.
        assert_eq!(get(mappings.last().unwrap(), "dependencyId"), None);
        let record_mapping = mappings
            .iter()
            .find(|mapping| get(mapping, "kind") == Some(&text("record")))
            .unwrap();
        assert_eq!(
            get(record_mapping, "dependencyId"),
            Some(&text("customer-schema"))
        );
        assert_eq!(
            get(mappings.last().unwrap(), "nativePath"),
            Some(&text("/fields/0/type"))
        );
    }
    #[test]
    fn refuses_to_replace_an_existing_field_assertion() {
        let schema = r#"{"type":"record","name":"Holder","namespace":"sales","fields":[{"name":"customer","type":{"type":"record","name":"Customer","fields":[]}}]}"#;
        let mut source = source(schema);
        let (mi, ei, _) = locate_field(&source, &k(r#"[null,"/fields/0"]"#)).unwrap();
        let element = locate_field_mut(&mut source, mi, ei).unwrap();
        element.push((k("kind"), text("field")));
        let mut request = req();
        if let Value::Object(fields) = &mut request {
            if let Some((_, v)) = fields.iter_mut().find(|(key, _)| key == &k("nativeSource")) {
                *v = text(schema);
            }
        }
        let result =
            classify_avro_record_type(&source, &request, &mut Context::ordinary()).unwrap();
        assert_eq!(get(&result, "status"), Some(&text("blocked")));
        assert_eq!(get(&result, "source"), Some(&source));
        assert!(get(&result, "target").is_none());
    }

    #[test]
    fn accepts_verified_selected_field_and_direct_member_authors_and_recovers_exact_source() {
        let schema = r#"{"type":"record","name":"Holder","namespace":"sales","fields":[{"name":"customer","type":{"type":"record","name":"Customer","fields":[{"name":"id","type":"long"}]}}]}"#;
        let base = source(schema);
        let mut request = req();
        set_native_source(&mut request, schema);
        let selected = author_receipt(&base, r#"[null,"/fields/0"]"#, "field");
        let source =
            copy_json(get(&selected, "target").unwrap(), &mut Context::ordinary()).unwrap();
        if let Value::Object(fields) = &mut request {
            fields.push((k("authors"), Value::Array(vec![selected])));
        }

        let result =
            classify_avro_record_type(&source, &request, &mut Context::ordinary()).unwrap();
        assert_eq!(get(&result, "status"), Some(&text("classified")));
        let recovered = recover_avro_record_type_bundle(
            &result,
            get(&result, "target").unwrap(),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(get(&recovered, "schema"), Some(&text(schema)));
        assert_eq!(
            get(&recovered, "dependencies"),
            Some(&Value::Array(Vec::new()))
        );

        let member = author_receipt(&base, r#"[null,"/fields/0/type/fields/0"]"#, "field");
        let member_source =
            copy_json(get(&member, "target").unwrap(), &mut Context::ordinary()).unwrap();
        let mut member_request = req();
        set_native_source(&mut member_request, schema);
        if let Value::Object(fields) = &mut member_request {
            fields.push((k("authors"), Value::Array(vec![member])));
        }
        let member_result =
            classify_avro_record_type(&member_source, &member_request, &mut Context::ordinary())
                .unwrap();
        assert_eq!(get(&member_result, "status"), Some(&text("classified")));
    }

    #[test]
    fn blocks_conflicting_duplicate_unrelated_and_forged_author_receipts() {
        let schema = r#"{"type":"record","name":"Holder","namespace":"sales","fields":[{"name":"customer","type":{"type":"record","name":"Customer","fields":[{"name":"id","type":"long"}]}},{"name":"other","type":"string"}]}"#;
        let base = source(schema);
        let selected_id = r#"[null,"/fields/0"]"#;
        let member_id = r#"[null,"/fields/0/type/fields/0"]"#;
        let other_id = r#"[null,"/fields/1"]"#;
        let conflict = author_receipt(&base, selected_id, "record");
        let conflict_source =
            copy_json(get(&conflict, "target").unwrap(), &mut Context::ordinary()).unwrap();
        let member = author_receipt(&base, member_id, "field");
        let member_source =
            copy_json(get(&member, "target").unwrap(), &mut Context::ordinary()).unwrap();
        let unrelated = author_receipt(&base, other_id, "field");
        let unrelated_source =
            copy_json(get(&unrelated, "target").unwrap(), &mut Context::ordinary()).unwrap();
        let cases = [
            ("conflicting", conflict_source, vec![conflict]),
            ("duplicate", member_source, vec![member.clone(), member]),
            ("unrelated", unrelated_source, vec![unrelated.clone()]),
        ];
        for (name, current, authors) in cases {
            let mut request = req();
            set_native_source(&mut request, schema);
            if let Value::Object(fields) = &mut request {
                fields.push((k("authors"), Value::Array(authors)));
            }
            let result =
                classify_avro_record_type(&current, &request, &mut Context::ordinary()).unwrap();
            assert_eq!(get(&result, "status"), Some(&text("blocked")), "{name}");
            assert_eq!(get(&result, "source"), Some(&current), "{name}");
            assert_eq!(get(&result, "request"), Some(&request), "{name}");
        }

        let mut forged = author_receipt(&base, selected_id, "field");
        let forged_source =
            copy_json(get(&forged, "target").unwrap(), &mut Context::ordinary()).unwrap();
        if let Value::Object(fields) = &mut forged {
            let target = fields
                .iter_mut()
                .find(|(key, _)| key == &k("target"))
                .map(|(_, value)| value)
                .unwrap();
            let element = locate_field_mut(target, 1, 0).unwrap();
            element
                .iter_mut()
                .find(|(key, _)| key == &k("kind"))
                .unwrap()
                .1 = text("record");
        }
        let mut request = req();
        set_native_source(&mut request, schema);
        if let Value::Object(fields) = &mut request {
            fields.push((k("authors"), Value::Array(vec![forged])));
        }
        let error = classify_avro_record_type(&forged_source, &request, &mut Context::ordinary())
            .unwrap_err();
        assert_eq!(error.code, "CORE_KIND_RECEIPT", "forged");

        let mut stale_request = req();
        set_native_source(&mut stale_request, schema);
        if let Value::Object(fields) = &mut stale_request {
            fields.push((k("authors"), Value::Array(vec![unrelated])));
        }
        let stale =
            classify_avro_record_type(&base, &stale_request, &mut Context::ordinary()).unwrap_err();
        assert_eq!(stale.code, "CORE_KIND_STALE", "unrelated");
    }

    #[test]
    fn frozen_author_cases_match_classified_and_blocked_dispositions() {
        fn mapping_signature(value: &Value) -> Vec<Vec<Value>> {
            get(value, "mappings")
                .and_then(|v| {
                    if let Value::Array(a) = v {
                        Some(a)
                    } else {
                        None
                    }
                })
                .unwrap()
                .iter()
                .map(|mapping| {
                    ["kind", "idealPath", "nativePath", "outcome"]
                        .iter()
                        .map(|key| get(mapping, key).cloned().unwrap_or(Value::Null))
                        .collect()
                })
                .collect()
        }
        let mut ctx = Context::ordinary();
        let packet = parse(
            include_str!("../../../docs/helix/04-build/evidence/rust-migration/r8-avro-record-type/typescript-predecessor.json"),
            &mut ctx,
        )
        .unwrap();
        let outcomes = get(&packet, "outcomes").unwrap();
        let controls = get(outcomes, "controls/authors-tamper-recovery").unwrap();

        let valid = get(controls, "valid").unwrap();
        let expected_valid = get(valid, "result").unwrap();
        let valid_source = get(expected_valid, "source").unwrap();
        let valid_request = get(expected_valid, "request").unwrap();
        let actual_valid =
            classify_avro_record_type(valid_source, valid_request, &mut Context::ordinary())
                .unwrap();
        assert_eq!(get(&actual_valid, "status"), get(expected_valid, "status"));
        let expected_kinds = get(expected_valid, "mappings")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            })
            .unwrap()
            .iter()
            .map(|mapping| get(mapping, "kind").cloned().unwrap())
            .collect::<Vec<_>>();
        let actual_kinds = get(&actual_valid, "mappings")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            })
            .unwrap()
            .iter()
            .map(|mapping| get(mapping, "kind").cloned().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(actual_kinds, expected_kinds);

        let duplicate = get(controls, "duplicate").unwrap();
        let expected_duplicate = get(duplicate, "value").unwrap();
        let duplicate_source = get(expected_duplicate, "source").unwrap();
        let duplicate_request = get(expected_duplicate, "request").unwrap();
        let actual_duplicate = classify_avro_record_type(
            duplicate_source,
            duplicate_request,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(
            get(&actual_duplicate, "status"),
            get(expected_duplicate, "status")
        );
        assert_eq!(get(&actual_duplicate, "source"), Some(duplicate_source));
        assert_eq!(get(&actual_duplicate, "request"), Some(duplicate_request));
        assert_eq!(
            mapping_signature(&actual_duplicate),
            mapping_signature(expected_duplicate)
        );
        assert_eq!(
            get(&actual_duplicate, "residuals"),
            get(expected_duplicate, "residuals")
        );
        assert_eq!(
            get(&actual_duplicate, "diagnostics"),
            get(expected_duplicate, "diagnostics")
        );

        let conflicting = get(controls, "conflicting").unwrap();
        let expected_conflicting = get(conflicting, "value").unwrap();
        let actual_conflicting = classify_avro_record_type(
            get(expected_conflicting, "source").unwrap(),
            get(expected_conflicting, "request").unwrap(),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(get(&actual_conflicting, "status"), Some(&text("blocked")));
        assert_eq!(
            mapping_signature(&actual_conflicting),
            mapping_signature(expected_conflicting)
        );
        assert_eq!(
            get(&actual_conflicting, "residuals"),
            get(expected_conflicting, "residuals")
        );
        assert_eq!(
            get(&actual_conflicting, "diagnostics"),
            get(expected_conflicting, "diagnostics")
        );
    }

    #[test]
    fn matrix_predecessor_full_results_and_recoveries_match() {
        fn canonical(value: &Value) -> Value {
            match value {
                Value::Array(items) => Value::Array(items.iter().map(canonical).collect()),
                Value::Object(fields) => {
                    let mut fields = fields
                        .iter()
                        .map(|(key, value)| (key.clone(), canonical(value)))
                        .collect::<Vec<_>>();
                    fields.sort_by(|a, b| a.0.cmp(&b.0));
                    Value::Object(fields)
                }
                _ => value.clone(),
            }
        }
        fn first_difference(a: &Value, b: &Value, path: &str) -> Option<String> {
            match (a, b) {
                (Value::Object(af), Value::Object(bf)) => {
                    if af.len() != bf.len() {
                        return Some(format!(
                            "{path}: object lengths {} != {}",
                            af.len(),
                            bf.len()
                        ));
                    }
                    for (key, av) in af {
                        let Some((_, bv)) = bf.iter().find(|(other, _)| other == key) else {
                            return Some(format!(
                                "{path}/{}: key absent",
                                key.to_utf8().unwrap_or_default()
                            ));
                        };
                        if let Some(diff) = first_difference(
                            av,
                            bv,
                            &format!("{path}/{}", key.to_utf8().unwrap_or_default()),
                        ) {
                            return Some(diff);
                        }
                    }
                    None
                }
                (Value::Array(aa), Value::Array(ba)) => {
                    if aa.len() != ba.len() {
                        return Some(format!(
                            "{path}: array lengths {} != {}",
                            aa.len(),
                            ba.len()
                        ));
                    }
                    aa.iter()
                        .zip(ba)
                        .enumerate()
                        .find_map(|(i, (av, bv))| first_difference(av, bv, &format!("{path}/{i}")))
                }
                _ if a == b => None,
                _ => Some(format!("{path}: actual {a:?}; expected {b:?}")),
            }
        }
        let mut ctx = Context::ordinary();
        let packet = parse(
            include_str!("../../../docs/helix/04-build/evidence/rust-migration/r8-avro-record-type/typescript-predecessor.json"),
            &mut ctx,
        )
        .unwrap();
        let outcomes = get(&packet, "outcomes").unwrap();
        let Value::Object(cases) = outcomes else {
            panic!("predecessor outcomes are not an object");
        };
        let mut compared = 0;
        let mut differences = Vec::new();
        for (name, case) in cases
            .iter()
            .filter(|(name, _)| name.units().starts_with(k("matrix/").units()))
        {
            let expected = get(case, "result").expect("matrix case has result");
            let source = get(expected, "source").expect("result has source");
            let request = get(expected, "request").expect("result has request");
            let actual = classify_avro_record_type(source, request, &mut Context::ordinary())
                .unwrap_or_else(|error| panic!("{name:?}: {error:?}"));
            assert_eq!(
                get(&actual, "mappings"),
                get(expected, "mappings"),
                "ordered mapping array differs for {name:?}"
            );
            let expected = canonical(expected);
            if let Some(diff) = first_difference(&canonical(&actual), &expected, "") {
                differences.push(format!("{name:?}: {diff}"));
            }
            if get(&actual, "status").and_then(string) == Some(&k("classified")) {
                let current = get(&actual, "target").expect("classified result has a target");
                let recovered =
                    recover_avro_record_type_bundle(&actual, current, &mut Context::ordinary())
                        .unwrap_or_else(|error| panic!("{name:?}: recovery failed: {error:?}"));
                let expected_recovery = get(
                    get(case, "recovery").expect("matrix case has recovery"),
                    "json",
                )
                .expect("matrix case has JSON recovery");
                if let Some(diff) = first_difference(
                    &canonical(&recovered),
                    &canonical(expected_recovery),
                    "/recovery",
                ) {
                    differences.push(format!("{name:?}: {diff}"));
                }
            }
            compared += 1;
        }
        assert_eq!(
            compared, 30,
            "all strict/report predecessor full-result cases run"
        );
        assert!(differences.is_empty(), "{}", differences.join("\n"));
    }

    #[test]
    fn frozen_matrix_mapping_arrays_match_predecessor_exactly() {
        let mut ctx = Context::ordinary();
        let packet = parse(
            include_str!("../../../docs/helix/04-build/evidence/rust-migration/r8-avro-record-type/typescript-predecessor.json"),
            &mut ctx,
        )
        .unwrap();
        let outcomes = get(&packet, "outcomes").unwrap();
        let Value::Object(cases) = outcomes else {
            panic!("predecessor outcomes are not an object");
        };
        let mut compared = 0;
        for (name, case) in cases
            .iter()
            .filter(|(name, _)| name.units().starts_with(k("matrix/").units()))
        {
            let expected = get(case, "result").expect("matrix case has result");
            let source = get(expected, "source").expect("result has source");
            let request = get(expected, "request").expect("result has request");
            let actual = classify_avro_record_type(source, request, &mut Context::ordinary())
                .unwrap_or_else(|error| panic!("{name:?}: {error:?}"));
            assert_eq!(
                get(&actual, "mappings"),
                get(expected, "mappings"),
                "ordered mapping array differs for {name:?}"
            );
            compared += 1;
        }
        assert_eq!(
            compared, 30,
            "all strict/report predecessor matrix cases run"
        );
    }
}

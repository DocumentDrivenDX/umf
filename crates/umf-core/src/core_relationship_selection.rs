// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in, retained-source selection for authored core relationship metadata.
//! Navigation is presentation metadata only and does not model instance edges.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::{Diagnostic, EngineError, Severity},
    registry::Registry,
    serialization::stringify_compact_metered,
    value::{Utf16, Value},
};
use std::collections::HashMap;

const SELECTION_SCHEMA: &str =
    include_str!("../../../spec/core/relationship-metadata-selection-v2.schema.json");

fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn text(s: &str) -> Value {
    Value::String(k(s))
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
/// Look up an object property while charging every ordered key comparison.
/// Unknown extension fields are retained, so no source-side object is assumed
/// to have a small number of properties.
fn get_metered<'a>(
    value: &'a Value,
    name: &str,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    let Value::Object(fields) = value else {
        return Ok(None);
    };
    let name = k(name);
    for (key, item) in fields {
        ctx.charge_work(
            key.len().saturating_add(name.len()).max(1),
            Utf16::default(),
        )?;
        if key == &name {
            return Ok(Some(item));
        }
    }
    Ok(None)
}
fn string(value: &Value) -> Option<&Utf16> {
    if let Value::String(value) = value {
        Some(value)
    } else {
        None
    }
}
fn err(code: &str, message: impl Into<String>, path: &str) -> EngineError {
    EngineError::new(code, k(path), message.into())
}
fn child_path(path: &Utf16, key: &Utf16) -> Utf16 {
    let mut units = path.units().to_vec();
    units.push(b'/' as u16);
    for unit in key.units() {
        match unit {
            0x7e => units.extend([0x7e, 0x30]),
            0x2f => units.extend([0x7e, 0x31]),
            other => units.push(*other),
        }
    }
    Utf16::new(units)
}

fn copy_limited(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    fn visit(
        value: &Value,
        path: &Utf16,
        depth: usize,
        count: &mut usize,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        ctx.charge_work(1, path.clone())?;
        *count = count.saturating_add(1);
        if *count > ctx.limits().max_values || depth > ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                path.clone(),
                "JSON structural limit exceeded",
            ));
        }
        match value {
            Value::Null => Ok(Value::Null),
            Value::Bool(value) => Ok(Value::Bool(*value)),
            Value::Number(value) => Value::number(*value, path.clone()),
            Value::String(value) => {
                ctx.charge_work(value.len(), path.clone())?;
                Ok(Value::String(value.clone()))
            }
            Value::Array(items) => {
                let mut result = Vec::new();
                for (index, item) in items.iter().enumerate() {
                    result.push(visit(
                        item,
                        &child_path(path, &k(&index.to_string())),
                        depth + 1,
                        count,
                        ctx,
                    )?);
                }
                Ok(Value::Array(result))
            }
            Value::Object(fields) => {
                let mut result = Vec::new();
                for (key, item) in fields {
                    ctx.charge_work(key.len(), path.clone())?;
                    result.push((
                        key.clone(),
                        visit(item, &child_path(path, key), depth + 1, count, ctx)?,
                    ));
                }
                Ok(Value::Object(result))
            }
        }
    }
    visit(value, &Utf16::default(), 0, &mut 0, ctx)
}

fn diagnostics_value(diagnostics: &[Diagnostic]) -> Value {
    Value::Array(
        diagnostics
            .iter()
            .map(|d| {
                obj(vec![
                    ("code", Value::String(d.code.clone())),
                    ("path", Value::String(d.path.clone())),
                    ("message", Value::String(d.message.clone())),
                    (
                        "severity",
                        text(if d.severity == Severity::Warning {
                            "warning"
                        } else {
                            "error"
                        }),
                    ),
                ])
            })
            .collect(),
    )
}
fn query_refusal() -> EngineError {
    err(
        "RELATIONSHIP_SELECTION_QUERY",
        "Expected exact relationship metadata filters",
        "",
    )
}
fn validate_schema(
    schema: &Value,
    value: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let resources = engine.schema_resources_with_context(ctx)?;
    let compiled = crate::schema::CompiledSchema::compile(schema, &resources, ctx)?;
    Ok(compiled.validate(value, ctx)?.is_empty())
}
fn schema_value(ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    crate::serialization::read_json_value(
        &SELECTION_SCHEMA.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        ctx,
    )
}
fn validate_result(
    value: &Value,
    schema: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let resources = engine.schema_resources_with_context(ctx)?;
    let compiled = crate::schema::CompiledSchema::compile(schema, &resources, ctx)?;
    if let Some(problem) = compiled.validate(value, ctx)?.first() {
        return Err(EngineError::new(
            "RELATIONSHIP_SELECTION_RESULT",
            problem.instance_path.clone(),
            problem.message.to_utf8().unwrap_or_default(),
        ));
    }
    Ok(())
}

type EndpointId = (Utf16, Utf16);
fn endpoint_id(value: &Value) -> Option<EndpointId> {
    Some((
        get(value, "module").and_then(string)?.clone(),
        get(value, "element").and_then(string)?.clone(),
    ))
}
fn endpoint_id_metered(
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<EndpointId>, EngineError> {
    let module = get_metered(value, "module", ctx)?.and_then(string).cloned();
    let element = get_metered(value, "element", ctx)?
        .and_then(string)
        .cloned();
    let (Some(module), Some(element)) = (module, element) else {
        return Ok(None);
    };
    ctx.charge_work(module.len().saturating_add(element.len()), Utf16::default())?;
    Ok(Some((module, element)))
}
fn endpoint_value(module: &Utf16, element: &Utf16) -> Value {
    Value::Object(vec![
        (k("module"), Value::String(module.clone())),
        (k("element"), Value::String(element.clone())),
    ])
}
fn endpoint_entry(reference: &Value, path: &Utf16) -> Value {
    obj(vec![
        ("reference", reference.clone()),
        ("recordPath", Value::String(path.clone())),
    ])
}
fn matches_end(
    filter: Option<&Vec<EndpointId>>,
    values: &Value,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let Some(filters) = filter else {
        return Ok(true);
    };
    let Value::Array(values) = values else {
        return Ok(false);
    };
    for value in values {
        let Some(id) = endpoint_id_metered(value, ctx)? else {
            continue;
        };
        for candidate in filters {
            ctx.charge_work(
                id.0.len()
                    .saturating_add(id.1.len())
                    .saturating_add(candidate.0.len())
                    .saturating_add(candidate.1.len())
                    .max(1),
                Utf16::default(),
            )?;
            if id == *candidate {
                return Ok(true);
            }
        }
    }
    Ok(false)
}
fn contains_string(
    filters: &[Utf16],
    value: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    for candidate in filters {
        ctx.charge_work(
            value.len().saturating_add(candidate.len()).max(1),
            Utf16::default(),
        )?;
        if candidate == value {
            return Ok(true);
        }
    }
    Ok(false)
}
fn contains_identity(
    filters: &[(Utf16, Utf16)],
    module: &Utf16,
    id: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    for (candidate_module, candidate_id) in filters {
        ctx.charge_work(
            module
                .len()
                .saturating_add(id.len())
                .saturating_add(candidate_module.len())
                .saturating_add(candidate_id.len())
                .max(1),
            Utf16::default(),
        )?;
        if candidate_module == module && candidate_id == id {
            return Ok(true);
        }
    }
    Ok(false)
}
fn filter_strings(
    query: &Value,
    name: &str,
    ctx: &mut Context<'_>,
) -> Result<Option<Vec<Utf16>>, EngineError> {
    let Some(value) = get_metered(query, name, ctx)? else {
        return Ok(None);
    };
    let Value::Array(values) = value else {
        return Err(query_refusal());
    };
    let mut result = Vec::new();
    for value in values {
        ctx.charge_work(1, Utf16::default())?;
        let Some(value) = string(value) else {
            return Err(query_refusal());
        };
        ctx.charge_work(value.len(), Utf16::default())?;
        result.push(value.clone());
    }
    Ok(Some(result))
}
fn filter_endpoints(
    query: &Value,
    name: &str,
    ctx: &mut Context<'_>,
) -> Result<Option<Vec<EndpointId>>, EngineError> {
    let Some(value) = get_metered(query, name, ctx)? else {
        return Ok(None);
    };
    let Value::Array(values) = value else {
        return Err(query_refusal());
    };
    let mut result = Vec::new();
    for value in values {
        ctx.charge_work(1, Utf16::default())?;
        let Some(id) = endpoint_id_metered(value, ctx)? else {
            return Err(query_refusal());
        };
        result.push(id);
    }
    Ok(Some(result))
}
fn filter_identities(
    query: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<Vec<EndpointId>>, EngineError> {
    let Some(value) = get_metered(query, "identities", ctx)? else {
        return Ok(None);
    };
    let Value::Array(values) = value else {
        return Err(query_refusal());
    };
    let mut result = Vec::new();
    for value in values {
        ctx.charge_work(1, Utf16::default())?;
        let module = get_metered(value, "module", ctx)?
            .and_then(string)
            .cloned()
            .ok_or_else(query_refusal)?;
        let id = get_metered(value, "id", ctx)?
            .and_then(string)
            .cloned()
            .ok_or_else(query_refusal)?;
        ctx.charge_work(
            module.len().saturating_add(id.len()).max(1),
            Utf16::default(),
        )?;
        result.push((module, id));
    }
    Ok(Some(result))
}

/// Select authored relationship metadata from a copied and validated 0.10.0
/// source. Filters use exact identities; navigation describes authored
/// presentation only and never asserts native enforcement.
pub fn select_core_relationships(
    input: &Value,
    query_input: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_limited(input, ctx)?;
    let query = copy_limited(query_input, ctx)?;
    let schema = schema_value(ctx)?;
    let query_schema = get(
        get(&schema, "$defs")
            .ok_or_else(|| err("RELATIONSHIP_SELECTION_SCHEMA", "Missing definitions", ""))?,
        "query",
    )
    .ok_or_else(|| err("RELATIONSHIP_SELECTION_SCHEMA", "Missing query schema", ""))?;
    if !validate_schema(query_schema, &query, engine, ctx)? {
        return Err(query_refusal());
    }

    let validation = engine.validate_document(&source, registry, capabilities, ctx)?;
    if !validation.valid
        || get_metered(&source, "umf", ctx)?
            .and_then(string)
            .is_none_or(|v| v != &k("0.10.0"))
    {
        let diags = diagnostics_value(&validation.diagnostics);
        let message = stringify_compact_metered(&diags, ctx)?
            .to_utf8()
            .unwrap_or_default();
        return Err(err(
            "RELATIONSHIP_SELECTION_SOURCE",
            format!("Expected valid current core 0.10.0 document: {message}"),
            "",
        ));
    }
    let modules = match get_metered(&source, "modules", ctx)? {
        Some(Value::Array(v)) => v,
        _ => {
            return Err(err(
                "RELATIONSHIP_SELECTION_SOURCE",
                "Expected valid current core 0.10.0 document: []",
                "",
            ));
        }
    };
    let module_filter = filter_strings(&query, "modules", ctx)?;
    let name_filter = filter_strings(&query, "names", ctx)?;
    let identity_filter = filter_identities(&query, ctx)?;
    let source_filter = filter_endpoints(&query, "sources", ctx)?;
    let target_filter = filter_endpoints(&query, "targets", ctx)?;

    let mut records: HashMap<EndpointId, (Utf16, &Value)> = HashMap::new();
    for (mi, module) in modules.iter().enumerate() {
        let module_id = get_metered(module, "id", ctx)?
            .and_then(string)
            .ok_or_else(|| {
                err(
                    "RELATIONSHIP_SELECTION_SOURCE",
                    "Expected valid current core 0.10.0 document: []",
                    "",
                )
            })?;
        if let Some(Value::Array(elements)) = get_metered(module, "elements", ctx)? {
            for (ei, element) in elements.iter().enumerate() {
                if let Some(element_id) = get_metered(element, "id", ctx)?.and_then(string) {
                    ctx.charge_work(
                        module_id.len().saturating_add(element_id.len()).max(1),
                        Utf16::default(),
                    )?;
                    records.insert(
                        (module_id.clone(), element_id.clone()),
                        (k(&format!("/modules/{mi}/elements/{ei}")), element),
                    );
                }
            }
        }
    }
    let mut selected = Vec::new();
    for (mi, module) in modules.iter().enumerate() {
        let module_id = get_metered(module, "id", ctx)?
            .and_then(string)
            .ok_or_else(|| {
                err(
                    "RELATIONSHIP_SELECTION_SOURCE",
                    "Missing module identity",
                    "/modules",
                )
            })?;
        let Some(Value::Array(relationships)) = get_metered(module, "relationships", ctx)? else {
            continue;
        };
        for (ri, relationship) in relationships.iter().enumerate() {
            ctx.charge_work(1, Utf16::default())?;
            let name = get_metered(relationship, "name", ctx)?
                .and_then(string)
                .ok_or_else(|| {
                    err(
                        "RELATIONSHIP_SELECTION_SOURCE",
                        "Missing relationship name",
                        "/modules",
                    )
                })?;
            let id = get_metered(relationship, "id", ctx)?
                .and_then(string)
                .ok_or_else(|| {
                    err(
                        "RELATIONSHIP_SELECTION_SOURCE",
                        "Missing relationship identity",
                        "/modules",
                    )
                })?;
            if let Some(filter) = module_filter.as_ref() {
                if !contains_string(filter, module_id, ctx)? {
                    continue;
                }
            }
            if let Some(filter) = name_filter.as_ref() {
                if !contains_string(filter, name, ctx)? {
                    continue;
                }
            }
            if let Some(filter) = identity_filter.as_ref() {
                if !contains_identity(filter, module_id, id, ctx)? {
                    continue;
                }
            }
            if !matches_end(
                source_filter.as_ref(),
                get_metered(relationship, "source", ctx)?.unwrap_or(&Value::Null),
                ctx,
            )? {
                continue;
            }
            if !matches_end(
                target_filter.as_ref(),
                get_metered(relationship, "target", ctx)?.unwrap_or(&Value::Null),
                ctx,
            )? {
                continue;
            }
            let path = k(&format!("/modules/{mi}/relationships/{ri}"));
            let source_endpoints = get_metered(relationship, "source", ctx)?
                .and_then(|v| {
                    if let Value::Array(a) = v {
                        Some(a)
                    } else {
                        None
                    }
                })
                .ok_or_else(|| {
                    err(
                        "RELATIONSHIP_SELECTION_SOURCE",
                        "Missing relationship sources",
                        "/modules",
                    )
                })?;
            let target_endpoints = get_metered(relationship, "target", ctx)?
                .and_then(|v| {
                    if let Value::Array(a) = v {
                        Some(a)
                    } else {
                        None
                    }
                })
                .ok_or_else(|| {
                    err(
                        "RELATIONSHIP_SELECTION_SOURCE",
                        "Missing relationship targets",
                        "/modules",
                    )
                })?;
            let sources = source_endpoints
                .iter()
                .map(|endpoint| {
                    let ref_id = endpoint_id_metered(endpoint, ctx)?.ok_or_else(|| {
                        err(
                            "RELATIONSHIP_SELECTION_SOURCE",
                            "Invalid source endpoint",
                            "",
                        )
                    })?;
                    ctx.charge_work(
                        ref_id.0.len().saturating_add(ref_id.1.len()).max(1),
                        Utf16::default(),
                    )?;
                    let (record_path, _) = records.get(&ref_id).ok_or_else(|| {
                        err(
                            "RELATIONSHIP_SELECTION_SOURCE",
                            "Missing source endpoint record",
                            "",
                        )
                    })?;
                    Ok(endpoint_entry(endpoint, record_path))
                })
                .collect::<Result<Vec<_>, EngineError>>()?;
            let targets = target_endpoints
                .iter()
                .map(|endpoint| {
                    let ref_id = endpoint_id_metered(endpoint, ctx)?.ok_or_else(|| {
                        err(
                            "RELATIONSHIP_SELECTION_SOURCE",
                            "Invalid target endpoint",
                            "",
                        )
                    })?;
                    ctx.charge_work(
                        ref_id.0.len().saturating_add(ref_id.1.len()).max(1),
                        Utf16::default(),
                    )?;
                    let (record_path, record) = records.get(&ref_id).ok_or_else(|| {
                        err(
                            "RELATIONSHIP_SELECTION_SOURCE",
                            "Missing target endpoint record",
                            "",
                        )
                    })?;
                    let key_id = get_metered(endpoint, "key", ctx)?
                        .and_then(string)
                        .ok_or_else(|| {
                            err("RELATIONSHIP_SELECTION_SOURCE", "Missing target key", "")
                        })?;
                    let keys = get_metered(record, "keys", ctx)?
                        .and_then(|v| {
                            if let Value::Array(a) = v {
                                Some(a)
                            } else {
                                None
                            }
                        })
                        .ok_or_else(|| {
                            err("RELATIONSHIP_SELECTION_SOURCE", "Missing target keys", "")
                        })?;
                    let mut key_index = None;
                    for (index, candidate) in keys.iter().enumerate() {
                        let candidate_id = get_metered(candidate, "id", ctx)?.and_then(string);
                        ctx.charge_work(
                            key_id
                                .len()
                                .saturating_add(candidate_id.map_or(0, Utf16::len))
                                .max(1),
                            Utf16::default(),
                        )?;
                        if candidate_id == Some(key_id) {
                            key_index = Some(index);
                            break;
                        }
                    }
                    let key_index = key_index.ok_or_else(|| {
                        err("RELATIONSHIP_SELECTION_SOURCE", "Missing target key", "")
                    })?;
                    Ok(obj(vec![
                        ("reference", endpoint.clone()),
                        ("recordPath", Value::String(record_path.clone())),
                        (
                            "keyPath",
                            Value::String(k(&format!(
                                "{}/keys/{key_index}",
                                record_path.to_utf8().unwrap_or_default()
                            ))),
                        ),
                    ]))
                })
                .collect::<Result<Vec<_>, EngineError>>()?;
            let bare = |endpoint: &Value| -> Result<Value, EngineError> {
                let (module, element) = endpoint_id(endpoint).ok_or_else(|| {
                    err(
                        "RELATIONSHIP_SELECTION_SOURCE",
                        "Invalid navigation endpoint",
                        "",
                    )
                })?;
                Ok(endpoint_value(&module, &element))
            };
            let forward_name = name.clone();
            let forward_from = source_endpoints
                .iter()
                .map(|endpoint| {
                    let id = endpoint_id_metered(endpoint, ctx)?.ok_or_else(|| {
                        err(
                            "RELATIONSHIP_SELECTION_SOURCE",
                            "Invalid navigation endpoint",
                            "",
                        )
                    })?;
                    ctx.charge_work(
                        id.0.len().saturating_add(id.1.len()).max(1),
                        Utf16::default(),
                    )?;
                    bare(endpoint)
                })
                .collect::<Result<Vec<_>, EngineError>>()?;
            let forward_to = target_endpoints
                .iter()
                .map(|endpoint| {
                    let id = endpoint_id_metered(endpoint, ctx)?.ok_or_else(|| {
                        err(
                            "RELATIONSHIP_SELECTION_SOURCE",
                            "Invalid navigation endpoint",
                            "",
                        )
                    })?;
                    ctx.charge_work(
                        id.0.len().saturating_add(id.1.len()).max(1),
                        Utf16::default(),
                    )?;
                    bare(endpoint)
                })
                .collect::<Result<Vec<_>, EngineError>>()?;
            let forward = obj(vec![
                ("name", Value::String(forward_name)),
                ("from", Value::Array(forward_from)),
                ("to", Value::Array(forward_to)),
            ]);
            let directed = get_metered(relationship, "directed", ctx)?
                .is_some_and(|v| *v == Value::Bool(true));
            let inverse = get_metered(relationship, "inverse", ctx)?;
            let reverse = if inverse.is_some() || !directed {
                let reverse_name = inverse.cloned().unwrap_or(Value::Null);
                let reverse_from = target_endpoints
                    .iter()
                    .map(|endpoint| {
                        let id = endpoint_id_metered(endpoint, ctx)?.ok_or_else(|| {
                            err(
                                "RELATIONSHIP_SELECTION_SOURCE",
                                "Invalid navigation endpoint",
                                "",
                            )
                        })?;
                        ctx.charge_work(
                            id.0.len().saturating_add(id.1.len()).max(1),
                            Utf16::default(),
                        )?;
                        bare(endpoint)
                    })
                    .collect::<Result<Vec<_>, EngineError>>()?;
                let reverse_to = source_endpoints
                    .iter()
                    .map(|endpoint| {
                        let id = endpoint_id_metered(endpoint, ctx)?.ok_or_else(|| {
                            err(
                                "RELATIONSHIP_SELECTION_SOURCE",
                                "Invalid navigation endpoint",
                                "",
                            )
                        })?;
                        ctx.charge_work(
                            id.0.len().saturating_add(id.1.len()).max(1),
                            Utf16::default(),
                        )?;
                        bare(endpoint)
                    })
                    .collect::<Result<Vec<_>, EngineError>>()?;
                Some(obj(vec![
                    ("name", reverse_name),
                    ("from", Value::Array(reverse_from)),
                    ("to", Value::Array(reverse_to)),
                ]))
            } else {
                None
            };
            let navigation = if let Some(reverse) = reverse {
                obj(vec![("forward", forward), ("reverse", reverse)])
            } else {
                obj(vec![("forward", forward)])
            };
            let association =
                if let Some(reference) = get_metered(relationship, "associationRecord", ctx)? {
                    let ref_id = endpoint_id_metered(reference, ctx)?.ok_or_else(|| {
                        err(
                            "RELATIONSHIP_SELECTION_SOURCE",
                            "Invalid association record",
                            "",
                        )
                    })?;
                    let (record_path, _) = records.get(&ref_id).ok_or_else(|| {
                        err(
                            "RELATIONSHIP_SELECTION_SOURCE",
                            "Missing association record",
                            "",
                        )
                    })?;
                    Some(endpoint_entry(reference, record_path))
                } else {
                    None
                };
            let prefix = Utf16::from(format!("{}/", path.to_utf8().unwrap_or_default()));
            let mut uninterpreted = Vec::new();
            for diagnostic in &validation.diagnostics {
                ctx.charge_work(1, path.clone())?;
                if diagnostic
                    .code
                    .units()
                    .starts_with(k("UNKNOWN_RELATIONSHIP_").units())
                    && (diagnostic.path == path
                        || diagnostic.path.units().starts_with(prefix.units()))
                {
                    uninterpreted.push(Value::String(diagnostic.path.clone()));
                }
            }
            let mut entry = vec![
                (
                    "identity",
                    obj(vec![
                        ("module", Value::String(module_id.clone())),
                        ("id", Value::String(id.clone())),
                    ]),
                ),
                ("path", Value::String(path)),
                ("relationship", relationship.clone()),
                ("sources", Value::Array(sources)),
                ("targets", Value::Array(targets)),
                ("navigation", navigation),
                ("uninterpretedPaths", Value::Array(uninterpreted)),
            ];
            if let Some(association) = association {
                entry.push(("associationRecord", association));
            }
            selected.push(obj(entry));
        }
    }
    let mut result = obj(vec![
        ("operation", text("select-core-relationships")),
        ("version", text("2.0.0")),
        ("source", source),
        ("query", query),
        ("selection", Value::Array(selected)),
        ("diagnostics", diagnostics_value(&validation.diagnostics)),
        ("residuals", Value::Array(vec![])),
        ("provenance", text("unverified")),
        ("navigationScope", text("authored-presentation-only")),
    ]);
    result = copy_limited(&result, ctx)?;
    validate_result(&result, &schema, engine, ctx)?;
    Ok(result)
}

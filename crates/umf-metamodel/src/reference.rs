// SPDX-License-Identifier: MIT OR Apache-2.0
//! Admission and graph projection for the authored self-model reference.
//! Filesystem access and staging remain host responsibilities.

use crate::parse_model;
use sha2::{Digest, Sha256};
use umf_core::{Context, EngineError, Utf16, Value};

const MODEL_PATH: &str = "spec/metamodel/umf.yaml";

/// Parse the exact supplied UTF-8 source bytes once, check the authored identity
/// before manifest provenance, validate the reference graph, and return the
/// predecessor's catalog shape without normalizing unknown content.
pub fn admit_self_model_catalog(
    source_utf8: &[u8],
    manifest: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let max_source_bytes = ctx.limits().max_text_units.saturating_mul(4);
    if source_utf8.len() > max_source_bytes {
        return Err(EngineError::new(
            "LIMIT",
            Utf16::default(),
            "Source text limit exceeded",
        ));
    }
    ctx.charge_work(source_utf8.len(), Utf16::default())?;
    let source_text = std::str::from_utf8(source_utf8).map_err(|_| {
        EngineError::new(
            "SOURCE_ENCODING",
            Utf16::default(),
            "source is not valid UTF-8",
        )
    })?;
    let source_units_len = source_text.encode_utf16().count();
    if source_units_len > ctx.limits().max_text_units {
        return Err(EngineError::new(
            "LIMIT",
            Utf16::default(),
            "Source text limit exceeded",
        ));
    }
    ctx.charge_work(
        source_units_len.saturating_add(source_utf8.len()),
        Utf16::default(),
    )?;
    let mut source_units = Vec::with_capacity(source_units_len);
    source_units.extend(source_text.encode_utf16());
    let document = parse_model(&source_units, ctx)?;

    if !is_text(get(&document, "umf"), "0.10.0")
        || !is_text(get(&document, "id"), "urn:umf:metamodel")
    {
        return Err(EngineError::new(
            "SELF_MODEL_SOURCE",
            Utf16::default(),
            "SELF_MODEL_SOURCE unexpected authored metamodel identity",
        ));
    }

    let source_hash = hex_sha256(source_utf8);
    let manifest_sources = get(manifest, "sources");
    if !is_text(get(manifest, "profile"), "umf.metamodel.outputs/1")
        || string(get(manifest_sources, MODEL_PATH)) != Some(&Utf16::from(source_hash.as_str()))
        || string(get(get(manifest, "provenance"), "modelSha256"))
            != Some(&Utf16::from(source_hash.as_str()))
    {
        return Err(EngineError::new(
            "SELF_MODEL_PROVENANCE",
            Utf16::default(),
            "SELF_MODEL_PROVENANCE authored model/compiler manifest mismatch",
        ));
    }

    let source = Value::Object(vec![
        (Utf16::from("path"), Value::string_utf8(MODEL_PATH)),
        (Utf16::from("sha256"), Value::string_utf8(&source_hash)),
        (
            Utf16::from("bytes"),
            Value::Number(source_utf8.len() as f64),
        ),
    ]);
    let provenance = copy_json(get(manifest, "provenance").unwrap_or(&Value::Null), ctx)?;
    let catalog = Value::Object(vec![
        (
            Utf16::from("profile"),
            Value::string_utf8("umf.metamodel/1"),
        ),
        (Utf16::from("document"), document),
        (Utf16::from("sources"), Value::Array(vec![source])),
        (Utf16::from("provenance"), provenance),
    ]);
    self_model_graph(&catalog, ctx)?;
    Ok(catalog)
}

/// Build the graph used by the predecessor as a validation pass. It is exposed
/// separately for exact projection tests and later non-CLI consumers.
pub fn self_model_graph(catalog: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let catalog = copy_json(catalog, ctx)?;
    let document = get(&catalog, "document").unwrap_or(&Value::Null);
    if !is_text(get(&catalog, "profile"), "umf.metamodel/1")
        || !is_text(get(document, "umf"), "0.10.0")
    {
        return Err(EngineError::new(
            "SELF_MODEL_PROTOCOL",
            Utf16::default(),
            "SELF_MODEL_PROTOCOL",
        ));
    }

    let modules = match get(document, "modules") {
        Some(Value::Array(modules)) => modules,
        None => return Err(graph_shape_error("modules-missing")),
        Some(Value::Null) => return Err(graph_shape_error("modules-null")),
        Some(_) => return Err(graph_shape_error("modules-nonarray")),
    };
    let mut elements: Vec<(Utf16, &'_ Value)> = Vec::new();
    for module in modules {
        let module_value = string(get(module, "id"));
        if module_value.is_none() {
            return Err(graph_value_error(
                "module.id must be a string in the admitted profile",
            ));
        }
        ctx.charge_work(module_value.map_or(0, Utf16::len), Utf16::default())?;
        let module_id = module_value.cloned().unwrap_or_default();
        let items = match get(module, "elements") {
            Some(Value::Array(items)) => items,
            None => return Err(graph_shape_error("elements-missing")),
            Some(Value::Null) => return Err(graph_shape_error("elements-null")),
            Some(_) => return Err(graph_shape_error("elements-nonarray")),
        };
        for element in items {
            if string(get(element, "id")).is_none() {
                return Err(graph_value_error(
                    "element.id must be a string in the admitted profile",
                ));
            }
            ctx.charge_work(module_id.len().saturating_add(1), Utf16::default())?;
            elements.push((module_id.clone(), element));
        }
    }
    let mut records = Vec::new();
    let mut fields = Vec::new();
    for element in &elements {
        let kind = get_metered(element.1, "kind", ctx)?;
        if is_text(kind, "record") {
            records.push(element);
        } else if is_text(kind, "field") {
            fields.push(element);
        }
    }

    let mut record_definitions: Vec<(Utf16, &(Utf16, &Value))> = Vec::new();
    for record in &records {
        let element = record.1;
        let extensions = get_metered(element, "extensions", ctx)?;
        let metadata = get_metered(extensions, "umf.metamodel", ctx)?;
        let definition_value = get_metered(metadata, "definition", ctx)?;
        let definition = match definition_value {
            Some(Value::String(value)) => Some(value),
            Some(_) | None => string(get_metered(element, "id", ctx)?),
        };
        if definition_value.is_some_and(|value| !matches!(value, Value::Null | Value::String(_))) {
            return Err(graph_value_error(
                "record definition must be a string in the admitted profile",
            ));
        }
        if let Some(definition) = definition {
            ctx.charge_work_u64(
                product_work(definition.len(), record_definitions.len().saturating_add(1)),
                Utf16::default(),
            )?;
            let definition = definition.clone();
            if let Some(index) = record_definitions
                .iter()
                .position(|(key, _)| key == &definition)
            {
                record_definitions[index] = (definition, record);
            } else {
                record_definitions.push((definition, record));
            }
        }
    }

    let mut edges = Vec::new();
    for record in &records {
        let (module, element) = (&record.0, record.1);
        let record_id_value = string(get_metered(element, "id", ctx)?);
        ctx.charge_work(record_id_value.map_or(0, Utf16::len), Utf16::default())?;
        let record_id = record_id_value.cloned().unwrap_or_default();
        let source = qualified(module, &record_id, ctx)?;
        let members_value = get_metered(element, "members", ctx)?;
        if let Some(Value::Array(members)) = members_value {
            for member in members {
                if matches!(member, Value::Null) {
                    return Err(graph_shape_error("member-null"));
                }
                ctx.charge_work(1, Utf16::default())?;
                let module_value = string(get_metered(member, "module", ctx)?);
                let element_value = string(get_metered(member, "element", ctx)?);
                ctx.charge_work(
                    module_value
                        .map_or(0, Utf16::len)
                        .saturating_add(element_value.map_or(0, Utf16::len)),
                    Utf16::default(),
                )?;
                let mut found = None;
                for candidate in &elements {
                    if module_value.is_none() || element_value.is_none() {
                        break;
                    }
                    let candidate_id = string(get_metered(candidate.1, "id", ctx)?);
                    ctx.charge_work(
                        1usize
                            .saturating_add(module_value.map_or(0, Utf16::len))
                            .saturating_add(element_value.map_or(0, Utf16::len))
                            .saturating_add(candidate.0.len())
                            .saturating_add(candidate_id.map_or(0, Utf16::len)),
                        Utf16::default(),
                    )?;
                    if Some(&candidate.0) == module_value && candidate_id == element_value {
                        found = Some(candidate);
                        break;
                    }
                }
                let Some((_, field)) = found else {
                    let member_json = js_json_string(member, ctx)?;
                    ctx.charge_work(
                        member_json
                            .len()
                            .saturating_mul(3)
                            .saturating_add("SELF_MODEL_UNRESOLVED member ".len()),
                        Utf16::default(),
                    )?;
                    let message = format!(
                        "SELF_MODEL_UNRESOLVED member {}",
                        member_json.to_utf8().unwrap_or_default()
                    );
                    return Err(EngineError::new(
                        "SELF_MODEL_UNRESOLVED",
                        Utf16::default(),
                        message,
                    ));
                };
                if !is_text(get_metered(*field, "kind", ctx)?, "field") {
                    let member_json = js_json_string(member, ctx)?;
                    ctx.charge_work(
                        member_json
                            .len()
                            .saturating_mul(3)
                            .saturating_add("SELF_MODEL_UNRESOLVED member ".len()),
                        Utf16::default(),
                    )?;
                    let message = format!(
                        "SELF_MODEL_UNRESOLVED member {}",
                        member_json.to_utf8().unwrap_or_default()
                    );
                    return Err(EngineError::new(
                        "SELF_MODEL_UNRESOLVED",
                        Utf16::default(),
                        message,
                    ));
                };
                let extensions = get_metered(*field, "extensions", ctx)?;
                let metadata = get_metered(extensions, "umf.metamodel", ctx)?;
                let mut target_names = Vec::new();
                let references_value = get_metered(*field, "references", ctx)?;
                if let Some(Value::Array(references)) = references_value {
                    for reference in references {
                        if matches!(reference, Value::Null) {
                            return Err(graph_shape_error("reference-null"));
                        }
                        if is_text(get_metered(reference, "role", ctx)?, "record-type") {
                            let target_value = get_metered(reference, "element", ctx)?;
                            if target_value.is_some_and(|value| {
                                !matches!(value, Value::Null | Value::String(_))
                            }) {
                                return Err(graph_value_error(
                                    "reference.element must be a string in the admitted profile",
                                ));
                            }
                            if let Some(target) = string(target_value) {
                                push_unique(&mut target_names, target, ctx)?;
                            }
                        }
                    }
                }
                if !matches!(
                    references_value,
                    None | Some(Value::Null) | Some(Value::Array(_))
                ) {
                    return Err(graph_shape_error("references-not-filterable"));
                }
                let shape = get_metered(metadata, "shape", ctx)?;
                collect_shape_targets(shape, &mut target_names, ctx)?;
                for target_name in target_names {
                    ctx.charge_work(target_name.len(), Utf16::default())?;
                    ctx.charge_work_u64(
                        product_work(target_name.len(), record_definitions.len()),
                        Utf16::default(),
                    )?;
                    if let Some((_, target)) = record_definitions
                        .iter()
                        .find(|(name, _)| name == &target_name)
                    {
                        let target_label =
                            js_string_coercion(get_metered(*field, "name", ctx)?, ctx)?;
                        let cardinality = get_metered(*field, "cardinality", ctx)?;
                        let label = if is_text(cardinality, "array") {
                            concat(&target_label, "[]", ctx)?
                        } else {
                            target_label
                        };
                        ctx.charge_work(
                            source
                                .len()
                                .saturating_add(label.len())
                                .saturating_add(target_name.len())
                                .saturating_add(8),
                            Utf16::default(),
                        )?;
                        let target_id_value = string(get_metered(target.1, "id", ctx)?);
                        ctx.charge_work(target_id_value.map_or(0, Utf16::len), Utf16::default())?;
                        let target_record_id = target_id_value.cloned().unwrap_or_default();
                        let target_id = qualified(&target.0, &target_record_id, ctx)?;
                        let id = tuple3(&source, &label, &target_id, ctx)?;
                        ctx.charge_work(
                            id.len()
                                .saturating_add(source.len())
                                .saturating_add(target_id.len())
                                .saturating_add(label.len())
                                .saturating_add(8),
                            Utf16::default(),
                        )?;
                        ctx.charge_work(5, Utf16::default())?;
                        edges.push(Value::Object(vec![
                            (Utf16::from("id"), Value::String(id)),
                            (Utf16::from("source"), Value::String(source.clone())),
                            (Utf16::from("target"), Value::String(target_id)),
                            (Utf16::from("label"), Value::String(label.clone())),
                            (Utf16::from("directed"), Value::Bool(true)),
                        ]));
                    }
                }
            }
        } else if !matches!(members_value, None | Some(Value::Null)) {
            return Err(graph_shape_error("members-not-iterable"));
        }
    }
    let mut seen_edges: Vec<Utf16> = Vec::new();
    for edge in &edges {
        let id = string(get(edge, "id")).unwrap();
        ctx.charge_work_u64(
            product_work(id.len(), seen_edges.len().saturating_add(1)),
            Utf16::default(),
        )?;
        if seen_edges.contains(id) {
            ctx.charge_work_u64(
                product_work(id.len(), 3).saturating_add("SELF_MODEL_DUPLICATE_EDGE ".len() as u64),
                Utf16::default(),
            )?;
            let message = format!(
                "SELF_MODEL_DUPLICATE_EDGE {}",
                id.to_utf8().unwrap_or_default()
            );
            return Err(EngineError::new(
                "SELF_MODEL_DUPLICATE_EDGE",
                Utf16::default(),
                message,
            ));
        }
        ctx.charge_work(id.len(), Utf16::default())?;
        seen_edges.push(id.clone());
    }

    ctx.charge_work(records.len(), Utf16::default())?;
    let mut record_values = Vec::with_capacity(records.len());
    for record in &records {
        ctx.charge_work(1, Utf16::default())?;
        let (module, element) = (&record.0, record.1);
        let id_value = string(get_metered(element, "id", ctx)?);
        ctx.charge_work(id_value.map_or(0, Utf16::len), Utf16::default())?;
        let id = id_value.cloned().unwrap_or_default();
        let qualified_id = qualified(module, &id, ctx)?;
        let label = match get_metered(element, "name", ctx)? {
            Some(Value::Null) | None => {
                ctx.charge_work(id.len(), Utf16::default())?;
                Value::String(id.clone())
            }
            Some(value) => copy_json(value, ctx)?,
        };
        ctx.charge_work(
            qualified_id
                .len()
                .saturating_add(value_work(&label))
                .saturating_add(3),
            Utf16::default(),
        )?;
        let mut props = vec![
            (Utf16::from("id"), Value::String(qualified_id)),
            (Utf16::from("label"), label),
        ];
        if let Some(Value::Array(members)) = get_metered(element, "members", ctx)? {
            props.push((
                Utf16::from("properties"),
                Value::Number(members.len() as f64),
            ));
        } else {
            props.push((Utf16::from("properties"), Value::Number(0.0)));
        }
        record_values.push(Value::Object(props));
    }
    ctx.charge_work(fields.len(), Utf16::default())?;
    let mut field_values = Vec::with_capacity(fields.len());
    for field in &fields {
        ctx.charge_work(1, Utf16::default())?;
        let (module, element) = (&field.0, field.1);
        let id_value = string(get_metered(element, "id", ctx)?);
        ctx.charge_work(id_value.map_or(0, Utf16::len), Utf16::default())?;
        let id = id_value.cloned().unwrap_or_default();
        let qualified_id = qualified(module, &id, ctx)?;
        let label = match get_metered(element, "name", ctx)? {
            Some(Value::Null) | None => {
                ctx.charge_work(id.len(), Utf16::default())?;
                Value::String(id.clone())
            }
            Some(value) => copy_json(value, ctx)?,
        };
        ctx.charge_work(
            qualified_id
                .len()
                .saturating_add(value_work(&label))
                .saturating_add(3),
            Utf16::default(),
        )?;
        let mut owner = None;
        for record in &records {
            ctx.charge_work(1, Utf16::default())?;
            if let Some(Value::Array(members)) = get_metered(record.1, "members", ctx)? {
                for member in members {
                    let member_module = string(get_metered(member, "module", ctx)?);
                    let member_element = string(get_metered(member, "element", ctx)?);
                    ctx.charge_work(
                        1usize
                            .saturating_add(member_module.map_or(0, Utf16::len))
                            .saturating_add(member_element.map_or(0, Utf16::len))
                            .saturating_add(id.len()),
                        Utf16::default(),
                    )?;
                    if member_module == Some(module) && member_element == Some(&id) {
                        owner = Some(record);
                        break;
                    }
                }
            }
            if owner.is_some() {
                break;
            }
        }
        let owner_value = if let Some(record) = owner {
            if let Some(owner_id) = string(get_metered(record.1, "id", ctx)?) {
                ctx.charge_work(owner_id.len(), Utf16::default())?;
                Value::String(owner_id.clone())
            } else {
                Value::String(Utf16::default())
            }
        } else {
            Value::Null
        };
        field_values.push(Value::Object(vec![
            (Utf16::from("id"), Value::String(qualified_id)),
            (Utf16::from("label"), label),
            (Utf16::from("owner"), owner_value),
        ]));
    }
    Ok(Value::Object(vec![
        (Utf16::from("records"), Value::Array(record_values)),
        (Utf16::from("fields"), Value::Array(field_values)),
        (Utf16::from("edges"), Value::Array(edges)),
    ]))
}

fn collect_shape_targets(
    shape: Option<&Value>,
    out: &mut Vec<Utf16>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Some(shape) = shape else {
        return Ok(());
    };
    // targets() returns immediately for a top-level array. For object values,
    // it traverses one array level and calls targets(item); nested arrays are
    // therefore skipped rather than recursively flattened.
    let Value::Object(_) = shape else {
        return Ok(());
    };
    let mut stack = vec![(shape, 0usize)];
    while let Some((value, depth)) = stack.pop() {
        if depth > ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                Utf16::default(),
                "JSON nesting depth exceeded",
            ));
        }
        ctx.charge_work(1, Utf16::default())?;
        match value {
            Value::Array(_) => unreachable!("only object nodes enter the shape stack"),
            Value::Object(items) => {
                ctx.charge_work(items.len(), Utf16::default())?;
                if is_text(get_metered(value, "tag", ctx)?, "link") {
                    if let Some(target) = string(get_metered(value, "target", ctx)?) {
                        push_unique(out, target, ctx)?;
                    }
                }
                let work = items
                    .iter()
                    .filter(|(key, _)| key != &Utf16::from("target"))
                    .count();
                let sort_cost =
                    work.saturating_mul((usize::BITS - work.max(1).leading_zeros()) as usize);
                let key_cost = items
                    .iter()
                    .filter(|(key, _)| key != &Utf16::from("target"))
                    .map(|(key, _)| key.len())
                    .sum::<usize>();
                ctx.charge_work(
                    work.saturating_mul(3)
                        .saturating_add(sort_cost)
                        .saturating_add(key_cost),
                    Utf16::default(),
                )?;
                let mut ordered = items
                    .iter()
                    .enumerate()
                    .filter(|(_, (key, _))| key != &Utf16::from("target"))
                    .collect::<Vec<_>>();
                ordered.sort_by(
                    |(left_index, (left_key, _)), (right_index, (right_key, _))| match (
                        array_index_key(left_key),
                        array_index_key(right_key),
                    ) {
                        (Some(left), Some(right)) => left.cmp(&right),
                        (Some(_), None) => std::cmp::Ordering::Less,
                        (None, Some(_)) => std::cmp::Ordering::Greater,
                        (None, None) => left_index.cmp(right_index),
                    },
                );
                for (_, (_, child)) in ordered.into_iter().rev() {
                    match child {
                        Value::Object(_) => {
                            ctx.charge_work(1, Utf16::default())?;
                            if stack.len() >= ctx.limits().max_values {
                                return Err(EngineError::new(
                                    "LIMIT",
                                    Utf16::default(),
                                    "JSON structural value limit exceeded",
                                ));
                            }
                            stack.push((child, depth.saturating_add(1)));
                        }
                        Value::Array(items) => {
                            ctx.charge_work(items.len(), Utf16::default())?;
                            for item in items.iter().rev() {
                                if matches!(item, Value::Object(_)) {
                                    ctx.charge_work(1, Utf16::default())?;
                                    if stack.len() >= ctx.limits().max_values {
                                        return Err(EngineError::new(
                                            "LIMIT",
                                            Utf16::default(),
                                            "JSON structural value limit exceeded",
                                        ));
                                    }
                                    stack.push((item, depth.saturating_add(1)));
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }
    Ok(())
}

fn graph_shape_error(operation: &str) -> EngineError {
    let message = match operation {
        "modules-missing" => "undefined is not an object (evaluating 'catalog.document.modules.flatMap')",
        "modules-null" => "null is not an object (evaluating 'catalog.document.modules.flatMap')",
        "modules-nonarray" => "catalog.document.modules.flatMap is not a function. (In 'catalog.document.modules.flatMap((m) => m.elements.map((e) => ({ ...e, module: m.id })))', 'catalog.document.modules.flatMap' is undefined)",
        "elements-missing" => "undefined is not an object (evaluating 'm.elements.map')",
        "elements-null" => "null is not an object (evaluating 'm.elements.map')",
        "members-not-iterable" => "false is not iterable",
        "member-null" => "null is not an object (evaluating 'member.module')",
        "references-not-filterable" => "field.references?.filter is not a function. (In 'field.references?.filter((r) => r.role === \"record-type\")', 'field.references?.filter' is undefined)",
        "reference-null" => "null is not an object (evaluating 'r.role')",
        _ => "m.elements.map is not a function. (In 'm.elements.map((e) => ({ ...e, module: m.id }))', 'm.elements.map' is undefined)",
    };
    EngineError::new("TypeError", Utf16::default(), message)
}

fn graph_value_error(message: &str) -> EngineError {
    EngineError::new("SELF_MODEL_GRAPH_VALUE", Utf16::default(), message)
}

fn value_work(value: &Value) -> usize {
    match value {
        Value::Null | Value::Bool(_) | Value::Number(_) => 1,
        Value::String(value) => value.len().saturating_add(1),
        Value::Array(items) => 1usize.saturating_add(items.iter().map(value_work).sum::<usize>()),
        Value::Object(items) => 1usize.saturating_add(
            items
                .iter()
                .map(|(key, value)| key.len().saturating_add(value_work(value)))
                .sum::<usize>(),
        ),
    }
}

fn js_string_coercion(value: Option<&Value>, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let mut output = Vec::new();
    js_append_value(value, false, &mut output, ctx, 0)?;
    Ok(Utf16::new(output))
}

fn js_append_value(
    value: Option<&Value>,
    array_item: bool,
    output: &mut Vec<u16>,
    ctx: &mut Context<'_>,
    depth: usize,
) -> Result<(), EngineError> {
    if depth > ctx.limits().max_depth {
        return Err(EngineError::new(
            "LIMIT",
            Utf16::default(),
            "JSON nesting depth exceeded",
        ));
    }
    ctx.charge_work(1, Utf16::default())?;
    match value {
        None => append_js_text(output, "undefined", ctx),
        Some(Value::Null) if array_item => Ok(()),
        Some(Value::Null) => append_js_text(output, "null", ctx),
        Some(Value::Bool(value)) => {
            append_js_text(output, if *value { "true" } else { "false" }, ctx)
        }
        Some(Value::String(value)) => append_js_units(output, value.units(), ctx),
        Some(Value::Number(value)) => {
            // A finite ECMAScript Number::toString result needs at most 24
            // UTF-16 units; admit the formatter's bounded allocation first.
            ctx.charge_work(24, Utf16::default())?;
            let text = umf_core::ecma_number_to_string(*value);
            append_js_text(output, &text, ctx)
        }
        Some(value @ Value::Object(items)) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            if get(value, "toString").is_some() {
                return Err(EngineError::new(
                    "TypeError",
                    Utf16::default(),
                    "No default value",
                ));
            }
            append_js_text(output, "[object Object]", ctx)
        }
        Some(Value::Array(items)) => {
            for (index, item) in items.iter().enumerate() {
                ctx.charge_work(1, Utf16::default())?;
                if index > 0 {
                    append_js_text(output, ",", ctx)?;
                }
                js_append_value(Some(item), true, output, ctx, depth.saturating_add(1))?;
            }
            Ok(())
        }
    }
}

fn append_js_text(
    output: &mut Vec<u16>,
    text: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let size = text.encode_utf16().count();
    ctx.charge_work_u64(size as u64, Utf16::default())?;
    output.extend(text.encode_utf16());
    Ok(())
}

fn append_js_units(
    output: &mut Vec<u16>,
    units: &[u16],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work_u64(units.len() as u64, Utf16::default())?;
    output.extend_from_slice(units);
    Ok(())
}

fn push_unique(
    out: &mut Vec<Utf16>,
    value: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work_u64(
        product_work(value.len(), out.len().saturating_add(1)),
        Utf16::default(),
    )?;
    if !out.contains(value) {
        out.push(value.clone());
    }
    Ok(())
}

fn product_work(left: usize, right: usize) -> u64 {
    (left as u64).saturating_mul(right as u64)
}

fn array_index_key(key: &Utf16) -> Option<u32> {
    let units = key.units();
    if units.is_empty() || (units.len() > 1 && units[0] == b'0' as u16) {
        return None;
    }
    let mut value = 0u32;
    for unit in units {
        if !(b'0' as u16..=b'9' as u16).contains(unit) {
            return None;
        }
        value = value
            .checked_mul(10)?
            .checked_add(u32::from(*unit - b'0' as u16))?;
    }
    (value != u32::MAX).then_some(value)
}

fn js_json_string(value: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let admitted = copy_json(value, ctx)?;
    let ordered = js_order_value(&admitted, ctx, 0)?;
    umf_core::serialization::stringify_compact_metered(&ordered, ctx)
}

fn js_order_value(
    value: &Value,
    ctx: &mut Context<'_>,
    depth: usize,
) -> Result<Value, EngineError> {
    let path = Utf16::default();
    if depth > ctx.limits().max_depth {
        return Err(EngineError::new(
            "LIMIT",
            path,
            "JSON nesting depth exceeded",
        ));
    }
    match value {
        Value::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                out.push(js_order_value(item, ctx, depth + 1)?);
            }
            Ok(Value::Array(out))
        }
        Value::Object(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let key_units = items.iter().map(|(key, _)| key.len()).sum::<usize>();
            let sort_cost = items
                .len()
                .saturating_mul((usize::BITS - items.len().max(1).leading_zeros()) as usize);
            ctx.charge_work(
                key_units
                    .saturating_add(sort_cost)
                    .saturating_add(items.len()),
                Utf16::default(),
            )?;
            let mut ordered = items.iter().enumerate().collect::<Vec<_>>();
            ordered.sort_by(
                |(left_index, (left_key, _)), (right_index, (right_key, _))| match (
                    array_index_key(left_key),
                    array_index_key(right_key),
                ) {
                    (Some(left), Some(right)) => left.cmp(&right),
                    (Some(_), None) => std::cmp::Ordering::Less,
                    (None, Some(_)) => std::cmp::Ordering::Greater,
                    (None, None) => left_index.cmp(right_index),
                },
            );
            let mut out = Vec::with_capacity(items.len());
            for (_, (key, item)) in ordered {
                out.push((key.clone(), js_order_value(item, ctx, depth + 1)?));
            }
            Ok(Value::Object(out))
        }
        scalar => Ok(scalar.clone()),
    }
}
trait ValueRef<'a> {
    fn value(self) -> Option<&'a Value>;
}
impl<'a> ValueRef<'a> for &'a Value {
    fn value(self) -> Option<&'a Value> {
        Some(self)
    }
}
impl<'a> ValueRef<'a> for Option<&'a Value> {
    fn value(self) -> Option<&'a Value> {
        self
    }
}
fn get<'a, V: ValueRef<'a>>(value: V, key: &str) -> Option<&'a Value> {
    let Value::Object(items) = value.value()? else {
        return None;
    };
    items
        .iter()
        .find(|(candidate, _)| candidate == &Utf16::from(key))
        .map(|(_, value)| value)
}
fn get_metered<'a, V: ValueRef<'a>>(
    value: V,
    key: &str,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    let Some(Value::Object(items)) = value.value() else {
        return Ok(None);
    };
    let key = Utf16::from(key);
    for (candidate, value) in items {
        ctx.charge_work(
            candidate.len().saturating_add(key.len()).max(1),
            Utf16::default(),
        )?;
        if candidate == &key {
            return Ok(Some(value));
        }
    }
    Ok(None)
}
fn string(value: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(value)) = value {
        Some(value)
    } else {
        None
    }
}
fn is_text<'a, V: ValueRef<'a>>(value: V, expected: &str) -> bool {
    string(value.value())
        .is_some_and(|value| expected.encode_utf16().eq(value.units().iter().copied()))
}
fn qualified(module: &Utf16, element: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    tuple2(module, element, ctx)
}
fn tuple2(a: &Utf16, b: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_work(a.len().saturating_add(b.len()), Utf16::default())?;
    let left = json_quote(a, ctx)?;
    let right = json_quote(b, ctx)?;
    let size = left.len().saturating_add(right.len()).saturating_add(3);
    ctx.charge_work(size, Utf16::default())?;
    let mut units = Vec::with_capacity(size);
    units.push(b'[' as u16);
    units.extend(left.units());
    units.push(b',' as u16);
    units.extend(right.units());
    units.push(b']' as u16);
    Ok(Utf16::new(units))
}
fn tuple3(a: &Utf16, b: &Utf16, c: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_work(
        a.len().saturating_add(b.len()).saturating_add(c.len()),
        Utf16::default(),
    )?;
    let first = json_quote(a, ctx)?;
    let second = json_quote(b, ctx)?;
    let third = json_quote(c, ctx)?;
    let size = first
        .len()
        .saturating_add(second.len())
        .saturating_add(third.len())
        .saturating_add(4);
    ctx.charge_work(size, Utf16::default())?;
    let mut units = Vec::with_capacity(size);
    units.push(b'[' as u16);
    units.extend(first.units());
    units.push(b',' as u16);
    units.extend(second.units());
    units.push(b',' as u16);
    units.extend(third.units());
    units.push(b']' as u16);
    Ok(Utf16::new(units))
}
fn json_quote(value: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_work(value.len(), Utf16::default())?;
    umf_core::serialization::stringify_compact_metered(&Value::String(value.clone()), ctx)
}
fn concat(value: &Utf16, suffix: &str, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_work(
        value.len().saturating_add(suffix.encode_utf16().count()),
        Utf16::default(),
    )?;
    let mut units = value.units().to_vec();
    units.extend(suffix.encode_utf16());
    Ok(Utf16::new(units))
}
fn hex_sha256(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
fn copy_json(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    umf_core::copy_json(value, ctx)
}

#[cfg(test)]
mod tests {
    use super::*;
    use umf_core::serialization::{read_json_value, stringify_compact, Format};

    const SOURCE: &[u8] = include_bytes!("../../../docs/helix/04-build/evidence/rust-migration/r7-self-model-admission/frozen/umf.yaml");
    const MANIFEST: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r7-self-model-admission/frozen/manifest.json");
    const CATALOG: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r7-self-model-admission/frozen/catalog.canonical.json");
    const GRAPH: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r7-self-model-admission/frozen/graph.canonical.json");
    const OUTCOMES: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r7-self-model-admission/frozen/outcomes.json");

    fn parse_json(source: &str) -> Value {
        read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            &mut Context::catalog(),
        )
        .unwrap()
    }
    fn get_member_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
        let Value::Object(items) = value else {
            return None;
        };
        items
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value)
    }
    fn set_member(value: &mut Value, name: &str, replacement: Value) {
        if let Some(current) = get_member_mut(value, name) {
            *current = replacement;
        } else if let Value::Object(items) = value {
            items.push((Utf16::from(name), replacement));
        }
    }
    fn sorted(value: &Value) -> Value {
        match value {
            Value::Array(items) => Value::Array(items.iter().map(sorted).collect()),
            Value::Object(items) => {
                let mut items = items
                    .iter()
                    .map(|(key, value)| (key.clone(), sorted(value)))
                    .collect::<Vec<_>>();
                items.sort_by(|a, b| a.0.cmp(&b.0));
                Value::Object(items)
            }
            other => other.clone(),
        }
    }
    fn canonical(value: &Value) -> String {
        stringify_compact(&sorted(value))
            .unwrap()
            .to_utf8()
            .unwrap()
    }

    #[test]
    fn frozen_catalog_and_graph_match_predecessor_canonicalization() {
        let manifest = parse_json(MANIFEST);
        let catalog = admit_self_model_catalog(SOURCE, &manifest, &mut Context::catalog()).unwrap();
        assert_eq!(canonical(&catalog), CATALOG.trim());
        let graph = self_model_graph(&catalog, &mut Context::catalog()).unwrap();
        assert_eq!(canonical(&graph), GRAPH.trim());
        assert_eq!(
            get(
                get(&catalog, "sources").and_then(|value| match value {
                    Value::Array(items) => items.first(),
                    _ => None,
                }),
                "bytes"
            ),
            Some(&Value::Number(SOURCE.len() as f64))
        );
    }

    #[test]
    fn source_identity_refusal_precedes_manifest_hash_refusal() {
        let manifest = parse_json(MANIFEST);
        let wrong_identity = b"umf: 0.1.0\nid: urn:wrong\n";
        let error = admit_self_model_catalog(wrong_identity, &manifest, &mut Context::ordinary())
            .unwrap_err();
        assert_eq!(error.code, "SELF_MODEL_SOURCE");
        assert_eq!(
            error.message.to_utf8().unwrap(),
            "SELF_MODEL_SOURCE unexpected authored metamodel identity"
        );
    }

    #[test]
    fn manifest_profile_source_and_model_hash_refusals_are_frozen() {
        let expected = "SELF_MODEL_PROVENANCE authored model/compiler manifest mismatch";
        for key_path in ["profile", "source", "model"] {
            let mut manifest = parse_json(MANIFEST);
            match key_path {
                "profile" => set_member(
                    &mut manifest,
                    "profile",
                    Value::string_utf8("future/profile"),
                ),
                "source" => set_member(
                    get_member_mut(&mut manifest, "sources").unwrap(),
                    MODEL_PATH,
                    Value::string_utf8("stale"),
                ),
                "model" => set_member(
                    get_member_mut(&mut manifest, "provenance").unwrap(),
                    "modelSha256",
                    Value::string_utf8("stale"),
                ),
                _ => unreachable!(),
            }
            let error =
                admit_self_model_catalog(SOURCE, &manifest, &mut Context::ordinary()).unwrap_err();
            assert_eq!(error.code, "SELF_MODEL_PROVENANCE");
            assert_eq!(error.message.to_utf8().unwrap(), expected);
        }
    }

    #[test]
    fn manifest_unknowns_are_preserved_and_missing_compiler_hash_is_accepted() {
        let mut manifest = parse_json(MANIFEST);
        if let Value::Object(top) = &mut manifest {
            top.retain(|(key, _)| key != &Utf16::from("provenance"));
            let mut provenance = vec![(
                Utf16::from("modelSha256"),
                Value::string_utf8(&hex_sha256(SOURCE)),
            )];
            provenance.push((Utf16::from("future🚀"), Value::string_utf8("kept")));
            top.push((Utf16::from("provenance"), Value::Object(provenance)));
        }
        let catalog = admit_self_model_catalog(SOURCE, &manifest, &mut Context::catalog()).unwrap();
        assert!(get(get(&catalog, "provenance"), "future🚀").is_some());
        assert!(get(get(&catalog, "provenance"), "compilerSha256").is_none());
    }

    #[test]
    fn source_digest_and_byte_count_cover_exact_utf8_input() {
        let source = [SOURCE, b"\n  \n"].concat();
        let digest = hex_sha256(&source);
        let mut manifest = parse_json(MANIFEST);
        set_member(
            get_member_mut(&mut manifest, "sources").unwrap(),
            MODEL_PATH,
            Value::string_utf8(&digest),
        );
        set_member(
            get_member_mut(&mut manifest, "provenance").unwrap(),
            "modelSha256",
            Value::string_utf8(&digest),
        );
        let catalog =
            admit_self_model_catalog(&source, &manifest, &mut Context::catalog()).unwrap();
        let source_entry = match get(&catalog, "sources") {
            Some(Value::Array(items)) => items.first().unwrap(),
            _ => panic!("source entry expected"),
        };
        assert_eq!(
            string(get(source_entry, "sha256")),
            Some(&Utf16::from(digest.as_str()))
        );
        assert_eq!(
            get(source_entry, "bytes"),
            Some(&Value::Number(source.len() as f64))
        );
    }

    #[test]
    fn shape_walk_uses_javascript_numeric_own_key_order() {
        let link = |target: &str| {
            Value::Object(vec![
                (Utf16::from("tag"), Value::string_utf8("link")),
                (Utf16::from("target"), Value::string_utf8(target)),
            ])
        };
        let shape = Value::Object(vec![
            (Utf16::from("tag"), Value::string_utf8("object")),
            (Utf16::from("9"), link("nine")),
            (Utf16::from("later"), link("later")),
            (Utf16::from("2"), link("two")),
            (Utf16::from("01"), link("leading-zero")),
        ]);
        let mut targets = Vec::new();
        collect_shape_targets(Some(&shape), &mut targets, &mut Context::ordinary()).unwrap();
        assert_eq!(
            targets
                .iter()
                .map(|value| value.to_utf8().unwrap())
                .collect::<Vec<_>>(),
            vec!["two", "nine", "later", "leading-zero"]
        );
    }

    #[test]
    fn shape_walk_skips_top_level_and_nested_arrays_like_predecessor() {
        let link = Value::Object(vec![
            (Utf16::from("tag"), Value::string_utf8("link")),
            (Utf16::from("target"), Value::string_utf8("must-not-appear")),
        ]);
        let top_array = Value::Array(vec![link.clone()]);
        let nested_array = Value::Object(vec![(
            Utf16::from("items"),
            Value::Array(vec![Value::Array(vec![link])]),
        )]);
        for shape in [&top_array, &nested_array] {
            let mut targets = Vec::new();
            collect_shape_targets(Some(shape), &mut targets, &mut Context::ordinary()).unwrap();
            assert!(targets.is_empty());
        }
    }

    #[test]
    fn missing_graph_containers_refuse_instead_of_becoming_empty_graphs() {
        let missing_document =
            Value::Object(vec![(Utf16::from("umf"), Value::string_utf8("0.10.0"))]);
        let missing_catalog = Value::Object(vec![
            (
                Utf16::from("profile"),
                Value::string_utf8("umf.metamodel/1"),
            ),
            (Utf16::from("document"), missing_document),
        ]);
        let missing_error =
            self_model_graph(&missing_catalog, &mut Context::ordinary()).unwrap_err();
        assert_eq!(missing_error.code, "TypeError");
        assert_eq!(
            missing_error.message.to_utf8().unwrap(),
            "undefined is not an object (evaluating 'catalog.document.modules.flatMap')"
        );
        for (key, value, expected) in [
            (
                "modules",
                Value::Null,
                "null is not an object (evaluating 'catalog.document.modules.flatMap')",
            ),
            (
                "modules",
                Value::Object(vec![]),
                "catalog.document.modules.flatMap",
            ),
        ] {
            let document = Value::Object(vec![
                (Utf16::from("umf"), Value::string_utf8("0.10.0")),
                (Utf16::from(key), value),
            ]);
            let catalog = Value::Object(vec![
                (
                    Utf16::from("profile"),
                    Value::string_utf8("umf.metamodel/1"),
                ),
                (Utf16::from("document"), document),
            ]);
            let error = self_model_graph(&catalog, &mut Context::ordinary()).unwrap_err();
            assert_eq!(error.code, "TypeError");
            assert!(error.message.to_utf8().unwrap().contains(expected));
        }
        let document = Value::Object(vec![
            (Utf16::from("umf"), Value::string_utf8("0.10.0")),
            (
                Utf16::from("modules"),
                Value::Array(vec![Value::Object(vec![
                    (Utf16::from("id"), Value::string_utf8("m")),
                    (Utf16::from("elements"), Value::Null),
                ])]),
            ),
        ]);
        let catalog = Value::Object(vec![
            (
                Utf16::from("profile"),
                Value::string_utf8("umf.metamodel/1"),
            ),
            (Utf16::from("document"), document),
        ]);
        let error = self_model_graph(&catalog, &mut Context::ordinary()).unwrap_err();
        assert_eq!(error.code, "TypeError");
        assert_eq!(
            error.message.to_utf8().unwrap(),
            "null is not an object (evaluating 'm.elements.map')"
        );

        for (element_id, key, invalid, expected) in [
            (
                "document",
                "members",
                Value::Bool(false),
                "false is not iterable",
            ),
            (
                "document",
                "members",
                Value::Array(vec![Value::Null]),
                "null is not an object (evaluating 'member.module')",
            ),
            (
                "document.modules",
                "references",
                Value::Object(vec![]),
                "field.references?.filter is not a function.",
            ),
            (
                "document.modules",
                "references",
                Value::Array(vec![Value::Null]),
                "null is not an object (evaluating 'r.role')",
            ),
        ] {
            let mut catalog =
                admit_self_model_catalog(SOURCE, &parse_json(MANIFEST), &mut Context::catalog())
                    .unwrap();
            let Value::Array(modules) =
                get_member_mut(get_member_mut(&mut catalog, "document").unwrap(), "modules")
                    .unwrap()
            else {
                panic!("modules expected")
            };
            let Value::Array(elements) = get_member_mut(&mut modules[0], "elements").unwrap()
            else {
                panic!("elements expected")
            };
            let element = elements
                .iter_mut()
                .find(|element| {
                    string(get(&**element, "id")).is_some_and(|id| id == &Utf16::from(element_id))
                })
                .unwrap();
            set_member(element, key, invalid);
            let error = self_model_graph(&catalog, &mut Context::catalog()).unwrap_err();
            assert_eq!(error.code, "TypeError");
            assert!(error.message.to_utf8().unwrap().contains(expected));
        }
    }

    #[test]
    fn supported_malformed_graph_values_match_frozen_predecessor_refusals() {
        let expected = parse_json(OUTCOMES);
        let shape_errors = get(&expected, "graphShapeErrors").unwrap();
        let error_text = |key: &str| {
            string(get(shape_errors, key))
                .unwrap()
                .to_utf8()
                .unwrap()
                .split_once(": ")
                .unwrap()
                .1
                .to_owned()
        };
        let mk_catalog = |modules: Value| {
            Value::Object(vec![
                (Utf16::from("profile"), Value::string_utf8("umf.metamodel/1")),
                (
                    Utf16::from("document"),
                    Value::Object(vec![
                        (Utf16::from("umf"), Value::string_utf8("0.10.0")),
                        (Utf16::from("modules"), modules),
                    ]),
                ),
            ])
        };
        let simple_element = || {
            Value::Object(vec![
                (Utf16::from("id"), Value::string_utf8("record")),
                (Utf16::from("kind"), Value::string_utf8("record")),
            ])
        };
        let malformed = [
            (
                "elementsMissing",
                Value::Array(vec![Value::Object(vec![(
                    Utf16::from("id"),
                    Value::string_utf8("m"),
                )])]),
            ),
            (
                "elementsNonArray",
                Value::Array(vec![Value::Object(vec![
                    (Utf16::from("id"), Value::string_utf8("m")),
                    (Utf16::from("elements"), Value::Bool(false)),
                ])]),
            ),
            (
                "membersFalse",
                Value::Array(vec![Value::Object(vec![
                    (Utf16::from("id"), Value::string_utf8("m")),
                    (Utf16::from("elements"), Value::Array(vec![{
                        let mut element = simple_element();
                        set_member(&mut element, "members", Value::Bool(false));
                        element
                    }])),
                ])]),
            ),
        ];
        for (name, modules) in malformed {
            let error = self_model_graph(&mk_catalog(modules), &mut Context::catalog()).unwrap_err();
            assert_eq!(error.code, "TypeError", "{name}");
            assert_eq!(error.message.to_utf8().unwrap(), error_text(name), "{name}");
        }
    }

    #[test]
    fn unsupported_dynamic_identifiers_and_reference_targets_are_explicit_refusals() {
        let mut catalog = admit_self_model_catalog(
            SOURCE,
            &parse_json(MANIFEST),
            &mut Context::catalog(),
        )
        .unwrap();
        let modules = get_member_mut(get_member_mut(&mut catalog, "document").unwrap(), "modules")
            .unwrap();
        let Value::Array(modules) = modules else { panic!("modules expected") };
        let Value::Array(elements) = get_member_mut(&mut modules[0], "elements").unwrap() else {
            panic!("elements expected")
        };
        let record = elements
            .iter_mut()
            .find(|element| is_text(get(&**element, "kind"), "record"))
            .unwrap();
        set_member(record, "id", Value::Bool(false));
        let error = self_model_graph(&catalog, &mut Context::catalog()).unwrap_err();
        assert_eq!(error.code, "SELF_MODEL_GRAPH_VALUE");
        assert_eq!(
            error.message.to_utf8().unwrap(),
            "element.id must be a string in the admitted profile"
        );

        let catalog = Value::Object(vec![
            (Utf16::from("profile"), Value::string_utf8("umf.metamodel/1")),
            (
                Utf16::from("document"),
                Value::Object(vec![
                    (Utf16::from("umf"), Value::string_utf8("0.10.0")),
                    (
                        Utf16::from("modules"),
                        Value::Array(vec![Value::Object(vec![
                            (Utf16::from("id"), Value::string_utf8("m")),
                            (
                                Utf16::from("elements"),
                                Value::Array(vec![
                                    Value::Object(vec![
                                        (Utf16::from("id"), Value::string_utf8("r")),
                                        (Utf16::from("kind"), Value::string_utf8("record")),
                                        (
                                            Utf16::from("members"),
                                            Value::Array(vec![Value::Object(vec![
                                                (Utf16::from("module"), Value::string_utf8("m")),
                                                (Utf16::from("element"), Value::string_utf8("f")),
                                            ])]),
                                        ),
                                    ]),
                                    Value::Object(vec![
                                        (Utf16::from("id"), Value::string_utf8("f")),
                                        (Utf16::from("kind"), Value::string_utf8("field")),
                                        (
                                            Utf16::from("references"),
                                            Value::Array(vec![Value::Object(vec![
                                                (Utf16::from("role"), Value::string_utf8("record-type")),
                                                (Utf16::from("element"), Value::Bool(false)),
                                            ])]),
                                        ),
                                    ]),
                                ]),
                            ),
                        ])]),
                    ),
                ]),
            ),
        ]);
        let error = self_model_graph(&catalog, &mut Context::catalog()).unwrap_err();
        assert_eq!(error.code, "SELF_MODEL_GRAPH_VALUE");
        assert_eq!(
            error.message.to_utf8().unwrap(),
            "reference.element must be a string in the admitted profile"
        );
    }

    #[test]
    fn labels_preserve_non_string_name_values() {
        let mut catalog =
            admit_self_model_catalog(SOURCE, &parse_json(MANIFEST), &mut Context::catalog())
                .unwrap();
        let modules =
            get_member_mut(get_member_mut(&mut catalog, "document").unwrap(), "modules").unwrap();
        let Value::Array(modules) = modules else {
            panic!("modules expected")
        };
        let Value::Array(elements) = get_member_mut(&mut modules[0], "elements").unwrap() else {
            panic!("elements expected")
        };
        let record = elements
            .iter_mut()
            .find(|element| is_text(get(&**element, "kind"), "record"))
            .unwrap();
        set_member(record, "name", Value::Bool(false));
        let record_id = string(get(&*record, "id")).unwrap().clone();
        let graph = self_model_graph(&catalog, &mut Context::catalog()).unwrap();
        let Value::Array(records) = get(&graph, "records").unwrap() else {
            panic!("records expected")
        };
        let value = records
            .iter()
            .find(|item| {
                string(get(*item, "id")).is_some_and(|id| {
                    id == &tuple2(&Utf16::from("umf"), &record_id, &mut Context::ordinary())
                        .unwrap()
                })
            })
            .unwrap();
        assert_eq!(get(value, "label"), Some(&Value::Bool(false)));
    }

    #[test]
    fn edge_name_coercion_matches_bounded_ecmascript_json_tostring() {
        let mut context = Context::ordinary();
        let number = Value::Number(1e-7);
        assert_eq!(
            js_string_coercion(Some(&number), &mut context)
                .unwrap()
                .to_utf8()
                .unwrap(),
            "1e-7"
        );
        let object = Value::Object(vec![]);
        assert_eq!(
            js_string_coercion(Some(&object), &mut context)
                .unwrap()
                .to_utf8()
                .unwrap(),
            "[object Object]"
        );
        let array = Value::Array(vec![
            Value::Number(1e-7),
            Value::Array(vec![Value::string_utf8("a"), Value::Null]),
            Value::Object(vec![]),
        ]);
        assert_eq!(
            js_string_coercion(Some(&array), &mut context)
                .unwrap()
                .to_utf8()
                .unwrap(),
            "1e-7,a,,[object Object]"
        );
        let own_to_string = Value::Object(vec![(
            Utf16::from("toString"),
            Value::string_utf8("blocked"),
        )]);
        let error = js_string_coercion(Some(&own_to_string), &mut context).unwrap_err();
        assert_eq!(error.code, "TypeError");
        assert_eq!(error.message.to_utf8().unwrap(), "No default value");
    }

    #[test]
    fn unresolved_member_diagnostic_uses_javascript_numeric_key_order() {
        let member = Value::Object(vec![
            (Utf16::from("z"), Value::string_utf8("zee")),
            (Utf16::from("2"), Value::string_utf8("two")),
            (Utf16::from("module"), Value::string_utf8("absent")),
            (Utf16::from("1"), Value::string_utf8("one")),
            (Utf16::from("element"), Value::string_utf8("missing")),
        ]);
        let record = Value::Object(vec![
            (Utf16::from("id"), Value::string_utf8("r")),
            (Utf16::from("kind"), Value::string_utf8("record")),
            (Utf16::from("members"), Value::Array(vec![member])),
        ]);
        let document = Value::Object(vec![
            (Utf16::from("umf"), Value::string_utf8("0.10.0")),
            (
                Utf16::from("modules"),
                Value::Array(vec![Value::Object(vec![
                    (Utf16::from("id"), Value::string_utf8("m")),
                    (Utf16::from("elements"), Value::Array(vec![record])),
                ])]),
            ),
        ]);
        let catalog = Value::Object(vec![
            (
                Utf16::from("profile"),
                Value::string_utf8("umf.metamodel/1"),
            ),
            (Utf16::from("document"), document),
        ]);
        let error = self_model_graph(&catalog, &mut Context::ordinary()).unwrap_err();
        assert_eq!(error.code, "SELF_MODEL_UNRESOLVED");
        assert_eq!(
            error.message.to_utf8().unwrap(),
            "SELF_MODEL_UNRESOLVED member {\"1\":\"one\",\"2\":\"two\",\"z\":\"zee\",\"module\":\"absent\",\"element\":\"missing\"}"
        );
    }

    #[test]
    fn duplicate_edge_refusal_matches_frozen_predecessor() {
        let reference = |module: &str, element: &str| {
            Value::Object(vec![
                (Utf16::from("module"), Value::string_utf8(module)),
                (Utf16::from("element"), Value::string_utf8(element)),
            ])
        };
        let record = |id: &str, members: Vec<Value>| {
            Value::Object(vec![
                (Utf16::from("id"), Value::string_utf8(id)),
                (Utf16::from("kind"), Value::string_utf8("record")),
                (Utf16::from("members"), Value::Array(members)),
            ])
        };
        let field = Value::Object(vec![
            (Utf16::from("id"), Value::string_utf8("modules")),
            (Utf16::from("kind"), Value::string_utf8("field")),
            (Utf16::from("name"), Value::string_utf8("modules")),
            (
                Utf16::from("references"),
                Value::Array(vec![Value::Object(vec![
                    (Utf16::from("role"), Value::string_utf8("record-type")),
                    (Utf16::from("element"), Value::string_utf8("module")),
                ])]),
            ),
        ]);
        let duplicate_member = reference("umf", "modules");
        let document = Value::Object(vec![
            (Utf16::from("umf"), Value::string_utf8("0.10.0")),
            (
                Utf16::from("modules"),
                Value::Array(vec![Value::Object(vec![
                    (Utf16::from("id"), Value::string_utf8("umf")),
                    (
                        Utf16::from("elements"),
                        Value::Array(vec![
                            record("document", vec![duplicate_member.clone(), duplicate_member]),
                            record("module", vec![]),
                            field,
                        ]),
                    ),
                ])]),
            ),
        ]);
        let catalog = Value::Object(vec![
            (
                Utf16::from("profile"),
                Value::string_utf8("umf.metamodel/1"),
            ),
            (Utf16::from("document"), document),
        ]);
        let error = self_model_graph(&catalog, &mut Context::ordinary()).unwrap_err();
        let expected = string(get(&parse_json(OUTCOMES), "duplicateEdgeError"))
            .unwrap()
            .to_utf8()
            .unwrap();
        assert_eq!(error.message.to_utf8().unwrap(), expected);
    }

    #[test]
    fn work_products_keep_values_above_wasm32_u32_range() {
        assert_eq!(product_work(65_536, 65_536), u64::from(u32::MAX) + 1);
    }

    #[test]
    fn padded_object_property_lookup_is_rejected_by_the_work_meter() {
        let mut properties = (0..128)
            .map(|index| (Utf16::from(format!("extension-{index}")), Value::Null))
            .collect::<Vec<_>>();
        properties.push((Utf16::from("id"), Value::string_utf8("target")));
        let object = Value::Object(properties);
        let mut reject = |amount: usize| {
            if amount > 8 {
                Err(EngineError::new(
                    "RESOURCE_LIMIT",
                    Utf16::default(),
                    "budget",
                ))
            } else {
                Ok(())
            }
        };
        let mut context = Context::ordinary().with_host_control(&mut reject);
        assert_eq!(
            get_metered(&object, "id", &mut context).unwrap_err().code,
            "RESOURCE_LIMIT"
        );
    }

    #[test]
    fn preowned_field_name_can_exceed_internal_text_unit_threshold() {
        let mut catalog =
            admit_self_model_catalog(SOURCE, &parse_json(MANIFEST), &mut Context::catalog())
                .unwrap();
        let modules =
            get_member_mut(get_member_mut(&mut catalog, "document").unwrap(), "modules").unwrap();
        let Value::Array(modules) = modules else {
            panic!("modules expected")
        };
        let Value::Array(elements) = get_member_mut(&mut modules[0], "elements").unwrap() else {
            panic!("elements expected")
        };
        let field = elements
            .iter_mut()
            .find(|element| {
                string(get(&**element, "id"))
                    .is_some_and(|id| id == &Utf16::from("document.modules"))
            })
            .unwrap();
        let name = Utf16::new(vec![b'x' as u16; 4_000_001]);
        set_member(field, "name", Value::String(name.clone()));
        let graph = self_model_graph(&catalog, &mut Context::catalog()).unwrap();
        let Some(Value::Array(edges)) = get(&graph, "edges") else {
            panic!("edges expected")
        };
        assert!(edges
            .iter()
            .any(|edge| { string(get(edge, "label")).is_some_and(|label| label == &name) }));
    }

    #[test]
    fn graph_projection_observes_late_cancellation() {
        let catalog =
            admit_self_model_catalog(SOURCE, &parse_json(MANIFEST), &mut Context::catalog())
                .unwrap();
        let mut completed_polls = 0usize;
        let mut meter = |_amount| {
            completed_polls += 1;
            Ok(())
        };
        self_model_graph(&catalog, &mut Context::catalog().with_meter(&mut meter)).unwrap();
        assert!(completed_polls > 64);

        let mut polls = 0usize;
        let mut cancel = || {
            polls += 1;
            polls > completed_polls / 2
        };
        let error = self_model_graph(
            &catalog,
            &mut Context::catalog().with_cancellation(&mut cancel),
        )
        .unwrap_err();
        assert_eq!(error.code, "CANCELLED");
        assert!(error.is_control_failure());
        assert!(polls > 32);
    }
}

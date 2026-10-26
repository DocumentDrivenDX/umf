// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded core-element metadata selection. Only explicit core references,
//! item types, members and key fields participate in transitive traversal.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    registry::Registry,
    serialization::stringify_compact_metered,
    value::{copy_json, Utf16, Value},
};
use std::collections::HashSet;

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
type Identity = (Utf16, Utf16);

const QUERY_REFUSAL: &str = "Expected exact core filters and explicit reference traversal policy";

fn query_refusal() -> EngineError {
    err("CORE_SELECTION_QUERY", QUERY_REFUSAL, "")
}

fn query_strings<'a>(query: &'a Value, field: &str) -> Result<Option<Vec<Utf16>>, EngineError> {
    let Some(value) = get(query, field) else {
        return Ok(None);
    };
    let Value::Array(values) = value else {
        let _ = field;
        return Err(query_refusal());
    };
    let mut result = Vec::with_capacity(values.len());
    for value in values {
        let Some(value) = string(value) else {
            return Err(query_refusal());
        };
        if (field == "scalarTypes" || field == "cardinalities") && value.is_empty() {
            return Err(query_refusal());
        }
        result.push(value.clone());
    }
    Ok(Some(result))
}

fn parse_query(
    query: &Value,
) -> Result<
    (
        bool,
        Vec<(&'static str, Option<Vec<Utf16>>)>,
        Option<HashSet<Identity>>,
    ),
    EngineError,
> {
    let Value::Object(fields) = query else {
        return Err(query_refusal());
    };
    for (key, _) in fields {
        if ![
            "references",
            "modules",
            "namespaces",
            "names",
            "scalarTypes",
            "cardinalities",
            "identities",
        ]
        .contains(&key.to_utf8().unwrap_or_default().as_str())
        {
            return Err(query_refusal());
        }
    }
    let transitive = match get(query, "references")
        .and_then(string)
        .and_then(|s| s.to_utf8().ok())
        .as_deref()
    {
        Some("none") => false,
        Some("transitive") => true,
        _ => {
            return Err(query_refusal());
        }
    };
    let mut filters = Vec::new();
    for name in [
        "modules",
        "namespaces",
        "names",
        "scalarTypes",
        "cardinalities",
    ] {
        filters.push((name, query_strings(query, name)?));
    }
    let identities = if let Some(value) = get(query, "identities") {
        let Value::Array(values) = value else {
            return Err(query_refusal());
        };
        let mut set = HashSet::new();
        for value in values {
            let Value::Object(fields) = value else {
                return Err(query_refusal());
            };
            if fields.len() != 2
                || fields
                    .iter()
                    .any(|(property, _)| property != &k("module") && property != &k("element"))
            {
                return Err(query_refusal());
            }
            let module = get(value, "module")
                .and_then(string)
                .filter(|v| !v.is_empty())
                .cloned();
            let element = get(value, "element")
                .and_then(string)
                .filter(|v| !v.is_empty())
                .cloned();
            let (Some(module), Some(element)) = (module, element) else {
                return Err(query_refusal());
            };
            set.insert((module, element));
        }
        Some(set)
    } else {
        None
    };
    Ok((transitive, filters, identities))
}

fn matches_filter(
    filters: &[(&'static str, Option<Vec<Utf16>>)],
    name: &str,
    value: Option<&Utf16>,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let values = filters
        .iter()
        .find(|(key, _)| *key == name)
        .and_then(|(_, values)| values.as_ref());
    let Some(values) = values else {
        return Ok(true);
    };
    let Some(value) = value else { return Ok(false) };
    for candidate in values {
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

fn reference_target(reference: &Value) -> Option<Identity> {
    Some((
        get(reference, "module").and_then(string)?.clone(),
        get(reference, "element").and_then(string)?.clone(),
    ))
}
fn identity(module: &Value, element: &Value) -> Option<Identity> {
    Some((
        get(module, "id").and_then(string)?.clone(),
        get(element, "id").and_then(string)?.clone(),
    ))
}
fn push_refs<'a>(element: &'a Value, out: &mut Vec<&'a Value>) {
    if let Some(Value::Array(refs)) = get(element, "references") {
        out.extend(refs);
    }
    for field in ["itemType"] {
        if let Some(reference) = get(element, field) {
            out.push(reference);
        }
    }
    if let Some(Value::Array(members)) = get(element, "members") {
        out.extend(members);
    }
    if let Some(Value::Array(keys)) = get(element, "keys") {
        for key in keys {
            if let Some(Value::Array(fields)) = get(key, "fields") {
                out.extend(fields);
            }
        }
    }
}
/// Preserve the TypeScript selection refusal location while retaining the
/// shared copy's early allocation checks. The shared copy may reject a wide
/// container at its parent before visiting the first over-limit child; this
/// bounded metered walk identifies that child without allocating a copy.
fn check_selection_copy_limits(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    fn walk(
        value: &Value,
        path: &Utf16,
        depth: usize,
        count: &mut usize,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        ctx.charge_work(1, Utf16::default())?;
        *count = count.saturating_add(1);
        if *count > ctx.limits().max_values || depth > ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                path.clone(),
                "JSON structural limit exceeded",
            ));
        }
        let mut visit = |key: &Utf16, child: &Value| {
            // Charge a conservative upper bound before cloning the existing
            // path or escaping the key into its descendant pointer.
            let path_cost = path
                .len()
                .saturating_add(1)
                .saturating_add(key.len().saturating_mul(2));
            ctx.charge_work(path_cost.max(1), Utf16::default())?;
            let mut units = Vec::with_capacity(path_cost);
            units.extend_from_slice(path.units());
            units.push(b'/' as u16);
            for unit in key.units() {
                match unit {
                    0x7e => units.extend([0x7e, 0x30]),
                    0x2f => units.extend([0x7e, 0x31]),
                    other => units.push(*other),
                }
            }
            walk(child, &Utf16::new(units), depth + 1, count, ctx)
        };
        match value {
            Value::Array(items) => {
                for (index, child) in items.iter().enumerate() {
                    let key = Utf16::from(index.to_string());
                    visit(&key, child)?;
                }
            }
            Value::Object(fields) => {
                for (key, child) in fields {
                    visit(key, child)?;
                }
            }
            _ => {}
        }
        Ok(())
    }
    walk(value, &Utf16::default(), 0, &mut 0, ctx)
}

/// Select a copied snapshot after full core and registry validation.
pub fn select_core_elements(
    input: &Value,
    query_input: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let provider = crate::registry::StaticRegistrationProvider(registry);
    select_core_elements_with_provider(input, query_input, engine, &provider, capabilities, ctx)
}

pub(crate) fn select_core_elements_with_provider(
    input: &Value,
    query_input: &Value,
    engine: &Engine,
    provider: &dyn crate::registry::RegistrationProvider,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    // Match the predecessor ordering: copy both arguments, validate query, then
    // admit the entire source through the supplied engine and registry.
    check_selection_copy_limits(input, ctx)?;
    let source = copy_json(input, ctx)?;
    check_selection_copy_limits(query_input, ctx)?;
    let query = copy_json(query_input, ctx)?;
    let (transitive, filters, identities) = parse_query(&query)?;
    let source_validation = engine.validate_document_observed_fallible_with_provider(
        &source,
        provider,
        capabilities,
        ctx,
        None,
    )?;
    let source_validation =
        crate::selection_diagnostics::SelectionDiagnosticMaterialization::from_static_validation(
            source_validation,
        );
    if !source_validation.static_is_valid()? {
        let diagnostics = source_validation.into_static_diagnostics()?;
        let message = stringify_compact_metered(&Value::Array(diagnostics), ctx)?;
        return Err(EngineError::new(
            "CORE_SELECTION_SOURCE",
            Utf16::default(),
            message,
        ));
    }
    let modules = match get(&source, "modules") {
        Some(Value::Array(values)) => values,
        _ => return Err(err("CORE_SELECTION_SOURCE", "Missing modules", "/modules")),
    };
    let mut entries: Vec<(usize, usize, Identity, Utf16, Value, bool)> = Vec::new();
    let mut index = std::collections::HashMap::new();
    let mut initial = HashSet::new();
    let mut initial_queue = Vec::new();
    for (mi, module) in modules.iter().enumerate() {
        let elements = match get(module, "elements") {
            Some(Value::Array(values)) => values,
            _ => continue,
        };
        let module_id = get(module, "id")
            .and_then(string)
            .ok_or_else(|| err("CORE_SELECTION_SOURCE", "Missing module id", "/modules"))?
            .clone();
        let namespace = get(module, "namespace")
            .and_then(string)
            .cloned()
            .unwrap_or_default();
        for (ei, element) in elements.iter().enumerate() {
            ctx.charge_work(1, Utf16::default())?;
            let id = identity(module, element).ok_or_else(|| {
                err(
                    "CORE_SELECTION_SOURCE",
                    "Missing element identity",
                    "/modules",
                )
            })?;
            let name = get(element, "name").and_then(string);
            let scalar = get(element, "scalarType").and_then(string);
            let cardinality = get(element, "cardinality").and_then(string);
            let matched = matches_filter(&filters, "modules", Some(&module_id), ctx)?
                && matches_filter(&filters, "namespaces", Some(&namespace), ctx)?
                && matches_filter(&filters, "names", name, ctx)?
                && matches_filter(&filters, "scalarTypes", scalar, ctx)?
                && matches_filter(&filters, "cardinalities", cardinality, ctx)?
                && if identities.is_some() {
                    ctx.charge_work(
                        id.0.len().saturating_add(id.1.len()).max(1),
                        Utf16::default(),
                    )?;
                    identities.as_ref().is_some_and(|set| set.contains(&id))
                } else {
                    true
                };
            ctx.charge_work(
                module_id
                    .len()
                    .saturating_add(namespace.len())
                    .saturating_add(id.0.len())
                    .saturating_add(id.1.len()),
                Utf16::default(),
            )?;
            if matched {
                initial.insert(id.clone());
                initial_queue.push(id.clone());
            }
            let entry_index = entries.len();
            index.insert(id.clone(), entry_index);
            entries.push((
                mi,
                ei,
                id,
                namespace.clone(),
                copy_json(element, ctx)?,
                matched,
            ));
        }
    }
    let mut included = initial.clone();
    let mut queue: Vec<Identity> = initial_queue;
    if transitive {
        let mut next = 0;
        while next < queue.len() {
            let id = queue[next].clone();
            next += 1;
            let entry = &entries[*index.get(&id).expect("validated core reference target")];
            let mut refs = Vec::new();
            push_refs(&entry.4, &mut refs);
            for reference in refs {
                ctx.charge_work(1, Utf16::default())?;
                let target = reference_target(reference)
                    .ok_or_else(|| err("CORE_SELECTION_SOURCE", "Malformed core reference", ""))?;
                if included.insert(target.clone()) {
                    queue.push(target);
                }
            }
        }
    }
    let mut selection = Vec::new();
    for (mi, ei, id, namespace, element, matched) in &entries {
        if !included.contains(id) {
            continue;
        }
        let element = copy_json(element, ctx)?;
        selection.push(obj(vec![
            ("module", Value::String(id.0.clone())),
            ("namespace", Value::String(namespace.clone())),
            ("path", text(&format!("/modules/{mi}/elements/{ei}"))),
            ("element", element),
            (
                "includedBy",
                text(if *matched { "match" } else { "reference" }),
            ),
        ]));
    }
    let mut boundary_references = Vec::new();
    let mut boundary_item_types = Vec::new();
    let mut boundary_members = Vec::new();
    let mut boundary_key_fields = Vec::new();
    for entry in &entries {
        let (mi, ei, id, _, element, _) = entry;
        if !included.contains(id) {
            continue;
        }
        let base_path = format!("/modules/{mi}/elements/{ei}");
        if let Some(Value::Array(refs)) = get(element, "references") {
            for (ri, reference) in refs.iter().enumerate() {
                ctx.charge_work(1, Utf16::default())?;
                let target = reference_target(reference).expect("validated reference");
                if !included.contains(&target) {
                    let target_entry = &entries[index[&target]];
                    boundary_references.push(obj(vec![
                        (
                            "from",
                            obj(vec![
                                ("module", Value::String(id.0.clone())),
                                ("element", Value::String(id.1.clone())),
                            ]),
                        ),
                        ("reference", copy_json(reference, ctx)?),
                        (
                            "targetPath",
                            text(&format!(
                                "/modules/{}/elements/{}",
                                target_entry.0, target_entry.1
                            )),
                        ),
                    ]));
                    let _ = ri;
                }
            }
        }
        if let Some(reference) = get(element, "itemType") {
            let target = reference_target(reference).expect("validated itemType");
            if !included.contains(&target) {
                boundary_item_types.push(boundary_entry(
                    id,
                    reference,
                    &target,
                    &index,
                    &entries,
                    &base_path,
                    "/itemType",
                    None,
                    ctx,
                )?);
            }
        }
        if let Some(Value::Array(members)) = get(element, "members") {
            for (i, reference) in members.iter().enumerate() {
                let target = reference_target(reference).expect("validated member reference");
                if !included.contains(&target) {
                    boundary_members.push(boundary_entry(
                        id,
                        reference,
                        &target,
                        &index,
                        &entries,
                        &base_path,
                        &format!("/members/{i}"),
                        None,
                        ctx,
                    )?);
                }
            }
        }
        if let Some(Value::Array(keys)) = get(element, "keys") {
            for (ki, key) in keys.iter().enumerate() {
                let key_id = get(key, "id").and_then(string).cloned().unwrap_or_default();
                if let Some(Value::Array(fields)) = get(key, "fields") {
                    for (fi, reference) in fields.iter().enumerate() {
                        let target =
                            reference_target(reference).expect("validated key field reference");
                        if !included.contains(&target) {
                            boundary_key_fields.push(boundary_entry(
                                id,
                                reference,
                                &target,
                                &index,
                                &entries,
                                &base_path,
                                &format!("/keys/{ki}/fields/{fi}"),
                                Some(key_id.clone()),
                                ctx,
                            )?);
                        }
                    }
                }
            }
        }
    }
    let result = obj(vec![
        ("scope", text("core-elements")),
        (
            "referenceScope",
            text("explicit-core-references-item-types-members-and-keys"),
        ),
        ("source", source),
        ("query", query),
        (
            "sourceValidation",
            source_validation.into_static_source_value()?,
        ),
        ("selection", Value::Array(selection)),
        ("boundaryReferences", Value::Array(boundary_references)),
        ("boundaryItemTypes", Value::Array(boundary_item_types)),
        ("boundaryMembers", Value::Array(boundary_members)),
        ("boundaryKeyFields", Value::Array(boundary_key_fields)),
    ]);
    check_selection_copy_limits(&result, ctx)?;
    copy_json(&result, ctx)
}

fn boundary_entry(
    id: &Identity,
    reference: &Value,
    target: &Identity,
    index: &std::collections::HashMap<Identity, usize>,
    entries: &[(usize, usize, Identity, Utf16, Value, bool)],
    base: &str,
    suffix: &str,
    key_id: Option<Utf16>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let target_entry = &entries[index[target]];
    let mut fields = vec![(
        "from",
        obj(vec![
            ("module", Value::String(id.0.clone())),
            ("element", Value::String(id.1.clone())),
        ]),
    )];
    if let Some(key_id) = key_id {
        fields.push(("key", Value::String(key_id)));
    }
    fields.extend([
        ("reference", copy_json(reference, ctx)?),
        ("path", text(&format!("{base}{suffix}"))),
        (
            "targetPath",
            text(&format!(
                "/modules/{}/elements/{}",
                target_entry.0, target_entry.1
            )),
        ),
    ]);
    Ok(Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (k(key), value))
            .collect(),
    ))
}

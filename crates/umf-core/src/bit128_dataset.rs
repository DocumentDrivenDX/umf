// SPDX-License-Identifier: MIT OR Apache-2.0
//! Complete finite Bit128 dataset validation over the Rust-owned carrier layout.
use crate::{
    bit128_binding::{
        decode_record, encode_record, inspect_bit128_binding, resources, validate_model_layout,
    },
    context::Context,
    engine::{Capabilities, Engine, SemanticContext},
    error::EngineError,
    literal::literal_identity,
    registry::Registry,
    value::{copy_json, Utf16, Value},
};

fn k(value: &str) -> Utf16 {
    Utf16::from(value)
}
fn err(message: &str) -> EngineError {
    EngineError::new("MODEL_DATASET", Utf16::default(), message)
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(name_, _)| name_ == &k(name))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn array(value: Option<&Value>) -> &[Value] {
    match value {
        Some(Value::Array(rows)) => rows,
        _ => &[],
    }
}
fn text(value: Option<&Value>) -> Option<&Utf16> {
    match value {
        Some(Value::String(value)) => Some(value),
        _ => None,
    }
}
fn same_text(
    a: Option<&Value>,
    b: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    match (text(a), text(b)) {
        (Some(left), Some(right)) => {
            ctx.charge_work(left.len().saturating_add(right.len()), Utf16::default())?;
            Ok(left == right)
        }
        _ => Ok(false),
    }
}
fn same_ref(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(same_text(get(a, "module"), get(b, "module"), ctx)?
        && same_text(get(a, "element"), get(b, "element"), ctx)?)
}
fn object_keys(value: &Value, allowed: &[&str]) -> bool {
    matches!(value,Value::Object(fields) if fields.len()==allowed.len()&&fields.iter().all(|(key,_)|allowed.iter().any(|name|key==&k(name))))
}
fn row_value<'a>(
    row: &'a Value,
    field: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    for item in array(Some(row)) {
        ctx.charge_work(1, Utf16::default())?;
        if let Some(reference) = get(item, "field") {
            if same_ref(reference, field, ctx)? {
                return Ok(get(item, "value"));
            }
        }
    }
    Ok(None)
}
fn identity_value(module: &Utf16, element: &Utf16) -> Value {
    Value::Object(vec![
        (k("module"), Value::String(module.clone())),
        (k("element"), Value::String(element.clone())),
    ])
}
fn record_source<'a>(
    source: &'a Value,
    identity: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    let mut owner = None;
    for module in array(get(source, "modules")) {
        ctx.charge_work(1, Utf16::default())?;
        if same_text(get(module, "id"), get(identity, "module"), ctx)? {
            owner = Some(module);
            break;
        }
    }
    let Some(owner) = owner else {
        return Ok(None);
    };
    for element in array(get(owner, "elements")) {
        ctx.charge_work(1, Utf16::default())?;
        if same_text(get(element, "id"), get(identity, "element"), ctx)? {
            return Ok(Some(element));
        }
    }
    Ok(None)
}
fn population<'a>(
    populations: &'a [(Value, Vec<Value>)],
    identity: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Vec<Value>>, EngineError> {
    for (id, rows) in populations {
        ctx.charge_work(1, Utf16::default())?;
        if same_ref(id, identity, ctx)? {
            return Ok(Some(rows));
        }
    }
    Ok(None)
}
fn field_values(
    row: &Value,
    fields: &[Value],
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let mut values = Vec::with_capacity(fields.len());
    for field in fields {
        ctx.charge_work(1, Utf16::default())?;
        let value =
            row_value(row, field, ctx)?.ok_or_else(|| err("Record member value missing"))?;
        values.push(copy_json(value, ctx)?);
    }
    Ok(values)
}
fn key_decl<'a>(
    record: &'a Value,
    key_id: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    for key in array(get(record, "keys")) {
        ctx.charge_work(1, Utf16::default())?;
        if same_text(get(key, "id"), Some(key_id), ctx)? {
            return Ok(Some(key));
        }
    }
    Ok(None)
}
fn tuple_bytes(
    source: &Value,
    record: &Value,
    key: &Value,
    row: &Value,
    engine: &Engine,
    registry: &Registry,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let fields = array(get(key, "fields"));
    let values = Value::Array(field_values(row, fields, ctx)?);
    let identity = Value::Object(vec![
        (
            k("module"),
            copy_json(
                get(record, "module").ok_or_else(|| err("Record identity missing"))?,
                ctx,
            )?,
        ),
        (
            k("element"),
            copy_json(
                get(record, "element").ok_or_else(|| err("Record identity missing"))?,
                ctx,
            )?,
        ),
        (
            k("key"),
            copy_json(
                get(key, "id").ok_or_else(|| err("Key identity missing"))?,
                ctx,
            )?,
        ),
    ]);
    let mut caps = NoCapabilities;
    let receipt = crate::core_key_tuple::encode_core_key_tuple(
        source,
        &identity,
        &values,
        Some("umf-key-tuple-v2"),
        engine,
        registry,
        &mut caps,
        ctx,
    )?;
    text(get(&receipt, "bytesHex"))
        .cloned()
        .ok_or_else(|| err("Key tuple encoder returned no bytes"))
}
fn endpoint_record<'a>(
    source: &'a Value,
    identity: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    record_source(source, identity, ctx)
}
fn endpoint_values(
    row: &Value,
    fields: &[Value],
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    field_values(row, fields, ctx)
}
fn tuple_bytes_values(
    source: &Value,
    record: &Value,
    key: &Value,
    values: &[Value],
    engine: &Engine,
    registry: &Registry,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let identity = Value::Object(vec![
        (
            k("module"),
            copy_json(
                get(record, "module").ok_or_else(|| err("Record identity missing"))?,
                ctx,
            )?,
        ),
        (
            k("element"),
            copy_json(
                get(record, "element").ok_or_else(|| err("Record identity missing"))?,
                ctx,
            )?,
        ),
        (
            k("key"),
            copy_json(
                get(key, "id").ok_or_else(|| err("Key identity missing"))?,
                ctx,
            )?,
        ),
    ]);
    let values = Value::Array(
        values
            .iter()
            .map(|value| copy_json(value, ctx))
            .collect::<Result<Vec<_>, _>>()?,
    );
    let mut caps = NoCapabilities;
    let receipt = crate::core_key_tuple::encode_core_key_tuple(
        source,
        &identity,
        &values,
        Some("umf-key-tuple-v2"),
        engine,
        registry,
        &mut caps,
        ctx,
    )?;
    text(get(&receipt, "bytesHex"))
        .cloned()
        .ok_or_else(|| err("Key tuple encoder returned no bytes"))
}
fn matching_key_row(
    source: &Value,
    record_identity: &Value,
    key: &Value,
    values: &[Value],
    populations: &[(Value, Vec<Value>)],
    engine: &Engine,
    registry: &Registry,
    ctx: &mut Context<'_>,
) -> Result<usize, EngineError> {
    let record = endpoint_record(source, record_identity, ctx)?
        .ok_or_else(|| err("Endpoint Record missing"))?;
    let key_fields = array(get(key, "fields"));
    if key_fields.len() != values.len() {
        return Err(err("Endpoint key component arity differs"));
    }
    let rows = population(populations, record_identity, ctx)?
        .ok_or_else(|| err("Endpoint Record population missing"))?;
    let expected = tuple_bytes_values(source, record_identity, key, values, engine, registry, ctx)?;
    let mut matched = None;
    for (index, row) in rows.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        if tuple_bytes(source, record_identity, key, row, engine, registry, ctx)? == expected {
            if matched.is_some() {
                return Err(err("Endpoint key is ambiguous"));
            }
            matched = Some(index);
        }
    }
    matched.ok_or_else(|| err("Orphan endpoint"))
}
fn limit(multiplicity: &Value, count: usize) -> bool {
    let min = get(multiplicity, "min")
        .and_then(|v| {
            if let Value::Number(n) = v {
                Some(*n as usize)
            } else {
                None
            }
        })
        .unwrap_or(0);
    let max = get(multiplicity, "max");
    count >= min
        && match max {
            Some(Value::String(s)) if s == &k("*") => true,
            Some(Value::Number(n)) => count <= *n as usize,
            _ => false,
        }
}
fn check_bounds(
    declaration: &Value,
    edges: &[(usize, usize)],
    source_len: usize,
    target_len: usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut source_counts = vec![0usize; source_len];
    let mut target_counts = vec![0usize; target_len];
    let mut distinct = Vec::new();
    for edge in edges {
        ctx.charge_work(1, Utf16::default())?;
        let mut found = false;
        for prior in &distinct {
            ctx.charge_work(1, Utf16::default())?;
            if prior == edge {
                found = true;
                break;
            }
        }
        if !found {
            distinct.push(*edge);
        }
    }
    for (source, target) in distinct {
        source_counts[source] += 1;
        target_counts[target] += 1;
    }
    for count in source_counts {
        ctx.charge_work(1, Utf16::default())?;
        if !limit(
            get(declaration, "targetMultiplicity").unwrap_or(&Value::Null),
            count,
        ) {
            return Err(err("Distinct endpoint multiplicity violated"));
        }
    }
    for count in target_counts {
        ctx.charge_work(1, Utf16::default())?;
        if !limit(
            get(declaration, "sourceMultiplicity").unwrap_or(&Value::Null),
            count,
        ) {
            return Err(err("Distinct endpoint multiplicity violated"));
        }
    }
    Ok(())
}
struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<crate::Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

/// Validate and return a normalized finite snapshot of every bound Record.
pub fn validate_bit128_dataset(
    binding_input: &Value,
    source_input: &Value,
    input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let binding = copy_json(binding_input, ctx)?;
    let source = copy_json(source_input, ctx)?;
    let input = copy_json(input, ctx)?;
    let validation = inspect_bit128_binding(&binding, &source, ctx)?;
    if !validation.valid {
        return Err(EngineError::new(
            "BINDING_DOCUMENT",
            Utf16::default(),
            "Invalid Bit128 binding/model pair",
        ));
    }
    let payload = get(
        get(&binding, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .ok_or_else(|| err("Binding payload missing"))?;
    validate_model_layout(payload, &source, ctx)?;
    let (engine, registry) = resources(ctx)?;
    let Value::Array(input_rows) = input else {
        return Err(err("Exact complete Record populations required"));
    };
    let mut records = Vec::new();
    for module in array(get(&source, "modules")) {
        ctx.charge_work(1, Utf16::default())?;
        let module_id =
            text(get(module, "id")).ok_or_else(|| err("Record module identity missing"))?;
        for element in array(get(module, "elements")) {
            ctx.charge_work(1, Utf16::default())?;
            if text(get(element, "kind")) == Some(&k("record")) {
                let element_id =
                    text(get(element, "id")).ok_or_else(|| err("Record identity missing"))?;
                records.push(identity_value(module_id, element_id));
            }
        }
    }
    if input_rows.len() != records.len() {
        return Err(err("Exact complete Record populations required"));
    }
    let mut populations: Vec<(Value, Vec<Value>)> = Vec::new();
    for record_id in &records {
        let mut entries = Vec::new();
        for row in &input_rows {
            ctx.charge_work(1, Utf16::default())?;
            if let Some(reference) = get(row, "record") {
                if same_ref(reference, record_id, ctx)? {
                    entries.push(row);
                }
            }
        }
        if entries.len() != 1 {
            return Err(err("Record population missing/malformed"));
        }
        let population = entries[0];
        if !object_keys(population, &["record", "rows"]) {
            return Err(err("Record population missing/malformed"));
        }
        let Value::Array(rows) =
            get(population, "rows").ok_or_else(|| err("Record population missing/malformed"))?
        else {
            return Err(err("Record population missing/malformed"));
        };
        let mut normalized = Vec::with_capacity(rows.len());
        for row in rows {
            ctx.charge_work(1, Utf16::default())?;
            let slots = encode_record(&binding, &source, record_id, row, ctx)?;
            normalized.push(decode_record(&binding, &source, record_id, &slots, ctx)?);
        }
        populations.push((copy_json(record_id, ctx)?, normalized));
    }
    // Reject duplicate Record population identities, including non-record extras.
    for (index, row) in input_rows.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        if !object_keys(row, &["record", "rows"]) {
            return Err(err("Record population missing/malformed"));
        }
        let identity =
            get(row, "record").ok_or_else(|| err("Record population missing/malformed"))?;
        let mut known = false;
        for record in &records {
            ctx.charge_work(1, Utf16::default())?;
            if same_ref(record, identity, ctx)? {
                known = true;
                break;
            }
        }
        let mut duplicate = false;
        for previous in &input_rows[..index] {
            ctx.charge_work(1, Utf16::default())?;
            if let Some(old) = get(previous, "record") {
                if same_ref(old, identity, ctx)? {
                    duplicate = true;
                    break;
                }
            }
        }
        if !known || duplicate {
            return Err(err("Exact complete Record populations required"));
        }
    }
    // Every declared logical Key must be unique in its exact Record population.
    for (record_id, rows) in &populations {
        ctx.charge_work(1, Utf16::default())?;
        let record =
            record_source(&source, record_id, ctx)?.ok_or_else(|| err("Record missing"))?;
        for key in array(get(record, "keys")) {
            ctx.charge_work(1, Utf16::default())?;
            let id = get(key, "id").ok_or_else(|| err("Key identity missing"))?;
            let mut seen = Vec::new();
            for row in rows {
                ctx.charge_work(1, Utf16::default())?;
                let bytes = tuple_bytes(&source, record_id, key, row, &engine, &registry, ctx)?;
                let mut duplicate = false;
                for prior in &seen {
                    ctx.charge_work(bytes.len(), Utf16::default())?;
                    if prior == &bytes {
                        duplicate = true;
                        break;
                    }
                }
                if duplicate {
                    return Err(err("Duplicate logical Key"));
                }
                seen.push(bytes);
            }
            let _ = id;
        }
    }
    // Unique index keys use the core's exact schema-literal identity rules.
    for index in array(get(payload, "indexes")) {
        ctx.charge_work(1, Utf16::default())?;
        if !matches!(get(index, "unique"), Some(Value::Bool(true))) {
            continue;
        }
        let targets = array(get(index, "on"));
        let fields: Vec<Value> = targets
            .iter()
            .map(|target| {
                get(target, "field")
                    .cloned()
                    .ok_or_else(|| err("Unique index Field required"))
            })
            .collect::<Result<_, _>>()?;
        let first_field = fields
            .first()
            .ok_or_else(|| err("Unique index Field required"))?;
        let mut owner = None;
        for record in &records {
            ctx.charge_work(1, Utf16::default())?;
            let Some(definition) = record_source(&source, record, ctx)? else {
                continue;
            };
            let mut owns = false;
            for member in array(get(definition, "members")) {
                ctx.charge_work(1, Utf16::default())?;
                if same_ref(member, first_field, ctx)? {
                    owns = true;
                    break;
                }
            }
            if owns {
                owner = Some(record);
                break;
            }
        }
        let owner = owner.ok_or_else(|| err("Unique index Record owner missing"))?;
        let rows = population(&populations, owner, ctx)?
            .ok_or_else(|| err("Record population missing"))?;
        let mut seen: Vec<Vec<Utf16>> = Vec::new();
        for row in rows {
            ctx.charge_work(1, Utf16::default())?;
            let values = field_values(row, &fields, ctx)?;
            if values.iter().any(|value| matches!(value, Value::Null)) {
                continue;
            }
            let mut identity = Vec::new();
            for (field, value) in fields.iter().zip(&values) {
                let definition = record_source(&source, field, ctx)?
                    .ok_or_else(|| err("Index Field missing"))?;
                identity.push(
                    literal_identity(definition, value, engine.policy(), ctx)?
                        .ok_or_else(|| err("Unique index value has no exact literal identity"))?,
                );
            }
            let mut duplicate = false;
            for prior in &seen {
                ctx.charge_work(identity.iter().map(Utf16::len).sum(), Utf16::default())?;
                if prior == &identity {
                    duplicate = true;
                    break;
                }
            }
            if duplicate {
                return Err(err("Duplicate unique index"));
            }
            seen.push(identity);
        }
    }
    // Physical foreign-key layouts enforce composite nullability, endpoint existence and declared multiplicity.
    for module in array(get(&source, "modules")) {
        for declaration in array(get(module, "relationships")) {
            ctx.charge_work(1, Utf16::default())?;
            let module_id = text(get(module, "id"))
                .ok_or_else(|| err("Relationship module identity missing"))?;
            let relationship_id =
                get(declaration, "id").ok_or_else(|| err("Relationship identity missing"))?;
            let mut selected_layout = None;
            for row in array(get(payload, "relationships")) {
                ctx.charge_work(1, Utf16::default())?;
                let layout_module = text(get(row, "module"));
                if let Some(layout_module) = layout_module {
                    ctx.charge_work(
                        layout_module.len().saturating_add(module_id.len()),
                        Utf16::default(),
                    )?;
                    if layout_module == module_id && get(row, "id") == Some(relationship_id) {
                        selected_layout = Some(row);
                        break;
                    }
                }
            }
            let layout = selected_layout.ok_or_else(|| err("Relationship layout missing"))?;
            if text(get(layout, "storage")) == Some(&k("junction")) {
                let association_id =
                    get(layout, "record").ok_or_else(|| err("Association Record required"))?;
                let association_rows = population(&populations, association_id, ctx)?
                    .ok_or_else(|| err("Association Record population missing"))?;
                let source_ends = array(get(declaration, "source"));
                let target_ends = array(get(declaration, "target"));
                let source_maps = array(get(layout, "source"));
                let target_maps = array(get(layout, "target"));
                let select = |row: &Value,
                              ends: &[Value],
                              maps: &[Value],
                              populations: &[(Value, Vec<Value>)],
                              ctx: &mut Context<'_>|
                 -> Result<(Value, usize), EngineError> {
                    let mut selected = None;
                    for (position, map) in maps.iter().enumerate() {
                        let endpoint = get(map, "record")
                            .ok_or_else(|| err("Association endpoint Record missing"))?;
                        let key_id = get(map, "key")
                            .ok_or_else(|| err("Association endpoint Key missing"))?;
                        let fields = array(get(map, "fields"));
                        let values = endpoint_values(row, fields, ctx)?;
                        let nulls = values.iter().filter(|v| matches!(v, Value::Null)).count();
                        if nulls > 0 && nulls != values.len() {
                            return Err(err("Partial composite association endpoint"));
                        }
                        if nulls == values.len() {
                            continue;
                        }
                        if selected.is_some() {
                            return Err(err(
                                "Association needs exactly one endpoint alternative per side",
                            ));
                        }
                        let end = ends
                            .get(position)
                            .ok_or_else(|| err("Association endpoint declaration missing"))?;
                        if !same_ref(endpoint, end, ctx)? {
                            return Err(err(
                                "Association endpoint Record differs from declaration",
                            ));
                        }
                        let endpoint_record = record_source(&source, endpoint, ctx)?
                            .ok_or_else(|| err("Association endpoint Record missing"))?;
                        let key = key_decl(endpoint_record, key_id, ctx)?
                            .ok_or_else(|| err("Association endpoint Key missing"))?;
                        let index = matching_key_row(
                            &source,
                            endpoint,
                            key,
                            &values,
                            populations,
                            &engine,
                            &registry,
                            ctx,
                        )?;
                        let mut offset = 0usize;
                        for previous in &ends[..position] {
                            let rows = population(populations, previous, ctx)?
                                .ok_or_else(|| err("Endpoint Record population missing"))?;
                            offset += rows.len();
                        }
                        selected = Some((copy_json(endpoint, ctx)?, offset + index));
                    }
                    selected.ok_or_else(|| {
                        err("Association needs exactly one endpoint alternative per side")
                    })
                };
                let source_len = source_ends
                    .iter()
                    .map(|end| {
                        population(&populations, end, ctx).and_then(|rows| {
                            rows.map(Vec::len)
                                .ok_or_else(|| err("Source Record population missing"))
                        })
                    })
                    .collect::<Result<Vec<_>, _>>()?
                    .into_iter()
                    .sum();
                let target_len = target_ends
                    .iter()
                    .map(|end| {
                        population(&populations, end, ctx).and_then(|rows| {
                            rows.map(Vec::len)
                                .ok_or_else(|| err("Target Record population missing"))
                        })
                    })
                    .collect::<Result<Vec<_>, _>>()?
                    .into_iter()
                    .sum();
                let mut edges = Vec::new();
                for row in association_rows {
                    let (_, source_index) =
                        select(row, source_ends, source_maps, &populations, ctx)?;
                    let (_, target_index) =
                        select(row, target_ends, target_maps, &populations, ctx)?;
                    edges.push((source_index, target_index));
                }
                check_bounds(declaration, &edges, source_len, target_len, ctx)?;
                continue;
            }
            if text(get(layout, "storage")) != Some(&k("foreign_key")) {
                return Err(err("Unsupported relationship dataset layout"));
            }
            let source_end = &array(get(declaration, "source"))[0];
            let target_end = &array(get(declaration, "target"))[0];
            let source_id = identity_value(
                text(get(source_end, "module"))
                    .ok_or_else(|| err("Source Record identity missing"))?,
                text(get(source_end, "element"))
                    .ok_or_else(|| err("Source Record identity missing"))?,
            );
            let target_id = identity_value(
                text(get(target_end, "module"))
                    .ok_or_else(|| err("Target Record identity missing"))?,
                text(get(target_end, "element"))
                    .ok_or_else(|| err("Target Record identity missing"))?,
            );
            let source_rows = population(&populations, &source_id, ctx)?
                .ok_or_else(|| err("Source Record population missing"))?;
            let target_rows = population(&populations, &target_id, ctx)?
                .ok_or_else(|| err("Target Record population missing"))?;
            let target_definition = record_source(&source, &target_id, ctx)?
                .ok_or_else(|| err("Target Record missing"))?;
            let target_key = key_decl(
                target_definition,
                get(target_end, "key").ok_or_else(|| err("Target Key missing"))?,
                ctx,
            )?
            .ok_or_else(|| err("Target Key missing"))?;
            let foreign_fields = array(get(layout, "fields"));
            let mut edges = Vec::new();
            for (source_index, row) in source_rows.iter().enumerate() {
                let values = field_values(row, foreign_fields, ctx)?;
                let null_count = values.iter().filter(|v| matches!(v, Value::Null)).count();
                if null_count > 0 {
                    if null_count != values.len() {
                        return Err(err("Partial composite foreign key"));
                    }
                    continue;
                }
                let target_index = matching_key_row(
                    &source,
                    &target_id,
                    target_key,
                    &values,
                    &populations,
                    &engine,
                    &registry,
                    ctx,
                )?;
                edges.push((source_index, target_index));
            }
            check_bounds(
                declaration,
                &edges,
                source_rows.len(),
                target_rows.len(),
                ctx,
            )?;
        }
    }
    let result = populations
        .into_iter()
        .map(|(record, rows)| {
            Value::Object(vec![(k("record"), record), (k("rows"), Value::Array(rows))])
        })
        .collect();
    Ok(Value::Array(result))
}

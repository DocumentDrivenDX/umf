// SPDX-License-Identifier: MIT OR Apache-2.0
//! Version 0.7 checked conversion-plan compiler, kept separate from legacy plans.
use super::*;

fn v<'a>(value: &'a Value, key: &str) -> &'a Value {
    get(value, key).unwrap_or(&Value::Null)
}
fn items(value: Option<&Value>) -> &[Value] {
    match value {
        Some(Value::Array(values)) => values,
        _ => &[],
    }
}
fn fail(path: &str, message: &str) -> EngineError {
    error("TABLE_MIGRATION_OPTIONS", path, message)
}
fn exact(value: &Value, names: &[&str]) -> bool {
    exact_members(value, names)
}
fn markers(candidates: &[Value], ctx: &mut Context<'_>) -> Result<Vec<Value>, EngineError> {
    let mut out = Vec::new();
    out.try_reserve(candidates.len())
        .map_err(|_| error("LIMIT", "/options/reviewedChanges", "Allocation refused"))?;
    for candidate in candidates {
        charge(ctx, 1, "/options/reviewedChanges")?;
        let Some(Value::Object(fields)) = Some(candidate) else {
            continue;
        };
        let mut projected = Vec::new();
        projected
            .try_reserve(fields.len())
            .map_err(|_| error("LIMIT", "/options/reviewedChanges", "Allocation refused"))?;
        for (key, value) in fields {
            if key != &Utf16::from("oldValue")
                && key != &Utf16::from("newValue")
                && key != &Utf16::from("oldPath")
                && key != &Utf16::from("newPath")
            {
                projected.push((key.clone(), copy_value(value, ctx)?));
            }
        }
        out.push(Value::Object(projected));
    }
    Ok(out)
}
fn selection_key(selection: &Value) -> Option<String> {
    Some(format!(
        "{}|{}",
        text(get(selection, "table")?)?,
        ref_key(get(selection, "field")?)?
    ))
}
fn source_field<'a>(
    document: &'a Value,
    module_id: &Value,
    element_id: &Value,
) -> Option<&'a Value> {
    items(get(document, "modules"))
        .iter()
        .find(|module| get(module, "id") == Some(module_id))
        .and_then(|module| {
            items(get(module, "elements"))
                .iter()
                .find(|element| get(element, "id") == Some(element_id))
        })
}
fn target(selection: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    Ok(object(vec![
        ("table", copy_value(v(selection, "table"), ctx)?),
        ("field", copy_value(v(selection, "field"), ctx)?),
    ]))
}
fn meaning_digest(meaning: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let value = object(vec![
        (
            "physical",
            copy_value(v(v(meaning, "meaning"), "physical"), ctx)?,
        ),
        (
            "logical",
            copy_value(v(v(meaning, "meaning"), "logical"), ctx)?,
        ),
        (
            "mapping",
            copy_value(v(v(meaning, "meaning"), "mapping"), ctx)?,
        ),
    ]);
    digest(&value, ctx)
}
fn assign_member(
    target: &mut Value,
    key: &str,
    source: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(fields) = target else {
        return Err(fail("/next/source", "G04 source object is malformed"));
    };
    if let Some(index) = fields
        .iter()
        .position(|(name, _)| name == &Utf16::from(key))
    {
        if let Some(source) = source {
            fields[index].1 = copy_value(source, ctx)?;
        } else {
            fields.remove(index);
        }
    } else if let Some(source) = source {
        fields
            .try_reserve(1)
            .map_err(|_| error("LIMIT", "/next/source", "Allocation refused"))?;
        fields.push((Utf16::from(key), copy_value(source, ctx)?));
    }
    Ok(())
}
fn mutate_selected_source(
    before: &Value,
    after: &mut Value,
    previous: &Value,
    next: &Value,
    selections: &[Value],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    for selection in selections {
        let field = v(selection, "field");
        let module_id = get(field, "module").unwrap_or(&Value::Null);
        let element_id = get(field, "element").unwrap_or(&Value::Null);
        let old_field = source_field(before, module_id, element_id)
            .ok_or_else(|| fail("/previous/source", "G04 Field is missing"))?;
        source_field(after, module_id, element_id)
            .ok_or_else(|| fail("/next/source", "G04 Field is missing"))?;
        let Value::Array(modules) = get_mut(after, "modules")? else {
            return Err(fail("/next/source", "G04 modules are malformed"));
        };
        let module = modules
            .iter_mut()
            .find(|module| get(module, "id") == Some(module_id))
            .ok_or_else(|| fail("/next/source", "G04 Field module is missing"))?;
        let Value::Array(elements) = member_mut(module, "elements")
            .ok_or_else(|| fail("/next/source", "G04 elements are malformed"))?
        else {
            return Err(fail("/next/source", "G04 elements are malformed"));
        };
        let target_field = elements
            .iter_mut()
            .find(|element| get(element, "id") == Some(element_id))
            .ok_or_else(|| fail("/next/source", "G04 Field is missing"))?;
        for key in ["scalarType", "facets"] {
            assign_member(target_field, key, get(old_field, key), ctx)?;
        }

        let old_module_id = get(previous, "module")
            .ok_or_else(|| fail("/previous/module", "G04 module is missing"))?;
        let new_module_id =
            get(next, "module").ok_or_else(|| fail("/next/module", "G04 module is missing"))?;
        let old_table = items(get(before, "modules"))
            .iter()
            .find(|module| get(module, "id") == Some(old_module_id))
            .and_then(|module| get(module, "extensions"))
            .and_then(|extensions| get(extensions, "umf.tables"))
            .and_then(|payload| {
                items(get(payload, "tables"))
                    .iter()
                    .find(|table| get(table, "id") == get(selection, "table"))
            })
            .ok_or_else(|| fail("/previous/source", "G04 table mapping is missing"))?;
        let old_mapping = items(get(old_table, "columns"))
            .iter()
            .find(|column| ref_key(v(column, "field")) == ref_key(field))
            .ok_or_else(|| fail("/previous/source", "G04 column mapping is missing"))?;
        let Value::Array(modules) = get_mut(after, "modules")? else {
            return Err(fail("/next/source", "G04 modules are malformed"));
        };
        let module = modules
            .iter_mut()
            .find(|module| get(module, "id") == Some(new_module_id))
            .ok_or_else(|| fail("/next/source", "G04 module is missing"))?;
        let payload = member_mut(module, "extensions")
            .and_then(|extensions| member_mut(extensions, "umf.tables"))
            .ok_or_else(|| fail("/next/source", "G04 table extension is missing"))?;
        let table = items_mut(payload, "tables")?
            .iter_mut()
            .find(|table| get(table, "id") == get(selection, "table"))
            .ok_or_else(|| fail("/next/source", "G04 table is missing"))?;
        let mapping = items_mut(table, "columns")?
            .iter_mut()
            .find(|column| ref_key(v(column, "field")) == ref_key(field))
            .ok_or_else(|| fail("/next/source", "G04 column mapping is missing"))?;
        assign_member(mapping, "nativeType", get(old_mapping, "nativeType"), ctx)?;
    }
    Ok(())
}

fn validate_source_delta(
    previous: &Value,
    next: &Value,
    selections: &[Value],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    for key in ["configuration", "module", "profile", "seedSets"] {
        if !eq(v(previous, key), v(next, key), ctx)? {
            return Err(fail(
                "/next/source",
                "G04 cannot change configuration, module, profile or seed meaning",
            ));
        }
    }
    let mut old_doc = source_document(previous, ctx)?;
    let mut new_doc = source_document(next, ctx)?;
    mutate_selected_source(&old_doc, &mut new_doc, previous, next, selections, ctx)?;
    if !eq(&old_doc, &new_doc, ctx)? {
        return Err(fail(
            "/next/source",
            "G04 source may change only selected Field type facets and native mappings",
        ));
    }
    let mut old_catalog = copy_value(v(previous, "expectedCatalog"), ctx)?;
    let mut new_catalog = copy_value(v(next, "expectedCatalog"), ctx)?;
    for selection in selections {
        let field = v(selection, "field");
        let table_id = v(selection, "table");
        let old_table = items(get(&old_catalog, "tables"))
            .iter()
            .find(|table| get(table, "id") == Some(table_id))
            .ok_or_else(|| fail("/previous/expectedCatalog", "G04 table is missing"))?;
        let old_mapping = items(get(old_table, "columns"))
            .iter()
            .find(|mapping| ref_key(v(mapping, "field")) == ref_key(field))
            .ok_or_else(|| fail("/previous/expectedCatalog", "G04 mapping is missing"))?;
        let new_tables = items_mut(&mut new_catalog, "tables")?;
        let new_table = new_tables
            .iter_mut()
            .find(|table| get(table, "id") == Some(table_id))
            .ok_or_else(|| fail("/next/expectedCatalog", "G04 table is missing"))?;
        let new_mapping = items_mut(new_table, "columns")?
            .iter_mut()
            .find(|mapping| ref_key(v(mapping, "field")) == ref_key(field))
            .ok_or_else(|| fail("/next/expectedCatalog", "G04 mapping is missing"))?;
        assign_member(
            new_mapping,
            "nativeType",
            get(old_mapping, "nativeType"),
            ctx,
        )?;
        let old_column = items(get(&old_catalog, "columns"))
            .iter()
            .find(|column| {
                get(column, "table") == Some(table_id)
                    && ref_key(v(column, "field")) == ref_key(field)
            })
            .ok_or_else(|| fail("/previous/expectedCatalog", "G04 column is missing"))?;
        let new_column = items_mut(&mut new_catalog, "columns")?
            .iter_mut()
            .find(|column| {
                get(column, "table") == Some(table_id)
                    && ref_key(v(column, "field")) == ref_key(field)
            })
            .ok_or_else(|| fail("/next/expectedCatalog", "G04 column is missing"))?;
        for key in ["typeSchema", "typeName", "typeMod", "definitionSql"] {
            assign_member(new_column, key, get(old_column, key), ctx)?;
        }
    }
    if !eq(&old_catalog, &new_catalog, ctx)? {
        return Err(fail(
            "/next/expectedCatalog",
            "G04 physical catalogs may change only selected native type definitions",
        ));
    }
    Ok(())
}

fn references_field(
    value: &Value,
    field: &Value,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    charge(ctx, 1, "/options/conversions")?;
    if let Value::Object(members) = value {
        if members.len() == 2
            && get(value, "module") == get(field, "module")
            && get(value, "element") == get(field, "element")
        {
            return Ok(true);
        }
        for (_, child) in members {
            if references_field(child, field, ctx)? {
                return Ok(true);
            }
        }
    } else if let Value::Array(items) = value {
        for child in items {
            if references_field(child, field, ctx)? {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn refuse_dependencies(
    next: &Value,
    selections: &[Value],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let document = source_document(next, ctx)?;
    let module_id = v(next, "module");
    let module = items(get(&document, "modules"))
        .iter()
        .find(|module| get(module, "id") == Some(module_id))
        .ok_or_else(|| fail("/next/source", "G04 source module is missing"))?;
    let payload = get(v(module, "extensions"), "umf.tables")
        .ok_or_else(|| fail("/next/source", "G04 tables extension is missing"))?;
    let tables = items(get(payload, "tables"));
    for selection in selections {
        let table_id = v(selection, "table");
        let field = v(selection, "field");
        let table = tables
            .iter()
            .find(|table| get(table, "id") == Some(table_id))
            .ok_or_else(|| fail("/next/source", "G04 target table is missing"))?;
        let mapping = items(get(table, "columns"))
            .iter()
            .find(|mapping| ref_key(v(mapping, "field")) == ref_key(field))
            .ok_or_else(|| fail("/next/source", "G04 target mapping is missing"))?;
        if get(mapping, "default").is_some()
            || get(mapping, "generated") == Some(&Value::Bool(true))
            || get(mapping, "immutable") == Some(&Value::Bool(true))
        {
            return Err(fail(
                "/options/conversions",
                "G04 refuses native defaults, generated columns and immutable fields",
            ));
        }
        for key in ["indexes", "checks", "foreignKeys"] {
            for dependency in items(get(table, key)) {
                if references_field(dependency, field, ctx)? {
                    return Err(fail(
                        "/options/conversions",
                        "G04 refuses conversion targets with dependent indexes, checks or foreign keys",
                    ));
                }
            }
        }
        for candidate in tables {
            if references_field(v(candidate, "policy"), field, ctx)? {
                return Err(fail(
                    "/options/conversions",
                    "G04 refuses conversion targets referenced by row policies",
                ));
            }
        }
        if references_field(get(payload, "commands").unwrap_or(&Value::Null), field, ctx)? {
            return Err(fail(
                "/options/conversions",
                "G04 refuses conversion targets referenced by operations",
            ));
        }
        let record_ref = v(table, "record");
        let record_module = items(get(&document, "modules"))
            .iter()
            .find(|module| get(module, "id") == get(record_ref, "module"));
        if let Some(record) = record_module.and_then(|module| {
            items(get(module, "elements"))
                .iter()
                .find(|element| get(element, "id") == get(record_ref, "element"))
        }) {
            if references_field(get(record, "keys").unwrap_or(&Value::Null), field, ctx)? {
                return Err(fail(
                    "/options/conversions",
                    "G04 refuses conversion targets used by record keys",
                ));
            }
            for key in items(get(record, "keys")) {
                if !references_field(v(key, "fields"), field, ctx)? {
                    continue;
                }
                let key_id = get(key, "id");
                for candidate in tables {
                    for foreign_key in items(get(candidate, "foreignKeys")) {
                        let target = v(foreign_key, "target");
                        if get(target, "record") == Some(record_ref) && get(target, "key") == key_id
                        {
                            return Err(fail(
                                "/options/conversions",
                                "G04 refuses conversion targets referenced by inbound foreign keys",
                            ));
                        }
                    }
                }
            }
        }
    }
    Ok(())
}
fn get_mut<'a>(value: &'a mut Value, key: &str) -> Result<&'a mut Value, EngineError> {
    member_mut(value, key).ok_or_else(|| fail("/next/source", "G04 source member is missing"))
}
fn items_mut<'a>(value: &'a mut Value, key: &str) -> Result<&'a mut Vec<Value>, EngineError> {
    match get_mut(value, key)? {
        Value::Array(items) => Ok(items),
        _ => Err(fail("/next/source", "G04 source array is malformed")),
    }
}

pub(super) fn compile(
    input: &Value,
    previous: Option<&Value>,
    next: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let options =
        get(input, "options").ok_or_else(|| fail("/options", "G04 options are required"))?;
    if !exact(
        options,
        &[
            "version",
            "backfills",
            "concurrentIndexes",
            "reviewedChanges",
            "validations",
            "conversions",
        ],
    ) || text(get(options, "version").unwrap_or(&Value::Null)).as_deref()
        != Some("umf.table-migration-options/0.7")
        || !matches!(get(options, "backfills"), Some(Value::Array(items)) if items.is_empty())
        || !matches!(get(options, "concurrentIndexes"), Some(Value::Array(items)) if items.is_empty())
        || !matches!(get(options, "validations"), Some(Value::Array(items)) if items.is_empty())
        || !matches!(get(options, "reviewedChanges"), Some(Value::Array(_)))
        || !matches!(get(options, "conversions"), Some(Value::Array(items)) if !items.is_empty() && items.len() <= 256)
    {
        return Err(fail(
            "/options",
            "Unknown G04 options profile, members or resource bounds",
        ));
    }
    let previous = previous.ok_or_else(|| {
        fail(
            "/previous",
            "G04 conversion requires an installed predecessor",
        )
    })?;
    for (label, bundle) in [("previous", previous), ("next", next)] {
        if text(get(v(bundle, "source"), "format").unwrap_or(&Value::Null)).as_deref()
            != Some("json")
        {
            return Err(fail(
                &format!("/{label}/source/format"),
                "G04 requires exact JSON retained sources",
            ));
        }
    }
    let selections = items(get(options, "conversions"));
    // Discovery validates each closed recipe, exact logical/native domains, the
    // exact changed Field, and source-bound before/after conversion meanings.
    charge(
        ctx,
        selections.len().saturating_mul(64),
        "/options/conversions",
    )?;
    let mut intents = Vec::new();
    intents
        .try_reserve(selections.len())
        .map_err(|_| error("LIMIT", "/options/conversions", "Allocation refused"))?;
    for selection in selections {
        let mut intent = copy_value(selection, ctx)?;
        if let Value::Object(members) = &mut intent {
            if let Some((_, recovery)) = members
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("recovery"))
            {
                if text(get(recovery, "mode").unwrap_or(&Value::Null)).as_deref()
                    == Some("irreversible")
                {
                    *recovery = object(vec![("mode", s("irreversible"))]);
                }
            }
        }
        intents.push(intent);
    }
    let mut candidates = discover_verified(previous, next, true, ctx)?;
    let added = discovery::discover_added_constraints(previous, next, ctx)?;
    candidates = interleave_g03_added_constraints(
        candidates,
        added,
        items(get(v(next, "expectedCatalog"), "tables")),
        ctx,
    )?;
    candidates.extend(discovery::discover_default_changes(previous, next, ctx)?);
    candidates.extend(discovery::discover_operation_context_changes(
        previous, next, ctx,
    )?);
    candidates.extend(discovery::discover_g04_conversions(
        previous, next, &intents, ctx,
    )?);
    let mut candidate_values = Vec::new();
    candidate_values
        .try_reserve(candidates.len())
        .map_err(|_| error("LIMIT", "/options/reviewedChanges", "Allocation refused"))?;
    for candidate in &candidates {
        candidate_values.push(copy_value(candidate, ctx)?);
    }
    if candidates.len() > 512
        || crate::canonical::canonical_json_admitted(&array(candidate_values), ctx)?.len()
            > 24_000_000
    {
        return Err(fail(
            "/options/reviewedChanges",
            "G04 discovery exceeds its marker bound",
        ));
    }
    let expected_markers = markers(&candidates, ctx)?;
    if !eq(
        get(options, "reviewedChanges").unwrap(),
        &array(expected_markers),
        ctx,
    )? {
        return Err(fail(
            "/options/reviewedChanges",
            "G04 review markers must exactly match ordered source discovery",
        ));
    }
    charge(
        ctx,
        candidates.len().saturating_mul(2),
        "/options/reviewedChanges",
    )?;
    let mut type_candidates = Vec::new();
    let mut effect_candidates = Vec::new();
    type_candidates
        .try_reserve(selections.len())
        .map_err(|_| error("LIMIT", "/options/reviewedChanges", "Allocation refused"))?;
    effect_candidates
        .try_reserve(selections.len())
        .map_err(|_| error("LIMIT", "/options/reviewedChanges", "Allocation refused"))?;
    for candidate in &candidates {
        match text(v(candidate, "kind")).as_deref() {
            Some("change-column-type") => type_candidates.push(candidate),
            Some("conversion-effects") => effect_candidates.push(candidate),
            Some("change-operation-context") => {}
            _ => {
                return Err(fail(
                    "/next/source",
                    "G04 refuses unselected source changes and dependencies",
                ));
            }
        }
    }
    if type_candidates.len() != selections.len() || effect_candidates.len() != selections.len() {
        return Err(fail(
            "/options/conversions",
            "Each selected conversion must bind one exact type change and one effects marker",
        ));
    }
    validate_source_delta(previous, next, selections, ctx)?;
    refuse_dependencies(next, selections, ctx)?;
    let selected = selections
        .iter()
        .map(selection_key)
        .collect::<Option<std::collections::BTreeSet<_>>>()
        .ok_or_else(|| fail("/options/conversions", "Invalid conversion identity"))?;
    for candidate in &type_candidates {
        let meaning = v(candidate, "newValue");
        let physical = v(meaning, "physical");
        let key = format!(
            "{}|{}",
            text(v(physical, "table")).unwrap_or_default(),
            ref_key(v(physical, "field")).unwrap_or_default()
        );
        if !selected.contains(&key) {
            return Err(fail(
                "/next/source",
                "Unselected Field type change is not admitted",
            ));
        }
    }
    for (index, selection) in selections.iter().enumerate() {
        let recovery = v(selection, "recovery");
        match text(v(recovery, "mode")).as_deref() {
            Some("irreversible") => {
                if !exact(recovery, &["mode", "reviewMarker"]) {
                    return Err(fail(
                        &format!("/options/conversions/{index}/recovery"),
                        "Irreversible recovery needs its exact effects marker",
                    ));
                }
                let id = get(recovery, "reviewMarker").unwrap();
                let selected_key = selection_key(selection);
                let matched = effect_candidates.iter().any(|candidate| {
                    let meaning = v(v(candidate, "newValue"), "meaning");
                    get(candidate, "id") == Some(id)
                        && get(candidate, "path") == get(v(meaning, "physical"), "sourcePath")
                        && selection_key(v(v(candidate, "newValue"), "conversionIntent"))
                            == selected_key
                });
                if !matched {
                    return Err(fail(
                        &format!("/options/conversions/{index}/recovery/reviewMarker"),
                        "Irreversible recovery must name this conversion's effects marker",
                    ));
                }
            }
            Some("retained-originals") => {
                if !exact(recovery, &["mode", "policy"])
                    || !exact(v(recovery, "policy"), &["id", "revision"])
                {
                    return Err(fail(
                        &format!("/options/conversions/{index}/recovery"),
                        "Retained originals requires an exact policy identity",
                    ));
                }
            }
            Some("round-trip") => {
                return Err(fail(
                    &format!("/options/conversions/{index}/recovery"),
                    "Round-trip recovery requires a qualified target CHECK installer and witness",
                ));
            }
            _ => {
                return Err(fail(
                    &format!("/options/conversions/{index}/recovery"),
                    "Unknown recovery mode",
                ));
            }
        }
    }
    let id = copy_value(v(input, "id"), ctx)?;
    let predecessor = copy_value(v(input, "predecessor"), ctx)?;
    charge(
        ctx,
        selections.len().saturating_mul(3).saturating_mul(256),
        "/steps",
    )?;
    let mut steps = Vec::new();
    steps
        .try_reserve(selections.len().saturating_mul(3))
        .map_err(|_| error("LIMIT", "/steps", "Allocation refused"))?;
    for (index, selection) in selections.iter().enumerate() {
        let recovery = v(selection, "recovery");
        if text(v(recovery, "mode")).as_deref() == Some("retained-originals") {
            steps.push(conversion_step(
                index,
                "capture-originals",
                &format!("/options/conversions/{index}/recovery"),
                selection,
                previous,
                next,
                ctx,
            )?);
        }
    }
    for (index, selection) in selections.iter().enumerate() {
        steps.push(conversion_step(
            index,
            "convert-field",
            &format!("/options/conversions/{index}/recipe"),
            selection,
            previous,
            next,
            ctx,
        )?);
    }
    for (index, selection) in selections.iter().enumerate() {
        let path = effect_candidates
            .get(index)
            .and_then(|candidate| text(v(candidate, "path")))
            .unwrap_or_default();
        steps.push(conversion_step(
            index,
            "validate-conversion",
            &path,
            selection,
            previous,
            next,
            ctx,
        )?);
    }
    if steps.len() > 99_999 {
        return Err(fail("/steps", "G04 step identifiers exceed capacity"));
    }
    for (index, step) in steps.iter_mut().enumerate() {
        if let Value::Object(fields) = step {
            fields.push((Utf16::from("id"), s(&format!("step-{:05}", index + 1))));
        }
    }
    let step_ids = steps
        .iter()
        .map(|step| copy_value(v(step, "id"), ctx))
        .collect::<Result<Vec<_>, _>>()?;
    let phase = object(vec![
        ("id", s("phase-00001")),
        ("kind", s("field-conversion")),
        ("transaction", s("required")),
        ("steps", array(step_ids)),
    ]);
    let mut review = Vec::new();
    review
        .try_reserve(selections.len())
        .map_err(|_| error("LIMIT", "/review", "Allocation refused"))?;
    for (index, selection) in selections.iter().enumerate() {
        if text(v(v(selection, "recovery"), "mode")).as_deref() != Some("irreversible") {
            continue;
        }
        let source_path = effect_candidates
            .get(index)
            .and_then(|candidate| text(v(candidate, "path")))
            .unwrap_or_default();
        let before = type_candidates
            .get(index)
            .map(|candidate| {
                text(v(
                    v(v(v(candidate, "oldValue"), "meaning"), "logical"),
                    "scalarType",
                ))
                .unwrap_or_default()
            })
            .unwrap_or_default();
        let after = type_candidates
            .get(index)
            .map(|candidate| {
                text(v(
                    v(v(v(candidate, "newValue"), "meaning"), "logical"),
                    "scalarType",
                ))
                .unwrap_or_default()
            })
            .unwrap_or_default();
        review.push(object(vec![("code", s("IRREVERSIBLE_FIELD_CONVERSION")), ("path", s(&source_path)), ("message", s(&format!("Irreversible conversion from {before} to {after} loses original stored representation.")))]));
    }
    let originals = selections.iter().any(|selection| {
        text(v(v(selection, "recovery"), "mode")).as_deref() == Some("retained-originals")
    });
    let body = object(vec![
        ("version", s("umf.table-migration/0.7")),
        ("canonicalization", s("RFC8785")),
        ("id", id),
        ("predecessor", predecessor),
        ("previous", copy_value(previous, ctx)?),
        ("next", copy_value(next, ctx)?),
        ("options", copy_value(options, ctx)?),
        (
            "fromBundleDigest",
            copy_value(v(previous, "bundleDigest"), ctx)?,
        ),
        ("toBundleDigest", copy_value(v(next, "bundleDigest"), ctx)?),
        ("steps", array(steps)),
        ("seedExecution", s("none")),
        ("phases", array(vec![phase])),
        (
            "executionProfile",
            object(vec![
                ("version", s("umf.table-migration-execution/0.6")),
                ("progressRelation", s("umf_lifecycle_progress")),
                ("ownerOnly", Value::Bool(true)),
                ("ingressProfile", s("umf.table-generation-ingress/0.1")),
                ("conversionProfile", s("umf.checked-field-conversion/0.1")),
                (
                    "originalsProfile",
                    if originals {
                        s("umf.pg-row-originals/0.1")
                    } else {
                        Value::Null
                    },
                ),
            ]),
        ),
        (
            "approvalProfile",
            object(vec![
                ("version", s("umf.table-migration-approval/0.1")),
                ("relation", s("umf_lifecycle_approvals")),
                ("ownerOnly", Value::Bool(true)),
            ]),
        ),
        ("review", array(review)),
        ("requiresApproval", Value::Bool(true)),
        ("nativeQualified", Value::Bool(false)),
    ]);
    if crate::canonical::canonical_json_admitted(&body, ctx)?.len() > 24_000_000 {
        return Err(fail("", "G04 migration plan exceeds 24MB"));
    }
    let plan_digest = digest(&body, ctx)?;
    let Value::Object(mut fields) = body else {
        unreachable!()
    };
    fields.push((Utf16::from("digest"), plan_digest));
    Ok(object(vec![
        ("status", s("compiled")),
        ("plan", Value::Object(fields)),
        ("diagnostics", array(vec![])),
    ]))
}

fn conversion_step(
    index: usize,
    operation: &str,
    path: &str,
    selection: &Value,
    previous: &Value,
    next: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let target = target(selection, ctx)?;
    let intent = {
        let mut intent = copy_value(selection, ctx)?;
        if let Value::Object(fields) = &mut intent {
            if let Some((_, recovery)) = fields
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("recovery"))
            {
                if text(get(recovery, "mode").unwrap_or(&Value::Null)).as_deref()
                    == Some("irreversible")
                {
                    *recovery = object(vec![("mode", s("irreversible"))]);
                }
            }
        }
        intent
    };
    let intent_digest = digest(&intent, ctx)?;
    let before = conversion_meaning(previous, selection, ctx)?;
    let after = conversion_meaning(next, selection, ctx)?;
    let mut fields = vec![
        ("kind", s("conversion")),
        ("sourcePath", s(path)),
        ("transaction", s("required")),
        ("sql", s("")),
        (
            "preconditions",
            object(vec![
                ("phase", s("before-plan")),
                ("kind", s("installed-source-cohort")),
                (
                    "bundleDigest",
                    copy_value(v(previous, "bundleDigest"), ctx)?,
                ),
            ]),
        ),
        (
            "expectedOutcome",
            object(vec![
                ("phase", s("before-commit")),
                ("kind", s("complete-next-source-catalog")),
                ("bundleDigest", copy_value(v(next, "bundleDigest"), ctx)?),
            ]),
        ),
        (
            "verification",
            s("native-catalog-privileges-and-role-scope"),
        ),
        ("recovery", s("rollback-transaction")),
        ("operation", s(operation)),
        ("phaseOperation", s(operation)),
        ("phaseTarget", target),
        (
            "conversionBinding",
            object(vec![
                ("profile", s("umf.field-conversion-step/0.1")),
                ("selectionIndex", Value::Number(index as f64)),
                ("intentDigest", intent_digest),
                ("beforeDomainDigest", meaning_digest(&before, ctx)?),
                ("afterDomainDigest", meaning_digest(&after, ctx)?),
            ]),
        ),
    ];
    Ok(object(fields))
}
fn conversion_meaning(
    bundle: &Value,
    selection: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let table = v(selection, "table");
    let field = v(selection, "field");
    let column = items(get(v(bundle, "expectedCatalog"), "columns"))
        .iter()
        .find(|column| {
            get(column, "table") == Some(table) && ref_key(v(column, "field")) == ref_key(field)
        })
        .ok_or_else(|| {
            fail(
                "/options/conversions",
                "Conversion physical meaning is absent",
            )
        })?;
    let mapping = items(get(v(bundle, "expectedCatalog"), "tables"))
        .iter()
        .find(|candidate| get(candidate, "id") == Some(table))
        .and_then(|table| {
            items(get(table, "columns"))
                .iter()
                .find(|mapping| ref_key(v(mapping, "field")) == ref_key(field))
        })
        .ok_or_else(|| fail("/options/conversions", "Conversion mapping is absent"))?;
    let document = source_document(bundle, ctx)?;
    let module_name = text(v(field, "module")).unwrap_or_default();
    let module = items(get(&document, "modules"))
        .iter()
        .find(|module| text(v(module, "id")).as_deref() == Some(module_name.as_str()))
        .ok_or_else(|| fail("/options/conversions", "Conversion module is absent"))?;
    let logical = items(get(module, "elements"))
        .iter()
        .find(|element| {
            get(element, "id") == get(field, "element")
                && text(v(element, "kind")).as_deref() == Some("field")
        })
        .ok_or_else(|| fail("/options/conversions", "Conversion logical Field is absent"))?;
    Ok(object(vec![(
        "meaning",
        object(vec![
            ("physical", copy_value(column, ctx)?),
            ("logical", copy_value(logical, ctx)?),
            ("mapping", copy_value(mapping, ctx)?),
        ]),
    )]))
}

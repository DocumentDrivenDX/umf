// SPDX-License-Identifier: MIT OR Apache-2.0
//! Exact retained-source certificate for the currently callable mixed CREATE/G02 profile.
use super::*;
use sha2::{Digest, Sha256};

fn at_mut<'a>(value: &'a mut Value, key: &str) -> Option<&'a mut Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter_mut()
        .find(|(name, _)| name == &Utf16::from(key))
        .map(|(_, value)| value)
}
fn list_mut<'a>(value: &'a mut Value, key: &str) -> Option<&'a mut Vec<Value>> {
    match at_mut(value, key)? {
        Value::Array(items) => Some(items),
        _ => None,
    }
}
fn module<'a>(document: &'a Value, id: &str) -> Option<&'a Value> {
    array_items(get(document, "modules")?)
        .and_then(|modules| modules.iter().find(|item| eq_text(get(item, "id"), id)))
}
fn module_mut<'a>(document: &'a mut Value, id: &str) -> Option<&'a mut Value> {
    list_mut(document, "modules")?
        .iter_mut()
        .find(|item| eq_text(get(item, "id"), id))
}
fn payload<'a>(document: &'a Value, id: &str) -> Option<&'a Value> {
    get(get(module(document, id)?, "extensions")?, "umf.tables")
}
fn payload_mut<'a>(document: &'a mut Value, id: &str) -> Option<&'a mut Value> {
    at_mut(
        at_mut(module_mut(document, id)?, "extensions")?,
        "umf.tables",
    )
}
fn source(bundle: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let archive = val(bundle, "source", "/source")?;
    if !eq_text(get(archive, "format"), "json") {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/source/format",
            "G02 requires exact JSON source",
        ));
    }
    let text = string_member(archive, "utf8").ok_or_else(|| {
        err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/source/utf8",
            "G02 source text is missing",
        )
    })?;
    read_json_value(text.units(), Format::Json, ctx)
}
fn ref_key(value: &Value) -> Option<(String, String)> {
    Some((text(get(value, "module")?)?, text(get(value, "element")?)?))
}
fn ref_matches(value: &Value, target: &(String, String)) -> bool {
    ref_key(value).as_ref() == Some(target)
}
fn source_table<'a>(document: &'a Value, module_id: &str, id: &str) -> Option<&'a Value> {
    array_items(get(payload(document, module_id)?, "tables")?)
        .and_then(|items| items.iter().find(|item| eq_text(get(item, "id"), id)))
}
fn source_record<'a>(document: &'a Value, reference: &Value) -> Option<&'a Value> {
    let (module_id, element) = ref_key(reference)?;
    array_items(get(module(document, &module_id)?, "elements")?).and_then(|items| {
        items
            .iter()
            .find(|item| eq_text(get(item, "kind"), "record") && eq_text(get(item, "id"), &element))
    })
}
fn source_field<'a>(document: &'a Value, reference: &Value) -> Option<&'a Value> {
    let (module_id, element) = ref_key(reference)?;
    array_items(get(module(document, &module_id)?, "elements")?).and_then(|items| {
        items
            .iter()
            .find(|item| eq_text(get(item, "kind"), "field") && eq_text(get(item, "id"), &element))
    })
}
fn find_mapping<'a>(table: &'a Value, reference: &Value) -> Option<&'a Value> {
    let key = ref_key(reference)?;
    array_items(get(table, "columns")?).and_then(|items| {
        items
            .iter()
            .find(|item| get(item, "field").is_some_and(|field| ref_matches(field, &key)))
    })
}
fn created_command_only(
    command: &Value,
    document: &Value,
    module_id: &str,
    created: &BTreeSet<String>,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let Some(body) = get(command, "body") else {
        return Ok(false);
    };
    if get(command, "id")
        .and_then(text)
        .is_none_or(|id| id.is_empty())
        || (eq_text(get(command, "version"), "umf.table-operation/0.1")
            && eq_text(get(body, "kind"), "query"))
    {
        return Ok(false);
    }
    let Some(tables) = payload(document, module_id)
        .and_then(|value| get(value, "tables"))
        .and_then(array_items)
    else {
        return Ok(false);
    };
    let refs = match super::command_refs::command_references(command, path, tables, ctx) {
        Ok(refs) => refs,
        Err(error) if !error.is_control_failure() => return Ok(false),
        Err(error) => return Err(error),
    };
    if refs.tables.is_empty() || refs.tables.iter().any(|table| !created.contains(table)) {
        return Ok(false);
    }
    if eq_text(get(command, "version"), "umf.table-operation/0.1") {
        match command_parameter_domains(command, document, tables, path, ctx) {
            Ok(_) => {}
            Err(error) if !error.is_control_failure() => return Ok(false),
            Err(error) => return Err(error),
        }
    }
    for use_field in refs.fields {
        if !created.contains(&use_field.table) {
            return Ok(false);
        }
        let Some(table) = tables
            .iter()
            .find(|table| eq_text(get(table, "id"), &use_field.table))
        else {
            return Ok(false);
        };
        let Some(columns) = get(table, "columns").and_then(array_items) else {
            return Ok(false);
        };
        ctx.charge_work(columns.len(), Utf16::from(path))?;
        if !columns.iter().any(|column| {
            get(column, "field").is_some_and(|field| ref_equal(field, &use_field.field))
        }) {
            return Ok(false);
        }
    }
    for use_key in refs.keys {
        if !created.contains(&use_key.table) {
            return Ok(false);
        }
        let Some(table) = tables
            .iter()
            .find(|table| eq_text(get(table, "id"), &use_key.table))
        else {
            return Ok(false);
        };
        let Some(record) =
            get(table, "record").and_then(|reference| source_record(document, reference))
        else {
            return Ok(false);
        };
        if !get(record, "keys")
            .and_then(array_items)
            .is_some_and(|keys| keys.iter().any(|key| eq_text(get(key, "id"), &use_key.key)))
        {
            return Ok(false);
        }
    }
    Ok(true)
}
fn remove_exact<T>(items: &mut Vec<T>, position: usize) -> bool {
    if position >= items.len() {
        false
    } else {
        items.remove(position);
        true
    }
}

/// Reproduce the source-derived G02 plus independent CREATE closure. A caller
/// still must verify bundles, review markers, typed effects, and final graph.
pub(super) fn verify_mixed_create_source(
    previous: &Value,
    next: &Value,
    options: &Value,
    created: &[String],
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let fail = |path: &str| {
        err(
            "TABLE_INVENTORY_UNSUPPORTED",
            path,
            "G02 source change is not confined to the selected fill and CREATE closure",
        )
    };
    if created.is_empty()
        || created.len() > 256
        || !same(
            val(previous, "configuration", "/previous/configuration")?,
            val(next, "configuration", "/next/configuration")?,
            ctx,
        )?
    {
        return Err(fail("/next/configuration"));
    }
    let module_id = member_text(next, "module", "/next/module")?;
    if !eq_text(get(previous, "module"), &module_id) {
        return Err(fail("/next/module"));
    }
    let fills = items(
        val(options, "backfills", "/options/backfills")?,
        "/options/backfills",
    )?;
    if fills.len() != 1 {
        return Err(fail("/options/backfills"));
    }
    let fill = &fills[0];
    if !exact_fields(fill, &["table", "column", "operation", "scopedRows"])
        || get(fill, "scopedRows") != Some(&Value::Bool(true))
    {
        return Err(fail("/options/backfills/0"));
    }
    let table_id = member_text(fill, "table", "/options/backfills/0/table")?;
    let field_ref = val(fill, "column", "/options/backfills/0/column")?;
    if !exact_fields(field_ref, &["module", "element"]) {
        return Err(fail("/options/backfills/0/column"));
    }
    let field_key = ref_key(field_ref).ok_or_else(|| fail("/options/backfills/0/column"))?;
    let operation_id = member_text(fill, "operation", "/options/backfills/0/operation")?;
    let old_doc = source(previous, ctx)?;
    let mut new_doc = source(next, ctx)?;
    let old_table =
        source_table(&old_doc, &module_id, &table_id).ok_or_else(|| fail("/previous/source"))?;
    let new_table =
        source_table(&new_doc, &module_id, &table_id).ok_or_else(|| fail("/next/source"))?;
    if !same(
        val(old_table, "record", "/previous/source")?,
        val(new_table, "record", "/next/source")?,
        ctx,
    )? {
        return Err(fail("/next/source"));
    }
    let old_record = source_record(&old_doc, val(old_table, "record", "/previous/source")?)
        .ok_or_else(|| fail("/previous/source"))?;
    let new_record = source_record(&new_doc, val(new_table, "record", "/next/source")?)
        .ok_or_else(|| fail("/next/source"))?;
    let old_members = items(
        val(old_record, "members", "/previous/source")?,
        "/previous/source",
    )?;
    let new_members = items(val(new_record, "members", "/next/source")?, "/next/source")?;
    let old_columns = items(
        val(old_table, "columns", "/previous/source")?,
        "/previous/source",
    )?;
    let new_columns = items(val(new_table, "columns", "/next/source")?, "/next/source")?;
    // The first callable G02 slice is the appended-field branch. Existing-field
    // tightening remains a separate source-bound continuation.
    if source_field(&old_doc, field_ref).is_some()
        || find_mapping(old_table, field_ref).is_some()
        || old_members.iter().any(|item| ref_matches(item, &field_key))
    {
        return Err(fail("/previous/source"));
    }
    if source_field(&new_doc, field_ref).is_none() || find_mapping(new_table, field_ref).is_none() {
        return Err(fail("/next/source"));
    }
    let member_index = new_members
        .iter()
        .position(|item| ref_matches(item, &field_key))
        .ok_or_else(|| fail("/next/source"))?;
    let mapping_index = new_columns
        .iter()
        .position(|item| get(item, "field").is_some_and(|field| ref_matches(field, &field_key)))
        .ok_or_else(|| fail("/next/source"))?;
    let old_element_count = items(
        val(
            module(&old_doc, &field_key.0).ok_or_else(|| fail("/previous/source"))?,
            "elements",
            "/previous/source",
        )?,
        "/previous/source",
    )?
    .len();
    let new_field_index = items(
        val(
            module(&new_doc, &field_key.0).ok_or_else(|| fail("/next/source"))?,
            "elements",
            "/next/source",
        )?,
        "/next/source",
    )?
    .iter()
    .position(|item| eq_text(get(item, "kind"), "field") && eq_text(get(item, "id"), &field_key.1))
    .ok_or_else(|| fail("/next/source"))?;
    if member_index < old_members.len()
        || mapping_index + 1 != new_columns.len()
        || new_field_index < old_element_count
    {
        return Err(fail("/next/source"));
    }
    let old_payload = payload(&old_doc, &module_id).ok_or_else(|| fail("/previous/source"))?;
    let old_commands = items(
        val(old_payload, "commands", "/previous/source")?,
        "/previous/source",
    )?;
    let next_payload = payload(&new_doc, &module_id).ok_or_else(|| fail("/next/source"))?;
    let next_commands = items(
        val(next_payload, "commands", "/next/source")?,
        "/next/source",
    )?;
    if old_commands
        .iter()
        .any(|item| eq_text(get(item, "id"), &operation_id))
        || next_commands
            .iter()
            .filter(|item| eq_text(get(item, "id"), &operation_id))
            .count()
            != 1
    {
        return Err(fail("/next/source"));
    }
    let mut selected_created = BTreeSet::new();
    let original_next_doc = umf_core::copy_json(&new_doc, ctx)?;
    for table in created {
        if table == &table_id
            || !selected_created.insert(table.clone())
            || source_table(&old_doc, &module_id, table).is_some()
        {
            return Err(fail("/options/tableIntents"));
        }
        let declaration = umf_core::copy_json(
            source_table(&new_doc, &module_id, table).ok_or_else(|| fail("/next/source"))?,
            ctx,
        )?;
        let record_ref = umf_core::copy_json(val(&declaration, "record", "/next/source")?, ctx)?;
        let record_key = ref_key(&record_ref).ok_or_else(|| fail("/next/source"))?;
        if source_record(&old_doc, &record_ref).is_some() {
            return Err(fail("/next/source"));
        }
        let record = umf_core::copy_json(
            source_record(&new_doc, &record_ref).ok_or_else(|| fail("/next/source"))?,
            ctx,
        )?;
        let member_copy = umf_core::copy_json(val(&record, "members", "/next/source")?, ctx)?;
        let members = match member_copy {
            Value::Array(members) => members,
            _ => return Err(fail("/next/source")),
        };
        let columns = items(
            val(&declaration, "columns", "/next/source")?,
            "/next/source",
        )?;
        if members.iter().any(|member| {
            !columns.iter().any(|column| {
                get(column, "field").is_some_and(|reference| ref_equal(reference, member))
            })
        }) {
            return Err(fail("/next/source"));
        }
        let tables = list_mut(
            payload_mut(&mut new_doc, &module_id).ok_or_else(|| fail("/next/source"))?,
            "tables",
        )
        .ok_or_else(|| fail("/next/source"))?;
        let table_index = tables
            .iter()
            .position(|item| eq_text(get(item, "id"), table))
            .ok_or_else(|| fail("/next/source"))?;
        remove_exact(tables, table_index);
        let elements = list_mut(
            module_mut(&mut new_doc, &record_key.0).ok_or_else(|| fail("/next/source"))?,
            "elements",
        )
        .ok_or_else(|| fail("/next/source"))?;
        let record_index = elements
            .iter()
            .position(|item| {
                eq_text(get(item, "kind"), "record") && eq_text(get(item, "id"), &record_key.1)
            })
            .ok_or_else(|| fail("/next/source"))?;
        remove_exact(elements, record_index);
        for member in members {
            let key = ref_key(&member).ok_or_else(|| fail("/next/source"))?;
            if key == field_key {
                return Err(fail("/next/source"));
            }
            if source_field(&old_doc, &member).is_some() {
                continue;
            }
            if source_field(&new_doc, &member).is_none() {
                return Err(fail("/next/source"));
            }
            let elements = list_mut(
                module_mut(&mut new_doc, &key.0).ok_or_else(|| fail("/next/source"))?,
                "elements",
            )
            .ok_or_else(|| fail("/next/source"))?;
            let index = elements
                .iter()
                .position(|item| {
                    eq_text(get(item, "kind"), "field") && eq_text(get(item, "id"), &key.1)
                })
                .ok_or_else(|| fail("/next/source"))?;
            remove_exact(elements, index);
        }
    }
    // Source-authenticated new commands may be removed from the residual
    // comparison only when their finite references bind created carriers.
    let original_commands = items(
        val(
            payload(&original_next_doc, &module_id).ok_or_else(|| fail("/next/source"))?,
            "commands",
            "/next/source/commands",
        )?,
        "/next/source/commands",
    )?;
    let old_command_ids = old_commands
        .iter()
        .filter_map(|item| get(item, "id").and_then(text))
        .collect::<BTreeSet<_>>();
    let mut new_command_ids = BTreeSet::new();
    let mut created_command_ids = BTreeSet::new();
    for (index, command) in original_commands.iter().enumerate() {
        ctx.charge_work(1, Utf16::from("/next/source/commands"))?;
        let id = member_text(command, "id", "/next/source/commands/id")?;
        if id.is_empty() || !new_command_ids.insert(id.clone()) {
            return Err(fail("/next/source/commands"));
        }
        if id != operation_id && !old_command_ids.contains(&id) {
            let path = format!("/next/source/commands/{index}");
            if !created_command_only(
                command,
                &original_next_doc,
                &module_id,
                &selected_created,
                &path,
                ctx,
            )? {
                return Err(fail(&path));
            }
            created_command_ids.insert(id);
        }
    }
    let commands = list_mut(
        payload_mut(&mut new_doc, &module_id).ok_or_else(|| fail("/next/source"))?,
        "commands",
    )
    .ok_or_else(|| fail("/next/source/commands"))?;
    commands.retain(|item| {
        !get(item, "id")
            .and_then(text)
            .is_some_and(|id| created_command_ids.contains(&id))
    });
    // New seed definitions are part of the selected CREATE closure only when
    // every row is confined to those newly declared carriers. Keep the exact
    // original source and remove only those definitions from the comparison.
    let prior_seed_sets = items(
        val(old_payload, "seedSets", "/previous/source/seedSets")?,
        "/previous/source/seedSets",
    )?;
    let mut prior_seed_ids = BTreeSet::new();
    for seed in prior_seed_sets {
        ctx.charge_work(1, Utf16::from("/previous/source/seedSets"))?;
        if !prior_seed_ids.insert(member_text(seed, "id", "/previous/source/seedSets/id")?) {
            return Err(fail("/previous/source/seedSets"));
        }
    }
    let next_seed_sets = items(
        val(
            payload(&new_doc, &module_id).ok_or_else(|| fail("/next/source"))?,
            "seedSets",
            "/next/source/seedSets",
        )?,
        "/next/source/seedSets",
    )?;
    let mut next_seed_ids = BTreeSet::new();
    let mut created_seed_ids = BTreeSet::new();
    for seed in next_seed_sets {
        ctx.charge_work(1, Utf16::from("/next/source/seedSets"))?;
        let id = member_text(seed, "id", "/next/source/seedSets/id")?;
        if id.is_empty() || !next_seed_ids.insert(id.clone()) {
            return Err(fail("/next/source/seedSets"));
        }
        if !prior_seed_ids.contains(&id) {
            let rows = items(
                val(seed, "rows", "/next/source/seedSets/rows")?,
                "/next/source/seedSets/rows",
            )?;
            if rows.is_empty() {
                return Err(fail("/next/source/seedSets"));
            }
            for row in rows {
                ctx.charge_work(1, Utf16::from("/next/source/seedSets/rows"))?;
                let table = member_text(row, "table", "/next/source/seedSets/rows/table")?;
                if !selected_created.contains(&table) {
                    return Err(fail("/next/source/seedSets"));
                }
            }
            created_seed_ids.insert(id);
        }
    }
    let selected_seed_sets = items(
        val(options, "seedSets", "/options/seedSets")?,
        "/options/seedSets",
    )?;
    let mut selected_seed_ids = BTreeSet::new();
    for seed in selected_seed_sets {
        ctx.charge_work(1, Utf16::from("/options/seedSets"))?;
        let id = text(seed).ok_or_else(|| fail("/options/seedSets"))?;
        if !next_seed_ids.contains(&id) || !selected_seed_ids.insert(id) {
            return Err(fail("/options/seedSets"));
        }
    }
    let seed_sets = list_mut(
        payload_mut(&mut new_doc, &module_id).ok_or_else(|| fail("/next/source"))?,
        "seedSets",
    )
    .ok_or_else(|| fail("/next/source/seedSets"))?;
    seed_sets.retain(|seed| {
        !get(seed, "id")
            .and_then(text)
            .is_some_and(|id| created_seed_ids.contains(&id))
    });
    // The retained G02 source is independently recompiled for typed SQL.
    let g02_only_source = umf_core::copy_json(&new_doc, ctx)?;
    // Remove the one selected command. Any other newly authored command stays
    // in the comparison and therefore cannot silently acquire authority.
    let commands = list_mut(
        payload_mut(&mut new_doc, &module_id).ok_or_else(|| fail("/next/source"))?,
        "commands",
    )
    .ok_or_else(|| fail("/next/source"))?;
    commands.retain(|item| !eq_text(get(item, "id"), &operation_id));
    // Source positions were checked before removal; remove the selected append
    // last so its original position remains source-authenticated.
    let table = umf_core::copy_json(
        source_table(&new_doc, &module_id, &table_id).ok_or_else(|| fail("/next/source"))?,
        ctx,
    )?;
    let record_ref = umf_core::copy_json(val(&table, "record", "/next/source")?, ctx)?;
    let record_key = ref_key(&record_ref).ok_or_else(|| fail("/next/source"))?;
    let tables = list_mut(
        payload_mut(&mut new_doc, &module_id).ok_or_else(|| fail("/next/source"))?,
        "tables",
    )
    .ok_or_else(|| fail("/next/source"))?;
    let retained = tables
        .iter_mut()
        .find(|item| eq_text(get(item, "id"), &table_id))
        .ok_or_else(|| fail("/next/source"))?;
    let columns = list_mut(retained, "columns").ok_or_else(|| fail("/next/source"))?;
    let index = columns
        .iter()
        .position(|item| {
            get(item, "field").is_some_and(|reference| ref_matches(reference, &field_key))
        })
        .ok_or_else(|| fail("/next/source"))?;
    remove_exact(columns, index);
    let elements = list_mut(
        module_mut(&mut new_doc, &record_key.0).ok_or_else(|| fail("/next/source"))?,
        "elements",
    )
    .ok_or_else(|| fail("/next/source"))?;
    let record = elements
        .iter_mut()
        .find(|item| {
            eq_text(get(item, "kind"), "record") && eq_text(get(item, "id"), &record_key.1)
        })
        .ok_or_else(|| fail("/next/source"))?;
    let members = list_mut(record, "members").ok_or_else(|| fail("/next/source"))?;
    let index = members
        .iter()
        .position(|item| ref_matches(item, &field_key))
        .ok_or_else(|| fail("/next/source"))?;
    remove_exact(members, index);
    let elements = list_mut(
        module_mut(&mut new_doc, &field_key.0).ok_or_else(|| fail("/next/source"))?,
        "elements",
    )
    .ok_or_else(|| fail("/next/source"))?;
    let index = elements
        .iter()
        .position(|item| {
            eq_text(get(item, "kind"), "field") && eq_text(get(item, "id"), &field_key.1)
        })
        .ok_or_else(|| fail("/next/source"))?;
    remove_exact(elements, index);
    if !same(&old_doc, &new_doc, ctx)? {
        return Err(fail("/next/source"));
    }
    Ok(g02_only_source)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bundle(text: &str) -> Value {
        o(vec![
            ("module", s("demo")),
            ("configuration", o(vec![])),
            ("source", o(vec![("format", s("json")), ("utf8", s(text))])),
        ])
    }
    fn options() -> Value {
        o(vec![
            (
                "backfills",
                a(vec![o(vec![
                    ("table", s("notes")),
                    (
                        "column",
                        o(vec![("module", s("demo")), ("element", s("summary"))]),
                    ),
                    ("operation", s("fill_summary")),
                    ("scopedRows", Value::Bool(true)),
                ])]),
            ),
            ("seedSets", a(vec![])),
        ])
    }
    const PREVIOUS: &str = r#"{"modules":[{"id":"demo","elements":[{"id":"id","kind":"field"},{"id":"Note","kind":"record","members":[{"module":"demo","element":"id"}]}],"extensions":{"umf.tables":{"tables":[{"id":"notes","record":{"module":"demo","element":"Note"},"columns":[{"field":{"module":"demo","element":"id"}}]}],"commands":[],"seedSets":[]}}}]}"#;
    const NEXT: &str = r#"{"modules":[{"id":"demo","elements":[{"id":"id","kind":"field"},{"id":"Note","kind":"record","members":[{"module":"demo","element":"id"},{"module":"demo","element":"summary"}]},{"id":"summary","kind":"field"},{"id":"archive_id","kind":"field"},{"id":"Archive","kind":"record","members":[{"module":"demo","element":"archive_id"}]}],"extensions":{"umf.tables":{"tables":[{"id":"notes","record":{"module":"demo","element":"Note"},"columns":[{"field":{"module":"demo","element":"id"}},{"field":{"module":"demo","element":"summary"}}]},{"id":"archive","record":{"module":"demo","element":"Archive"},"columns":[{"field":{"module":"demo","element":"archive_id"}}]}],"commands":[{"id":"fill_summary"}],"seedSets":[]}}}]}"#;

    #[test]
    fn selected_appended_fill_and_independent_create_preserve_residual_source() {
        verify_mixed_create_source(
            &bundle(PREVIOUS),
            &bundle(NEXT),
            &options(),
            &["archive".to_owned()],
            &mut Context::ordinary(),
        )
        .unwrap();
    }
    #[test]
    fn unrelated_retained_source_change_is_refused() {
        let changed = NEXT.replace("\"id\":\"demo\"", "\"id\":\"demo\",\"unknown\":true");
        assert!(verify_mixed_create_source(
            &bundle(PREVIOUS),
            &bundle(&changed),
            &options(),
            &["archive".to_owned()],
            &mut Context::ordinary(),
        )
        .is_err());
    }
}

/// Recompile a source projection with only independently selected CREATE
/// declarations removed, then let the existing Rust G02 compiler own typed
/// row-expression admission and SQL. The returned steps are candidates for
/// the G10 prefix scheduler; they never replace the original next archive.
pub(super) fn lower_selected_fill(
    engine: &CodegenEngine<'_>,
    request: &Value,
    created: &[String],
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let previous = val(request, "previous", "/previous")?;
    let next = val(request, "next", "/next")?;
    let options = val(request, "options", "/options")?;
    let source = verify_mixed_create_source(previous, next, options, created, ctx)?;
    let source_text = umf_core::serialization::write_json_value(&source, Format::Json, ctx)?;
    let deployment_request = o(vec![
        ("text", Value::String(source_text)),
        (
            "configuration",
            umf_core::copy_json(val(next, "configuration", "/next/configuration")?, ctx)?,
        ),
    ]);
    let compiled = engine.compile_table_deployment(&deployment_request, ctx)?;
    if !eq_text(get(&compiled, "status"), "compiled") {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/next/source",
            "Selected retained G02 source cannot be independently compiled",
        ));
    }
    let normalized_bundle = val(&compiled, "bundle", "/next/source")?;
    let discovered = engine.discover_table_migration_changes(previous, normalized_bundle, ctx)?;
    let markers = items(&discovered, "/options/reviewedChanges")?
        .iter()
        .map(|candidate| {
            Ok(o(vec![
                (
                    "id",
                    clone_member(candidate, "id", "/options/reviewedChanges")?,
                ),
                (
                    "kind",
                    clone_member(candidate, "kind", "/options/reviewedChanges")?,
                ),
                (
                    "path",
                    clone_member(candidate, "path", "/options/reviewedChanges")?,
                ),
                (
                    "oldDigest",
                    clone_member(candidate, "oldDigest", "/options/reviewedChanges")?,
                ),
                (
                    "newDigest",
                    clone_member(candidate, "newDigest", "/options/reviewedChanges")?,
                ),
            ]))
        })
        .collect::<Result<Vec<_>, EngineError>>()?;
    let legacy_options = o(vec![
        ("version", s("umf.table-migration-options/0.4")),
        (
            "backfills",
            umf_core::copy_json(val(options, "backfills", "/options/backfills")?, ctx)?,
        ),
        ("concurrentIndexes", a(vec![])),
        ("reviewedChanges", a(markers)),
        ("validations", a(vec![])),
    ]);
    let migration_request = o(vec![
        ("id", s("g02-inventory-derived")),
        (
            "predecessor",
            umf_core::copy_json(val(request, "predecessor", "/predecessor")?, ctx)?,
        ),
        ("previous", umf_core::copy_json(previous, ctx)?),
        ("next", umf_core::copy_json(normalized_bundle, ctx)?),
        ("options", legacy_options),
    ]);
    let lowered = engine.compile_table_migration(&migration_request, ctx)?;
    if !eq_text(get(&lowered, "status"), "compiled") {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/options/backfills",
            "Selected G02 fill has no native typed lowering",
        ));
    }
    let plan = val(&lowered, "plan", "/plan")?;
    let steps = items(val(plan, "steps", "/plan/steps")?, "/plan/steps")?;
    let selected = steps
        .iter()
        .filter(|step| get(step, "phaseOperation").is_some())
        .map(|step| umf_core::copy_json(step, ctx))
        .collect::<Result<Vec<_>, _>>()?;
    let roles = selected
        .iter()
        .map(|step| text(get(step, "phaseOperation").unwrap_or(&Value::Null)))
        .collect::<Option<Vec<_>>>()
        .ok_or_else(|| {
            err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/options/backfills",
                "G02 compiler emitted an untyped phase operation",
            )
        })?;
    if roles.first().map(String::as_str) != Some("add-column")
        || roles.last().map(String::as_str) != Some("tighten-not-null")
        || roles
            .iter()
            .filter(|role| role.as_str() == "backfill")
            .count()
            != 1
    {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/options/backfills",
            "G02 compiler did not emit one complete field-effect group",
        ));
    }
    // The same source-bound migration also renders grant revokes/adds around
    // the field group. Keep those typed steps for the inventory scheduler.
    steps
        .iter()
        .map(|step| umf_core::copy_json(step, ctx))
        .collect()
}

/// Rebuild the review sequence from verified original sources. The retained
/// field/operation markers come from versioned native migration discovery;
/// the independently created table reviews use the original previous source
/// as their absent side, so a caller cannot substitute an initial marker.
pub(super) fn mixed_review_candidates(
    engine: &CodegenEngine<'_>,
    previous: &Value,
    next: &Value,
    options: &Value,
    projection: &Projection,
    created: &[String],
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let fills = items(
        val(options, "backfills", "/options/backfills")?,
        "/options/backfills",
    )?;
    if fills.len() != 1 {
        return Err(err(
            "TABLE_MIGRATION_REVIEW",
            "/options/backfills",
            "G02 requires one selected fill",
        ));
    }
    let fill = &fills[0];
    let table_id = member_text(fill, "table", "/options/backfills/0/table")?;
    let operation_id = member_text(fill, "operation", "/options/backfills/0/operation")?;
    let field = val(fill, "column", "/options/backfills/0/column")?;
    let columns = items(
        val(
            val(next, "expectedCatalog", "/next/expectedCatalog")?,
            "columns",
            "/next/expectedCatalog/columns",
        )?,
        "/next/expectedCatalog/columns",
    )?;
    let selected_column = columns
        .iter()
        .find(|column| {
            eq_text(get(column, "table"), &table_id)
                && get(column, "field").is_some_and(|item| ref_equal(item, field))
        })
        .ok_or_else(|| {
            err(
                "TABLE_MIGRATION_REVIEW",
                "/options/backfills/0/column",
                "Selected Field has no verified native mapping",
            )
        })?;
    let domain_path = format!(
        "{}/domain",
        member_text(
            selected_column,
            "sourcePath",
            "/next/expectedCatalog/columns/sourcePath"
        )?
    );
    let source_doc = source(next, ctx)?;
    let module_id = member_text(next, "module", "/next/module")?;
    let modules = items(
        val(&source_doc, "modules", "/next/source/modules")?,
        "/next/source/modules",
    )?;
    let module_index = modules
        .iter()
        .position(|item| eq_text(get(item, "id"), &module_id))
        .ok_or_else(|| {
            err(
                "TABLE_MIGRATION_REVIEW",
                "/next/source",
                "Selected module is missing",
            )
        })?;
    let commands = items(
        val(
            payload(&source_doc, &module_id).ok_or_else(|| {
                err(
                    "TABLE_MIGRATION_REVIEW",
                    "/next/source",
                    "Native payload is missing",
                )
            })?,
            "commands",
            "/next/source/commands",
        )?,
        "/next/source/commands",
    )?;
    let command_index = commands
        .iter()
        .position(|item| eq_text(get(item, "id"), &operation_id))
        .ok_or_else(|| {
            err(
                "TABLE_MIGRATION_REVIEW",
                "/next/source/commands",
                "Selected operation is missing",
            )
        })?;
    let command_path =
        format!("/modules/{module_index}/extensions/umf.tables/commands/{command_index}");
    let selector = o(vec![("version", s("umf.table-migration-discovery/0.3"))]);
    let discovered =
        engine.discover_table_migration_changes_selected(previous, next, Some(&selector), ctx)?;
    let native = items(&discovered, "/review")?;
    // Native discovery already orders the selected check and source commands
    // by their governed change sequence. Preserve that order in the exact
    // review certificate; forcing the G02 operation ahead of other new
    // commands changes an otherwise identical marker list.
    let previous_doc = source(previous, ctx)?;
    let previous_commands = items(
        val(
            payload(&previous_doc, &module_id).ok_or_else(|| {
                err(
                    "TABLE_MIGRATION_REVIEW",
                    "/previous/source",
                    "Previous native payload is missing",
                )
            })?,
            "commands",
            "/previous/source/commands",
        )?,
        "/previous/source/commands",
    )?;
    let old_ids = previous_commands
        .iter()
        .filter_map(|row| get(row, "id").and_then(text))
        .collect::<BTreeSet<_>>();
    let mut expected = BTreeSet::new();
    expected.insert(("replace-check".to_owned(), domain_path.clone()));
    for (index, command) in commands.iter().enumerate() {
        ctx.charge_work(1, Utf16::from("/next/source/commands"))?;
        let id = member_text(command, "id", "/next/source/commands/id")?;
        if old_ids.contains(&id) {
            if id == operation_id {
                return Err(err(
                    "TABLE_MIGRATION_REVIEW",
                    &command_path,
                    "Selected G02 operation is not newly source-bound",
                ));
            }
            continue;
        }
        expected.insert((
            "change-operation".to_owned(),
            format!("/modules/{module_index}/extensions/umf.tables/commands/{index}"),
        ));
    }
    if !expected.contains(&("change-operation".to_owned(), command_path.clone())) {
        return Err(err(
            "TABLE_MIGRATION_REVIEW",
            &command_path,
            "Selected G02 operation has no source command",
        ));
    }
    let mut seen = BTreeSet::new();
    let mut result = Vec::new();
    for candidate in native {
        ctx.charge_work(1, Utf16::from("/review"))?;
        let kind = member_text(candidate, "kind", "/review/kind")?;
        let path = member_text(candidate, "path", "/review/path")?;
        let key = (kind, path);
        if expected.contains(&key) {
            if !seen.insert(key) {
                return Err(err(
                    "TABLE_MIGRATION_REVIEW",
                    "/review",
                    "Selected source review is ambiguous",
                ));
            }
            result.push(umf_core::copy_json(candidate, ctx)?);
        }
    }
    if seen.len() != expected.len() {
        return Err(err(
            "TABLE_MIGRATION_REVIEW",
            "/review",
            "Selected source meaning has no independently discovered review",
        ));
    }
    let intents = items(
        val(options, "tableIntents", "/options/tableIntents")?,
        "/options/tableIntents",
    )?;
    let mut selected_projection = projection.clone();
    selected_projection.tables.clear();
    selected_projection.reviews.clear();
    selected_projection.inventory_tables.clear();
    for intent in intents {
        if !eq_text(get(intent, "kind"), "create") {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                "/options/tableIntents",
                "Mixed G02 compilation admits independent CREATE intents only",
            ));
        }
        let table = member_text(intent, "table", "/options/tableIntents/table")?;
        if !created.iter().any(|name| name == &table) {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                "/options/tableIntents",
                "CREATE intent is not independently source-derived",
            ));
        }
        let index = projection
            .tables
            .iter()
            .position(|declaration| eq_text(get(declaration, "id"), &table))
            .ok_or_else(|| {
                err(
                    "TABLE_MIGRATION_REVIEW",
                    "/next/source",
                    "CREATE table is missing",
                )
            })?;
        selected_projection
            .tables
            .push(projection.tables[index].clone());
        selected_projection
            .reviews
            .push(projection.reviews[index].clone());
        selected_projection
            .inventory_tables
            .push(projection.inventory_tables[index].clone());
    }
    let selected_options = o(vec![("tableIntents", a(intents.to_vec()))]);
    let create_candidates = initial_candidates(&selected_projection, next, &selected_options, ctx)?;
    let previous_digest = clone_member(previous, "sourceDigest", "/previous/sourceDigest")?;
    for candidate in create_candidates {
        let path = member_text(&candidate, "path", "/review/path")?;
        let mut absent = clone_member(&candidate, "newValue", "/review/newValue")?;
        replace(&mut absent, "side", s("previous"))?;
        replace(&mut absent, "meaning", Value::Null)?;
        let source = val(&absent, "source", "/review/oldValue/source")?.clone();
        let mut old_source = source;
        replace(&mut old_source, "sha256", previous_digest.clone())?;
        replace(&mut absent, "source", old_source)?;
        result.push(source_review_candidate(
            "create-table",
            &path,
            absent,
            clone_member(&candidate, "newValue", "/review/newValue")?,
            Value::Null,
            s(&path),
            ctx,
        )?);
    }
    Ok(result)
}

fn created_catalog(
    before: &Value,
    after: &Value,
    created: &BTreeSet<String>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut collections = Vec::new();
    for name in COLLECTIONS {
        let previous = catalog_rows(before, name)?;
        let next = catalog_rows(after, name)?;
        let mut rows = Vec::new();
        let mut carried = BTreeSet::new();
        for row in next {
            ctx.charge_work(1, Utf16::from(name))?;
            let row_identity = val(row, "identity", "/catalog/identity")?;
            let identity_hash = hash(row_identity, ctx)?;
            let owner = get(row_identity, "table").and_then(text);
            if let Some(original) = previous
                .iter()
                .find(|old| get(old, "identity") == Some(row_identity))
            {
                carried.insert(identity_hash);
                rows.push(umf_core::copy_json(original, ctx)?);
            } else if owner.as_ref().is_some_and(|table| created.contains(table)) {
                rows.push(umf_core::copy_json(row, ctx)?);
            }
        }
        for row in previous {
            ctx.charge_work(1, Utf16::from(name))?;
            let identity_hash = hash(val(row, "identity", "/catalog/identity")?, ctx)?;
            if !carried.contains(&identity_hash) {
                rows.push(umf_core::copy_json(row, ctx)?);
            }
        }
        collections.push((name, a(rows)));
    }
    Ok(o(collections))
}

fn present_states(
    catalog: &Value,
    tables: &[Value],
    created_steps: &BTreeMap<String, String>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut states = Vec::new();
    for row in tables {
        let table = member_text(row, "table", "/inventory/nextTables/table")?;
        let record = val(row, "record", "/inventory/nextTables/record")?;
        let step = created_steps.get(&table).map(String::as_str).unwrap_or("");
        let mut state = table_state(catalog, &table, record, step, ctx)?;
        if step.is_empty() {
            replace(&mut state, "creationStep", Value::Null)?;
        }
        states.push(state);
    }
    Ok(a(states))
}

fn sha256_text(value: Option<&Value>) -> Option<String> {
    let value = value.and_then(text)?;
    if value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        Some(value)
    } else {
        None
    }
}

fn historical_selected_ids(
    plan: &Value,
    ctx: &mut Context<'_>,
) -> Result<BTreeSet<String>, EngineError> {
    let execution = val(plan, "seedExecution", "/history/plans/0/seedExecution")?;
    if eq_text(Some(execution), "none") {
        return Ok(BTreeSet::new());
    }
    if !exact_fields(execution, &["version", "sets"])
        || !eq_text(get(execution, "version"), "umf.table-seed-execution/0.1")
    {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/history/plans/0/seedExecution",
            "Installed seed execution is malformed",
        ));
    }
    let sets = items(
        val(execution, "sets", "/history/plans/0/seedExecution/sets")?,
        "/history/plans/0/seedExecution/sets",
    )?;
    let mut selected = BTreeSet::new();
    for (index, set) in sets.iter().enumerate() {
        ctx.charge_work(1, Utf16::from("/history/plans/0/seedExecution/sets"))?;
        let id = text(set).ok_or_else(|| {
            err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &format!("/history/plans/0/seedExecution/sets/{index}"),
                "Installed seed identity is malformed",
            )
        })?;
        if id.is_empty() || !selected.insert(id) {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/history/plans/0/seedExecution/sets",
                "Installed seed identities are repeated",
            ));
        }
    }
    Ok(selected)
}

fn historical_seed_phase_digest(
    plan: &Value,
    seed_id: &str,
    ctx: &mut Context<'_>,
) -> Result<(String, String), EngineError> {
    let steps = items(
        val(plan, "steps", "/history/plans/0/steps")?,
        "/history/plans/0/steps",
    )?;
    let phases = items(
        val(plan, "phases", "/history/plans/0/phases")?,
        "/history/plans/0/phases",
    )?;
    let mut seed_step = None;
    for step in steps {
        ctx.charge_work(1, Utf16::from("/history/plans/0/steps"))?;
        if !eq_text(get(step, "operation"), "apply-seeds") {
            continue;
        }
        let sets = get(step, "seedSets").or_else(|| get(get(step, "inventorySubject")?, "sets"));
        let Some(sets) = sets.and_then(array_items) else {
            continue;
        };
        if sets.iter().any(|set| eq_text(Some(set), seed_id)) {
            if seed_step.replace(step).is_some() {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    "/history/plans/0/steps",
                    "Installed seed has multiple effect steps",
                ));
            }
        }
    }
    let seed_step = seed_step.ok_or_else(|| {
        err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/history/plans/0/steps",
            "Installed selected seed has no effect step",
        )
    })?;
    let step_sets = get(seed_step, "seedSets")
        .or_else(|| get(get(seed_step, "inventorySubject")?, "sets"))
        .ok_or_else(|| {
            err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/history/plans/0/steps",
                "Installed seed effect has no selected sets",
            )
        })?;
    let execution_sets = val(
        val(plan, "seedExecution", "/history/plans/0/seedExecution")?,
        "sets",
        "/history/plans/0/seedExecution/sets",
    )?;
    if step_sets != execution_sets {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/history/plans/0/steps",
            "Installed seed effect does not bind selected execution",
        ));
    }
    let step_id = member_text(seed_step, "id", "/history/plans/0/steps/id")?;
    let mut owner = None;
    for phase in phases {
        ctx.charge_work(1, Utf16::from("/history/plans/0/phases"))?;
        if get(phase, "steps")
            .and_then(array_items)
            .is_some_and(|ids| ids.iter().any(|id| eq_text(Some(id), &step_id)))
        {
            if owner.replace(phase).is_some() {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    "/history/plans/0/phases",
                    "Installed selected seed has multiple owning phases",
                ));
            }
        }
    }
    let phase = owner.ok_or_else(|| {
        err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/history/plans/0/phases",
            "Installed selected seed has no owning phase",
        )
    })?;
    let phase_id = member_text(phase, "id", "/history/plans/0/phases/id")?;
    let ids = items(
        val(phase, "steps", "/history/plans/0/phases/steps")?,
        "/history/plans/0/phases/steps",
    )?;
    let mut phase_steps = Vec::new();
    let mut seen = BTreeSet::new();
    for id in ids {
        ctx.charge_work(
            steps.len().saturating_add(1),
            Utf16::from("/history/plans/0/phases/steps"),
        )?;
        let id = text(id).ok_or_else(|| {
            err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/history/plans/0/phases/steps",
                "Phase step identity is malformed",
            )
        })?;
        if !seen.insert(id.clone()) {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/history/plans/0/phases/steps",
                "Phase step identity is repeated",
            ));
        }
        let step = steps
            .iter()
            .find(|step| eq_text(get(step, "id"), &id))
            .ok_or_else(|| {
                err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    "/history/plans/0/phases/steps",
                    "Phase references an absent effect step",
                )
            })?;
        phase_steps.push((*step).clone());
    }
    let preimage = o(vec![("phase", phase.clone()), ("steps", a(phase_steps))]);
    let legacy = [
        "umf.table-migration/0.1",
        "umf.table-migration/0.2",
        "umf.table-migration/0.3",
        "umf.table-migration/0.4",
        "umf.table-migration/0.5",
        "umf.table-migration/0.6",
    ]
    .iter()
    .any(|version| eq_text(get(plan, "version"), version));
    let digest = if legacy {
        legacy_phase_digest(&preimage, ctx)?
    } else {
        hash(&preimage, ctx)?
    };
    Ok((phase_id, digest))
}

/// The legacy TypeScript phase proof used code-point key ordering rather than
/// the G10 canonical JSON key order. Keep its source proof distinct.
fn legacy_phase_digest(value: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    fn emit(value: &Value, hash: &mut Sha256, ctx: &mut Context<'_>) -> Result<(), EngineError> {
        ctx.charge_work(1, Utf16::from("/history/phase"))?;
        match value {
            Value::Array(items) => {
                hash.update(b"[");
                for (index, item) in items.iter().enumerate() {
                    if index > 0 {
                        hash.update(b",");
                    }
                    emit(item, hash, ctx)?;
                }
                hash.update(b"]");
            }
            Value::Object(members) => {
                ctx.charge_work(
                    members.len().saturating_mul(2),
                    Utf16::from("/history/phase"),
                )?;
                let mut ordered = Vec::with_capacity(members.len());
                for (key, item) in members {
                    let scalar = key.to_utf8().map_err(|_| {
                        err(
                            "TABLE_INVENTORY_UNSUPPORTED",
                            "/history/phase",
                            "Legacy phase contains invalid UTF-16",
                        )
                    })?;
                    ordered.push((scalar, key, item));
                }
                ordered.sort_by(|a, b| a.0.chars().cmp(b.0.chars()));
                for pair in ordered.windows(2) {
                    if pair[0].0 == pair[1].0 {
                        return Err(err(
                            "TABLE_INVENTORY_UNSUPPORTED",
                            "/history/phase",
                            "Legacy phase repeats a member key",
                        ));
                    }
                }
                hash.update(b"{");
                for (index, (_, key, item)) in ordered.iter().enumerate() {
                    if index > 0 {
                        hash.update(b",");
                    }
                    hash.update(crate::canonical::canonical_json_admitted(
                        &Value::String((*key).clone()),
                        ctx,
                    )?);
                    hash.update(b":");
                    emit(item, hash, ctx)?;
                }
                hash.update(b"}");
            }
            Value::Number(number)
                if !number.is_finite()
                    || number.fract() != 0.0
                    || number.abs() > 9_007_199_254_740_991.0
                    || *number == 0.0 && number.is_sign_negative() =>
            {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    "/history/phase",
                    "Legacy phase contains a noncanonical number",
                ));
            }
            _ => hash.update(crate::canonical::canonical_json_admitted(value, ctx)?),
        }
        Ok(())
    }
    let mut hasher = Sha256::new();
    emit(value, &mut hasher, ctx)?;
    Ok(hex(&hasher.finalize()))
}

fn historical_seed_state(
    plan: &Value,
    receipt: &Value,
    prior: &BTreeMap<String, Value>,
    ctx: &mut Context<'_>,
) -> Result<BTreeMap<String, Value>, EngineError> {
    let legacy = [
        "umf.table-migration/0.1",
        "umf.table-migration/0.2",
        "umf.table-migration/0.3",
        "umf.table-migration/0.4",
        "umf.table-migration/0.5",
        "umf.table-migration/0.6",
    ]
    .iter()
    .any(|version| eq_text(get(plan, "version"), version));
    let selected = historical_selected_ids(plan, ctx)?;
    let lineage = if legacy {
        &[][..]
    } else {
        items(
            val(
                val(plan, "inventory", "/history/plans/0/inventory")?,
                "seedLineage",
                "/history/plans/0/inventory/seedLineage",
            )?,
            "/history/plans/0/inventory/seedLineage",
        )?
    };
    let outcomes = items(
        val(
            receipt,
            "seedOutcomes",
            "/history/executions/0/seedOutcomes",
        )?,
        "/history/executions/0/seedOutcomes",
    )?;
    if outcomes.len() != selected.len() {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/history/executions/0/seedOutcomes",
            "Installed seed outcomes do not bind selected seeds",
        ));
    }
    let entry_digest = sha256_text(get(receipt, "entryDigest")).ok_or_else(|| {
        err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/history/executions/0/entryDigest",
            "Installed entry digest is malformed",
        )
    })?;
    let next = val(plan, "next", "/history/plans/0/next")?;
    let next_digest = member_text(next, "sourceDigest", "/history/plans/0/next/sourceDigest")?;
    let definitions = items(
        val(next, "seedSets", "/history/plans/0/next/seedSets")?,
        "/history/plans/0/next/seedSets",
    )?;
    let mut expected = BTreeMap::new();
    for definition in definitions {
        ctx.charge_work(1, Utf16::from("/history/plans/0/next/seedSets"))?;
        let id = member_text(definition, "id", "/history/plans/0/next/seedSets/id")?;
        let definition_digest = hash(definition, ctx)?;
        let old = prior.get(&id);
        if old.is_some_and(|row| {
            eq_text(get(row, "disposition"), "retire-definition")
                || !eq_text(get(row, "definitionDigest"), &definition_digest)
        }) || selected.contains(&id)
            && old.is_some_and(|row| eq_text(get(row, "execution"), "confirmed"))
        {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/history/plans/0/next/seedSets",
                "Installed seed redefines, revives, or replays prior meaning",
            ));
        }
        let original_digest = old
            .and_then(|row| get(row, "originalSourceDigest"))
            .cloned()
            .unwrap_or_else(|| s(&next_digest));
        let execution = old
            .and_then(|row| get(row, "execution"))
            .cloned()
            .unwrap_or_else(|| s("not-run"));
        if expected
            .insert(
                id.clone(),
                o(vec![
                    ("id", s(&id)),
                    ("definitionDigest", s(&definition_digest)),
                    ("originalSourceDigest", original_digest),
                    (
                        "disposition",
                        s(if selected.contains(&id) {
                            "apply-once"
                        } else {
                            "retain-definition"
                        }),
                    ),
                    ("execution", execution),
                ]),
            )
            .is_some()
        {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/history/plans/0/next/seedSets",
                "Installed seed identity is repeated",
            ));
        }
    }
    if prior.keys().any(|id| !expected.contains_key(id)) {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/history/plans/0/next/seedSets",
            "Installed seed disappeared without explicit retirement",
        ));
    }
    let mut rows = BTreeMap::new();
    for row in lineage {
        ctx.charge_work(1, Utf16::from("/history/plans/0/inventory/seedLineage"))?;
        let id = member_text(row, "id", "/history/plans/0/inventory/seedLineage/id")?;
        let expected_row = expected.get(&id).ok_or_else(|| {
            err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/history/plans/0/inventory/seedLineage",
                "Installed seed has no source definition",
            )
        })?;
        if !same(expected_row, row, ctx)?
            || rows
                .insert(id.clone(), umf_core::copy_json(row, ctx)?)
                .is_some()
        {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/history/plans/0/inventory/seedLineage",
                "Installed seed lineage does not bind plan selection",
            ));
        }
    }
    if legacy {
        rows = copy_seed_state(&expected, ctx)?;
    } else if rows.len() != expected.len() {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/history/plans/0/inventory/seedLineage",
            "Installed seed lineage omits a definition",
        ));
    }
    let mut seen = BTreeSet::new();
    let mut receipts = BTreeMap::<String, (String, String)>::new();
    for outcome in outcomes {
        ctx.charge_work(1, Utf16::from("/history/executions/0/seedOutcomes"))?;
        let id = member_text(outcome, "id", "/history/executions/0/seedOutcomes/id")?;
        let row = rows.get_mut(&id).ok_or_else(|| {
            err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/history/executions/0/seedOutcomes",
                "Outcome has no installed seed lineage",
            )
        })?;
        if !exact_fields(
            outcome,
            &[
                "id",
                "definitionDigest",
                "originalSourceDigest",
                "execution",
                "proof",
            ],
        ) || !selected.contains(&id)
            || !seen.insert(id.clone())
            || !eq_text(get(outcome, "execution"), "confirmed")
            || get(outcome, "definitionDigest") != get(row, "definitionDigest")
            || get(outcome, "originalSourceDigest") != get(row, "originalSourceDigest")
        {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/history/executions/0/seedOutcomes",
                "Confirmed outcome does not bind installed seed",
            ));
        }
        let proof = val(outcome, "proof", "/history/executions/0/seedOutcomes/proof")?;
        let atomic = eq_text(get(plan, "version"), "umf.table-migration/0.1")
            && get(plan, "phases")
                .and_then(array_items)
                .is_none_or(|phases| phases.is_empty());
        if atomic {
            if !exact_fields(proof, &["kind", "entryDigest"])
                || !eq_text(get(proof, "kind"), "atomic-publication")
                || !eq_text(get(proof, "entryDigest"), &entry_digest)
            {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    "/history/executions/0/seedOutcomes/proof",
                    "Atomic selected seed proof does not bind execution",
                ));
            }
            replace(row, "execution", s("confirmed"))?;
            continue;
        }
        if !exact_fields(
            proof,
            &[
                "kind",
                "phaseId",
                "phaseDigest",
                "phaseReceiptDigest",
                "entryDigest",
            ],
        ) || !eq_text(get(proof, "kind"), "phase")
            || !eq_text(get(proof, "entryDigest"), &entry_digest)
            || sha256_text(get(proof, "phaseDigest")).is_none()
            || sha256_text(get(proof, "phaseReceiptDigest")).is_none()
        {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/history/executions/0/seedOutcomes/proof",
                "Selected seed proof is malformed",
            ));
        }
        let (phase_id, phase_digest) = historical_seed_phase_digest(plan, &id, ctx)?;
        if !eq_text(get(proof, "phaseId"), &phase_id)
            || !eq_text(get(proof, "phaseDigest"), &phase_digest)
        {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/history/executions/0/seedOutcomes/proof",
                "Selected seed proof does not bind owning phase",
            ));
        }
        let receipt_digest = sha256_text(get(proof, "phaseReceiptDigest")).unwrap();
        if let Some((old_phase, old_receipt)) = receipts.insert(
            phase_id.clone(),
            (phase_digest.clone(), receipt_digest.clone()),
        ) {
            if old_phase != phase_digest || old_receipt != receipt_digest {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    "/history/executions/0/seedOutcomes",
                    "Selected seeds have conflicting phase receipts",
                ));
            }
        }
        replace(row, "execution", s("confirmed"))?;
    }
    if seen != selected {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/history/executions/0/seedOutcomes",
            "Installed selected seed has no confirmed outcome",
        ));
    }
    Ok(rows)
}

fn copy_seed_state(
    state: &BTreeMap<String, Value>,
    ctx: &mut Context<'_>,
) -> Result<BTreeMap<String, Value>, EngineError> {
    let mut copied = BTreeMap::new();
    for (id, row) in state {
        ctx.charge_work(
            id.len().saturating_add(1),
            Utf16::from("/history/seedLineage"),
        )?;
        copied.insert(id.clone(), umf_core::copy_json(row, ctx)?);
    }
    Ok(copied)
}

fn selected_seed_lineage(
    request: &Value,
    before: &Projection,
    after: &Projection,
    next: &Value,
    options: &Value,
    prior: &BTreeMap<String, Value>,
    ctx: &mut Context<'_>,
) -> Result<(Value, Value, Option<Value>), EngineError> {
    // The installed history is recompiled at request admission. Only its
    // source-bound confirmed outcomes can authorize retaining a seed state.
    if prior
        .values()
        .filter(|row| !eq_text(get(row, "disposition"), "retire-definition"))
        .count()
        != before.seed_states.len()
    {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/history/plans/0/inventory/seedLineage",
            "Installed seed lineage does not cover previous definitions",
        ));
    }
    for seed in &before.seed_states {
        ctx.charge_work(1, Utf16::from("/previous/seedStates"))?;
        let id = member_text(seed, "id", "/previous/seedStates/id")?;
        let old = prior.get(&id).ok_or_else(|| {
            err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/history/plans/0/inventory/seedLineage",
                "Previous seed has no installed lineage",
            )
        })?;
        if get(old, "definitionDigest") != get(seed, "definitionDigest") {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/previous/seedStates",
                "Previous seed definition differs from installed lineage",
            ));
        }
    }
    let selected = items(
        val(options, "seedSets", "/options/seedSets")?,
        "/options/seedSets",
    )?;
    let mut selected_ids = BTreeSet::new();
    for (index, seed) in selected.iter().enumerate() {
        ctx.charge_work(1, Utf16::from("/options/seedSets"))?;
        let id = text(seed).ok_or_else(|| {
            err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &format!("/options/seedSets/{index}"),
                "Selected seed identity must be text",
            )
        })?;
        if !selected_ids.insert(id) {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/options/seedSets",
                "Selected seed identity is repeated",
            ));
        }
    }
    let next_source_digest = member_text(next, "sourceDigest", "/next/sourceDigest")?;
    let mut pending = Vec::new();
    let mut confirmed = Vec::new();
    let mut found = BTreeSet::new();
    for seed in &after.seed_states {
        ctx.charge_work(1, Utf16::from("/next/seedStates"))?;
        let id = member_text(seed, "id", "/next/seedStates/id")?;
        if !found.insert(id.clone()) {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/next/seedStates",
                "Verified seed identity is repeated",
            ));
        }
        let selected = selected_ids.contains(&id);
        let old = prior.get(&id);
        if selected && old.is_some_and(|row| eq_text(get(row, "execution"), "confirmed")) {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/options/seedSets",
                "A confirmed seed cannot be selected for execution again",
            ));
        }
        if old.is_some_and(|row| get(row, "definitionDigest") != get(seed, "definitionDigest")) {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/next/seedStates",
                "Retained seed definition changed without retirement",
            ));
        }
        let source_digest = old
            .and_then(|row| get(row, "originalSourceDigest"))
            .cloned()
            .unwrap_or_else(|| s(&next_source_digest));
        let entry = o(vec![
            ("id", s(&id)),
            (
                "definitionDigest",
                clone_member(
                    seed,
                    "definitionDigest",
                    "/next/seedStates/definitionDigest",
                )?,
            ),
            ("originalSourceDigest", source_digest),
            (
                "disposition",
                s(if selected {
                    "apply-once"
                } else {
                    "retain-definition"
                }),
            ),
            (
                "execution",
                old.and_then(|row| get(row, "execution"))
                    .cloned()
                    .unwrap_or_else(|| s("not-run")),
            ),
        ]);
        let mut completed = entry.clone();
        if selected {
            replace(&mut completed, "execution", s("confirmed"))?;
        }
        pending.push(entry);
        confirmed.push(completed);
    }
    if selected_ids.iter().any(|id| !found.contains(id)) {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/options/seedSets",
            "Selected seed has no verified next-source definition",
        ));
    }
    if prior.keys().any(|id| !found.contains(id)) {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/next/seedStates",
            "Retained seed disappeared without an explicit retirement",
        ));
    }
    let seed_execution = if selected_ids.is_empty() {
        None
    } else {
        Some(o(vec![
            ("version", s("umf.table-seed-execution/0.1")),
            ("sets", a(selected.to_vec())),
        ]))
    };
    Ok((a(pending), a(confirmed), seed_execution))
}

fn grant_subject(
    catalog: &Value,
    path: &str,
    table: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rows = catalog_rows(catalog, "grants")?
        .iter()
        .filter(|row| {
            get(row, "identity").and_then(|id| get(id, "table")) == Some(&s(table))
                && get(row, "meaning").and_then(|meaning| get(meaning, "sourcePath"))
                    == Some(&s(path))
        })
        .collect::<Vec<_>>();
    if rows.len() != 1 {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            path,
            "Source grant does not bind one catalog row",
        ));
    }
    let identity = val(rows[0], "identity", path)?;
    Ok(o(vec![
        ("kind", s("dependency")),
        ("table", s(table)),
        ("dependencyKind", s("grant")),
        (
            "id",
            s(&canonical_text(val(identity, "subject", path)?, ctx)?),
        ),
        ("sourcePath", s(path)),
        (
            "meaningDigest",
            s(&hash(val(rows[0], "meaning", path)?, ctx)?),
        ),
    ]))
}

fn field_subject(fill: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    Ok(o(vec![
        ("kind", s("field")),
        (
            "table",
            clone_member(fill, "table", "/options/backfills/0/table")?,
        ),
        (
            "field",
            umf_core::copy_json(val(fill, "column", "/options/backfills/0/column")?, ctx)?,
        ),
    ]))
}

/// Compose the one selected G02 field effect with independent CREATE effects.
/// Each catalog state is reconstructed from original verified source rows.
pub(super) fn schedule_mixed_create_fill(
    request: &Value,
    previous: &Value,
    next: &Value,
    before: &Projection,
    after: &Projection,
    review: &[Value],
    created: &[String],
    lowered: &[Value],
    prior_seed_state: &BTreeMap<String, Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let options = val(request, "options", "/options")?;
    let fills = items(
        val(options, "backfills", "/options/backfills")?,
        "/options/backfills",
    )?;
    let fill = fills.first().ok_or_else(|| {
        err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/options/backfills",
            "Selected G02 fill is missing",
        )
    })?;
    let target = member_text(fill, "table", "/options/backfills/0/table")?;
    if lowered.len() > 256 {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/options/backfills",
            "G02 effect group exceeds the supported bound",
        ));
    }
    ctx.charge_work(lowered.len(), Utf16::from("/options/backfills"))?;
    let mut ordered_lowered = Vec::new();
    for step in lowered {
        let kind = member_text(step, "kind", "/migration/steps/kind")?;
        let rank = if kind == "grant" {
            let sql = member_text(step, "sql", "/migration/steps/sql")?;
            if sql.starts_with("REVOKE ") {
                0
            } else if sql.starts_with("GRANT ") {
                6
            } else {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    "/migration/steps/sql",
                    "G02 grant effect is not an explicit revoke or grant",
                ));
            }
        } else {
            match get(step, "phaseOperation").and_then(text).as_deref() {
                Some("add-column") => 1,
                Some("target-check") => 2,
                Some("backfill") => 3,
                Some("install-default") => 4,
                Some("tighten-not-null") => 5,
                _ => {
                    return Err(err(
                        "TABLE_INVENTORY_UNSUPPORTED",
                        "/migration/steps",
                        "G02 effect is not part of the source-bound field group",
                    ))
                }
            }
        };
        ordered_lowered.push((rank, step));
    }
    ordered_lowered.sort_by_key(|(rank, _)| *rank);
    let ordered_lowered = ordered_lowered
        .into_iter()
        .map(|(_, step)| step)
        .collect::<Vec<_>>();
    let created_set = created.iter().cloned().collect::<BTreeSet<_>>();
    let create_operations = after
        .renderer_operations
        .iter()
        .filter(|operation| {
            get(operation, "subject")
                .and_then(|subject| get(subject, "table"))
                .and_then(text)
                .is_some_and(|table| created_set.contains(&table))
        })
        .collect::<Vec<_>>();
    if create_operations.is_empty()
        || create_operations
            .iter()
            .filter(|operation| eq_text(get(operation, "operation"), "create-table"))
            .count()
            != created.len()
    {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/next/steps",
            "Independent CREATE effects are incomplete",
        ));
    }
    let mut create_ids = BTreeMap::new();
    let mut business_ids = Vec::new();
    for (index, operation) in create_operations.iter().enumerate() {
        let id = step_number(index + 3);
        if eq_text(get(operation, "operation"), "create-table") {
            create_ids.insert(
                member_text(
                    val(operation, "subject", "/operations/subject")?,
                    "table",
                    "/operations/subject/table",
                )?,
                id.clone(),
            );
        }
        business_ids.push(id);
    }
    let create_catalog = created_catalog(&before.catalog, &after.catalog, &created_set, ctx)?;
    let before_states = present_states(
        &before.catalog,
        &before.inventory_tables,
        &BTreeMap::new(),
        ctx,
    )?;
    let create_states = present_states(&create_catalog, &after.inventory_tables, &create_ids, ctx)?;
    let final_states = present_states(&after.catalog, &after.inventory_tables, &create_ids, ctx)?;
    let (pending_seeds, confirmed_seeds, seed_execution) =
        selected_seed_lineage(request, before, after, next, options, prior_seed_state, ctx)?;
    let seed_count = usize::from(seed_execution.is_some());
    let mut completed = Vec::new();
    let mut prefixes = Vec::new();
    prefixes.push(prefix_frame(
        0,
        &completed,
        before.catalog.clone(),
        before_states.clone(),
        pending_seeds.clone(),
        "published",
        ctx,
    )?);
    completed.push(s(&step_number(1)));
    prefixes.push(prefix_frame(
        1,
        &completed,
        before.catalog.clone(),
        before_states.clone(),
        pending_seeds.clone(),
        "pending",
        ctx,
    )?);
    completed.push(s(&step_number(2)));
    prefixes.push(prefix_frame(
        2,
        &completed,
        before.catalog.clone(),
        before_states,
        pending_seeds.clone(),
        "pending",
        ctx,
    )?);
    completed.extend(business_ids.iter().map(|id| s(id)));
    prefixes.push(prefix_frame(
        3,
        &completed,
        create_catalog,
        create_states,
        pending_seeds.clone(),
        "pending",
        ctx,
    )?);
    let fill_ids = (0..lowered.len())
        .map(|index| step_number(index + business_ids.len() + 3))
        .collect::<Vec<_>>();
    completed.extend(fill_ids.iter().map(|id| s(id)));
    prefixes.push(prefix_frame(
        4,
        &completed,
        after.catalog.clone(),
        final_states.clone(),
        pending_seeds.clone(),
        "pending",
        ctx,
    )?);
    let seed_id = if seed_count == 1 {
        let id = step_number(business_ids.len() + lowered.len() + 3);
        completed.push(s(&id));
        prefixes.push(prefix_frame(
            5,
            &completed,
            after.catalog.clone(),
            final_states.clone(),
            confirmed_seeds.clone(),
            "pending",
            ctx,
        )?);
        Some(id)
    } else {
        None
    };
    let publication_id = step_number(business_ids.len() + lowered.len() + 3 + seed_count);
    completed.push(s(&publication_id));
    prefixes.push(prefix_frame(
        5 + seed_count,
        &completed,
        after.catalog.clone(),
        final_states,
        confirmed_seeds,
        "published",
        ctx,
    )?);
    let digest = |index: usize| member_text(&prefixes[index], "digest", "/prefixes/digest");
    let mut steps = vec![
        step_value(
            &step_number(1),
            "metadata",
            "/inventory/metadata/prepare",
            s(""),
            "prepare-inventory-metadata",
            metadata_subject(),
            &digest(0)?,
            &digest(1)?,
        ),
        step_value(
            &step_number(2),
            "metadata",
            "/inventory/metadata/approval",
            s(""),
            "record-inventory-approval",
            metadata_subject(),
            &digest(1)?,
            &digest(2)?,
        ),
    ];
    for (index, operation) in create_operations.iter().enumerate() {
        let op = member_text(operation, "operation", "/operations/operation")?;
        let path = member_text(operation, "sourcePath", "/operations/sourcePath")?;
        let step = val(operation, "step", "/operations/step")?;
        let kind = member_text(operation, "kind", "/operations/kind")?;
        let subject = renderer_subject(operation, after, ctx)?;
        steps.push(step_value(
            &business_ids[index],
            &kind,
            &path,
            clone_member(step, "sql", "/operations/step/sql")?,
            if matches!(
                op.as_str(),
                "create-policy" | "revoke-public" | "grant-table"
            ) {
                "dependency-add"
            } else {
                &op
            },
            subject,
            &digest(2)?,
            &digest(3)?,
        ));
    }
    let field_subject = field_subject(fill, ctx)?;
    let mut roles = Vec::new();
    for (index, step) in ordered_lowered.iter().enumerate() {
        let path = member_text(step, "sourcePath", "/migration/steps/sourcePath")?;
        let raw_kind = member_text(step, "kind", "/migration/steps/kind")?;
        let sql = clone_member(step, "sql", "/migration/steps/sql")?;
        let phase_role = get(step, "phaseOperation").and_then(text);
        let (operation, subject) = if let Some(role) = phase_role {
            roles.push(role.clone());
            (
                if role == "backfill" {
                    "apply-backfill".to_owned()
                } else {
                    role
                },
                field_subject.clone(),
            )
        } else if raw_kind == "grant" {
            let drop = text(&sql).is_some_and(|sql| sql.starts_with("REVOKE "));
            (
                if drop {
                    "dependency-drop"
                } else {
                    "dependency-add"
                }
                .to_owned(),
                grant_subject(
                    if drop {
                        &before.catalog
                    } else {
                        &after.catalog
                    },
                    &path,
                    &target,
                    ctx,
                )?,
            )
        } else {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &path,
                "G02 migration emitted an unowned effect",
            ));
        };
        let mut planned = step_value(
            &fill_ids[index],
            &raw_kind,
            &path,
            sql,
            &operation,
            subject,
            &digest(3)?,
            &digest(4)?,
        );
        if operation == "apply-backfill" {
            let previous_source = clone_member(previous, "sourceDigest", "/previous/sourceDigest")?;
            let next_source = clone_member(next, "sourceDigest", "/next/sourceDigest")?;
            let binding = o(vec![
                ("profile", s("umf.table-inventory-backfill/0.1")),
                ("selectionIndex", Value::Number(0.0)),
                (
                    "operationId",
                    clone_member(fill, "operation", "/options/backfills/0/operation")?,
                ),
                ("previousSourceDigest", previous_source),
                ("nextSourceDigest", next_source),
            ]);
            let Value::Object(members) = &mut planned else {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    "/steps",
                    "Backfill step is not an object",
                ));
            };
            if members
                .iter()
                .any(|(name, _)| name == &Utf16::from("dataBinding"))
            {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    "/steps/dataBinding",
                    "Backfill step already contains a binding",
                ));
            }
            ctx.charge_work(1, Utf16::from("/steps/dataBinding"))?;
            members.push((Utf16::from("dataBinding"), binding));
        }
        steps.push(planned);
    }
    if roles.first().map(String::as_str) != Some("add-column")
        || roles.last().map(String::as_str) != Some("tighten-not-null")
        || roles
            .iter()
            .filter(|role| role.as_str() == "backfill")
            .count()
            != 1
    {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/options/backfills",
            "Typed G02 effects are incomplete",
        ));
    }
    if let Some(id) = &seed_id {
        let mut seed_step = step_value(
            id,
            "seed",
            "/options/seedSets",
            s(""),
            "apply-seeds",
            o(vec![
                ("kind", s("seed")),
                (
                    "sets",
                    umf_core::copy_json(val(options, "seedSets", "/options/seedSets")?, ctx)?,
                ),
            ]),
            &digest(4)?,
            &digest(5)?,
        );
        let Value::Object(fields) = &mut seed_step else {
            unreachable!()
        };
        fields.push((
            Utf16::from("seedSets"),
            umf_core::copy_json(val(options, "seedSets", "/options/seedSets")?, ctx)?,
        ));
        steps.push(seed_step);
    }
    steps.push(step_value(
        &publication_id,
        "metadata",
        "/inventory/metadata/publication",
        s(""),
        "publish-inventory",
        metadata_subject(),
        &digest(4 + seed_count)?,
        &digest(5 + seed_count)?,
    ));
    let mut phases = vec![
        phase(1, "prepare", &[step_number(1)]),
        phase(2, "approval", &[step_number(2)]),
        phase(3, "transaction", &business_ids),
        phase(4, "backfill-add", &fill_ids),
    ];
    if let Some(id) = seed_id {
        phases.push(phase(5, "seed", &[id]));
    }
    phases.push(phase(5 + seed_count, "publication", &[publication_id]));
    let phases = a(phases);
    let mut changes = Vec::new();
    for table in created {
        let row = after
            .inventory_tables
            .iter()
            .find(|item| eq_text(get(item, "table"), table))
            .ok_or_else(|| {
                err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    "/next/tables",
                    "Created table has no source inventory",
                )
            })?;
        let candidate = review
            .iter()
            .find(|item| {
                eq_text(get(item, "kind"), "create-table")
                    && get(item, "newValue")
                        .is_some_and(|value| eq_text(get(value, "table"), table))
            })
            .ok_or_else(|| {
                err(
                    "TABLE_MIGRATION_REVIEW",
                    "/review",
                    "Created table has no exact source review",
                )
            })?;
        changes.push(o(vec![
            ("kind", s("create-table")),
            ("table", s(table)),
            (
                "record",
                clone_member(row, "record", "/inventory/nextTables/record")?,
            ),
            ("beforePath", Value::Null),
            (
                "afterPath",
                clone_member(candidate, "path", "/review/path")?,
            ),
            ("beforeMeaningDigest", s(ZERO_DIGEST)),
            (
                "afterMeaningDigest",
                clone_member(row, "meaningDigest", "/inventory/nextTables/meaningDigest")?,
            ),
        ]));
    }
    let history = val(request, "history", "/history")?;
    let history_count = items(val(history, "plans", "/history/plans")?, "/history/plans")?.len();
    let history_binding = o(vec![
        ("profile", s("umf.table-inventory-source-history/0.1")),
        ("count", Value::Number(history_count as f64)),
        ("digest", s(&hash(history, ctx)?)),
    ]);
    let execution = o(vec![
        ("version", s("umf.table-inventory-execution/0.1")),
        ("progressRelation", s("umf_lifecycle_inventory_progress")),
        ("ownerOnly", Value::Bool(true)),
        (
            "ingressProfile",
            s("umf.table-inventory-generation-ingress/0.1"),
        ),
        ("inventoryProfile", s("umf.table-inventory-prefix/0.1")),
        ("initial", Value::Bool(false)),
        ("conversionProfile", Value::Null),
        ("originalsProfile", Value::Null),
        ("retirementProfile", Value::Null),
        ("retiredStoreProfile", Value::Null),
    ]);
    let approval = o(vec![
        ("version", s("umf.table-migration-approval/0.1")),
        ("relation", s("umf_lifecycle_approvals")),
        ("ownerOnly", Value::Bool(true)),
    ]);
    let inventory = o(vec![
        ("profile", s("umf.table-inventory-delta/0.1")),
        ("previousTables", a(before.inventory_tables.clone())),
        ("nextTables", a(after.inventory_tables.clone())),
        ("changes", a(changes)),
        ("seedLineage", pending_seeds),
    ]);
    let mut plan = o(vec![
        ("version", s("umf.table-inventory-migration/0.1")),
        ("canonicalization", s("RFC8785")),
        ("id", clone_member(request, "id", "/id")?),
        (
            "predecessor",
            clone_member(request, "predecessor", "/predecessor")?,
        ),
        ("previous", previous.clone()),
        ("next", next.clone()),
        (
            "fromBundleDigest",
            clone_member(previous, "bundleDigest", "/previous/bundleDigest")?,
        ),
        (
            "toBundleDigest",
            clone_member(next, "bundleDigest", "/next/bundleDigest")?,
        ),
        ("steps", a(steps)),
        ("seedExecution", seed_execution.unwrap_or_else(|| s("none"))),
        ("phases", phases),
        ("executionProfile", execution),
        ("approvalProfile", approval),
        ("options", options.clone()),
        ("review", a(review.to_vec())),
        ("requiresApproval", Value::Bool(true)),
        ("nativeQualified", Value::Bool(false)),
        ("inventory", inventory),
        ("prefixes", a(prefixes)),
        ("historyBinding", history_binding),
    ]);
    let digest = hash(&plan, ctx)?;
    let Value::Object(fields) = &mut plan else {
        unreachable!()
    };
    fields.push((Utf16::from("digest"), s(&digest)));
    Ok(plan)
}

fn verify_retained_history_chain(
    engine: &CodegenEngine<'_>,
    history: &Value,
    ctx: &mut Context<'_>,
) -> Result<(Value, BTreeMap<String, Value>), EngineError> {
    let plans = items(val(history, "plans", "/history/plans")?, "/history/plans")?;
    let executions = items(
        val(history, "executions", "/history/executions")?,
        "/history/executions",
    )?;
    if plans.is_empty() || plans.len() > 128 || plans.len() != executions.len() {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/history",
            "Installed history has no bounded matching plan and execution sequence",
        ));
    }
    let mut installed: Option<Value> = None;
    let mut seed_state = BTreeMap::new();
    for index in 0..plans.len() {
        ctx.charge_work(1, Utf16::from("/history/plans"))?;
        let prefix_plans = plans[..index]
            .iter()
            .map(|value| umf_core::copy_json(value, ctx))
            .collect::<Result<Vec<_>, _>>()?;
        let prefix_executions = executions[..index]
            .iter()
            .map(|value| umf_core::copy_json(value, ctx))
            .collect::<Result<Vec<_>, _>>()?;
        let prefix = o(vec![
            ("profile", s("umf.table-inventory-source-history/0.1")),
            ("plans", a(prefix_plans)),
            ("executions", a(prefix_executions)),
        ]);
        let plan = &plans[index];
        let legacy = [
            "umf.table-migration/0.1",
            "umf.table-migration/0.2",
            "umf.table-migration/0.3",
            "umf.table-migration/0.4",
            "umf.table-migration/0.5",
            "umf.table-migration/0.6",
        ]
        .iter()
        .any(|version| eq_text(get(plan, "version"), version));
        let verified = if legacy {
            let verified = engine.verify_table_migration(plan, ctx)?;
            if index == 0 {
                if !matches!(get(&verified, "previous"), Some(Value::Null))
                    || !matches!(get(&verified, "predecessor"), Some(Value::Null))
                {
                    return Err(err(
                        "TABLE_INVENTORY_UNSUPPORTED",
                        "/history/plans/0",
                        "First legacy source plan is not initial",
                    ));
                }
            } else {
                let prior = installed.as_ref().expect("verified first source plan");
                if !same(
                    val(&verified, "previous", "/history/plans/previous")?,
                    val(prior, "next", "/history/plans/previous/next")?,
                    ctx,
                )? || get(&verified, "predecessor").and_then(|value| get(value, "id"))
                    != get(prior, "id")
                    || get(&verified, "predecessor").and_then(|value| get(value, "digest"))
                        != get(prior, "digest")
                {
                    return Err(err(
                        "TABLE_INVENTORY_UNSUPPORTED",
                        &format!("/history/plans/{index}"),
                        "Historical legacy plan does not bind prior source",
                    ));
                }
            }
            verified
        } else if index == 0 {
            engine.verify_table_inventory_initial(plan, &prefix, ctx)?
        } else {
            let prior = installed.as_ref().expect("verified first source plan");
            if !eq_text(get(plan, "version"), "umf.table-inventory-migration/0.1") {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    &format!("/history/plans/{index}/version"),
                    "Historical plan has no native inventory verifier",
                ));
            }
            let prior_next = val(prior, "next", "/history/plans/previous/next")?;
            if !same(
                val(plan, "previous", "/history/plans/previous")?,
                prior_next,
                ctx,
            )? || get(plan, "predecessor").and_then(|value| get(value, "id")) != get(prior, "id")
                || get(plan, "predecessor").and_then(|value| get(value, "digest"))
                    != get(prior, "digest")
            {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    &format!("/history/plans/{index}"),
                    "Historical plan does not bind its prior source",
                ));
            }
            let request = o(vec![
                ("id", clone_member(plan, "id", "/history/plans/id")?),
                (
                    "predecessor",
                    clone_member(plan, "predecessor", "/history/plans/predecessor")?,
                ),
                (
                    "previous",
                    clone_member(plan, "previous", "/history/plans/previous")?,
                ),
                ("next", clone_member(plan, "next", "/history/plans/next")?),
                (
                    "options",
                    clone_member(plan, "options", "/history/plans/options")?,
                ),
                ("history", prefix),
            ]);
            let rebuilt = compile_retained_g02_from_verified(
                engine,
                &request,
                Some((prior, &seed_state)),
                ctx,
            )?;
            if !same(&rebuilt, plan, ctx)? {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    &format!("/history/plans/{index}"),
                    "Historical inventory plan differs from native source recompilation",
                ));
            }
            rebuilt
        };
        let receipt = &executions[index];
        if !exact_fields(receipt, &["planDigest", "entryDigest", "seedOutcomes"])
            || get(receipt, "planDigest") != get(&verified, "digest")
            || sha256_text(get(receipt, "entryDigest")).is_none()
        {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &format!("/history/executions/{index}"),
                "Historical execution receipt does not bind its source plan",
            ));
        }
        seed_state = historical_seed_state(&verified, receipt, &seed_state, ctx)?;
        installed = Some(verified);
    }
    Ok((installed.expect("nonempty verified history"), seed_state))
}

/// The retained G02 branch is compiled only after the installed previous plan
/// and its explicit execution receipt are bound to the request. Unsupported
/// compositions are refused before any plan or partial prefix is returned.
pub(super) fn compile_retained_g02(
    engine: &CodegenEngine<'_>,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    compile_retained_g02_from_verified(engine, request, None, ctx)
}

fn compile_retained_g02_from_verified(
    engine: &CodegenEngine<'_>,
    request: &Value,
    verified_installed: Option<(&Value, &BTreeMap<String, Value>)>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if !exact_fields(
        request,
        &[
            "id",
            "predecessor",
            "previous",
            "next",
            "options",
            "history",
        ],
    ) {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/",
            "Inventory request envelope is not closed",
        ));
    }
    let id = member_text(request, "id", "/id")?;
    if id.is_empty() || id.as_bytes().len() > 128 || id.contains('\0') {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/id",
            "Inventory migration identity is invalid",
        ));
    }
    let previous = engine.verify_table_deployment(val(request, "previous", "/previous")?, ctx)?;
    let next = engine.verify_table_deployment(val(request, "next", "/next")?, ctx)?;
    let history = val(request, "history", "/history")?;
    if !exact_fields(history, &["profile", "plans", "executions"])
        || !eq_text(
            get(history, "profile"),
            "umf.table-inventory-source-history/0.1",
        )
    {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/history",
            "Original inventory history is not closed",
        ));
    }
    let plans = items(val(history, "plans", "/history/plans")?, "/history/plans")?;
    let executions = items(
        val(history, "executions", "/history/executions")?,
        "/history/executions",
    )?;
    if plans.is_empty() || plans.len() > 128 || plans.len() != executions.len() {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/history",
            "Retained source requires a bounded matching history",
        ));
    }
    let (installed, prior_seed_state) = match verified_installed {
        Some((value, state)) => (
            umf_core::copy_json(value, ctx)?,
            copy_seed_state(state, ctx)?,
        ),
        None => verify_retained_history_chain(engine, history, ctx)?,
    };
    if !same(
        val(&installed, "next", "/history/plans/0/next")?,
        &previous,
        ctx,
    )? {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/history/plans/0",
            "Installed source does not bind the previous bundle",
        ));
    }
    let predecessor = val(request, "predecessor", "/predecessor")?;
    if !exact_fields(predecessor, &["id", "digest"])
        || get(predecessor, "id") != get(&installed, "id")
        || get(predecessor, "digest") != get(&installed, "digest")
    {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/predecessor",
            "Predecessor does not bind the installed plan",
        ));
    }
    let receipt = executions.last().expect("nonempty verified history");
    let receipt_digest = member_text(receipt, "entryDigest", "/history/executions/entryDigest")?;
    if !exact_fields(receipt, &["planDigest", "entryDigest", "seedOutcomes"])
        || get(receipt, "planDigest") != get(&installed, "digest")
        || receipt_digest.len() != 64
        || !receipt_digest.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/history/executions",
            "Installed execution receipt is invalid",
        ));
    }
    let options = val(request, "options", "/options")?;
    if !exact_fields(
        options,
        &[
            "version",
            "tableIntents",
            "backfills",
            "defaultChanges",
            "conversions",
            "concurrentIndexes",
            "validations",
            "reviewedChanges",
            "seedSets",
            "retiredSeedSets",
            "retirements",
            "restorations",
            "archiveSources",
        ],
    ) || !eq_text(
        get(options, "version"),
        "umf.table-inventory-migration-options/0.1",
    ) {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/options",
            "Inventory options profile is not closed",
        ));
    }
    for key in [
        "defaultChanges",
        "conversions",
        "concurrentIndexes",
        "validations",
        "retiredSeedSets",
        "retirements",
        "restorations",
        "archiveSources",
    ] {
        let path = format!("/options/{key}");
        if !items(val(options, key, &path)?, &path)?.is_empty() {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &path,
                "Selected composition has no retained G02 lowering",
            ));
        }
    }
    let intents = items(
        val(options, "tableIntents", "/options/tableIntents")?,
        "/options/tableIntents",
    )?;
    if intents.is_empty() || intents.len() > 256 {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/options/tableIntents",
            "Retained G02 requires an independent CREATE intent",
        ));
    }
    let mut created = Vec::new();
    let mut unique = BTreeSet::new();
    for (index, intent) in intents.iter().enumerate() {
        let path = format!("/options/tableIntents/{index}");
        if !exact_fields(intent, &["kind", "table", "record"])
            || !eq_text(get(intent, "kind"), "create")
        {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                &path,
                "Only independent CREATE intents are admitted with retained G02",
            ));
        }
        let table = member_text(intent, "table", &path)?;
        if !unique.insert(table.clone()) {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                &path,
                "CREATE table is selected twice",
            ));
        }
        created.push(table);
    }
    let old_doc = source(&previous, ctx)?;
    let new_doc = source(&next, ctx)?;
    let before = project_initial(&old_doc, &previous, ctx)?;
    let after = project_initial(&new_doc, &next, ctx)?;
    let source_tables = after
        .inventory_tables
        .iter()
        .filter_map(|row| text(get(row, "table")?))
        .collect::<BTreeSet<_>>();
    let old_tables = before
        .inventory_tables
        .iter()
        .filter_map(|row| text(get(row, "table")?))
        .collect::<BTreeSet<_>>();
    if source_tables.len() != old_tables.len() + created.len()
        || !old_tables.iter().all(|table| source_tables.contains(table))
        || !created
            .iter()
            .all(|table| source_tables.contains(table) && !old_tables.contains(table))
    {
        return Err(err(
            "TABLE_MIGRATION_REVIEW",
            "/options/tableIntents",
            "CREATE intents do not exactly cover new source tables",
        ));
    }
    verify_mixed_create_source(&previous, &next, options, &created, ctx)?;
    let review = mixed_review_candidates(engine, &previous, &next, options, &after, &created, ctx)?;
    let markers = a(review
        .iter()
        .map(|candidate| {
            o(["id", "kind", "path", "oldDigest", "newDigest"]
                .into_iter()
                .map(|key| {
                    (
                        key,
                        get(candidate, key)
                            .expect("native source review marker")
                            .clone(),
                    )
                })
                .collect())
        })
        .collect());
    if !same(
        &markers,
        val(options, "reviewedChanges", "/options/reviewedChanges")?,
        ctx,
    )? {
        return Err(err(
            "TABLE_MIGRATION_REVIEW",
            "/options/reviewedChanges",
            "Reviewed markers differ from complete source-derived sequence",
        ));
    }
    let lowered = lower_selected_fill(engine, request, &created, ctx)?;
    schedule_mixed_create_fill(
        request,
        &previous,
        &next,
        &before,
        &after,
        &review,
        &created,
        &lowered,
        &prior_seed_state,
        ctx,
    )
}

/// Discover the mixed CREATE/G02 review from the retained sources without
/// accepting a caller-supplied backfill marker or operation identity.
pub(super) fn discover_mixed_create_fill(
    engine: &CodegenEngine<'_>,
    previous: &Value,
    next: &Value,
    selector: &Value,
    history: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let previous = engine.verify_table_deployment(&admit_json(previous, ctx)?, ctx)?;
    let next = engine.verify_table_deployment(&admit_json(next, ctx)?, ctx)?;
    let selector = admit_json(selector, ctx)?;
    let history = admit_json(history, ctx)?;
    if !exact_fields(
        &selector,
        &[
            "version",
            "tableIntents",
            "conversions",
            "retiredSeedSets",
            "retirements",
            "restorations",
            "archiveSources",
        ],
    ) || !eq_text(
        get(&selector, "version"),
        "umf.table-inventory-discovery/0.1",
    ) {
        return Err(err(
            "TABLE_MIGRATION_REVIEW",
            "/selector",
            "Inventory discovery selector is not closed",
        ));
    }
    for key in [
        "conversions",
        "retiredSeedSets",
        "retirements",
        "restorations",
        "archiveSources",
    ] {
        let path = format!("/selector/{key}");
        if !items(val(&selector, key, &path)?, &path)?.is_empty() {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                &path,
                "Selected source profile has no retained G02 lowering",
            ));
        }
    }
    if !exact_fields(&history, &["profile", "plans", "executions"])
        || !eq_text(
            get(&history, "profile"),
            "umf.table-inventory-source-history/0.1",
        )
    {
        return Err(err(
            "TABLE_MIGRATION_REVIEW",
            "/history",
            "Original inventory history is not closed",
        ));
    }
    let plans = items(val(&history, "plans", "/history/plans")?, "/history/plans")?;
    let executions = items(
        val(&history, "executions", "/history/executions")?,
        "/history/executions",
    )?;
    if plans.is_empty() || plans.len() > 128 || plans.len() != executions.len() {
        return Err(err(
            "TABLE_MIGRATION_REVIEW",
            "/history",
            "Retained discovery requires a bounded matching source history",
        ));
    }
    let (installed, _) = verify_retained_history_chain(engine, &history, ctx).map_err(|error| {
        if error.is_control_failure() {
            error
        } else {
            err(
                "TABLE_MIGRATION_REVIEW",
                "/history",
                "Installed source history is not bound",
            )
        }
    })?;
    let receipt = executions.last().expect("nonempty verified history");
    let receipt_digest = member_text(receipt, "entryDigest", "/history/executions/entryDigest")?;
    if !same(
        val(&installed, "next", "/history/plans/0/next")?,
        &previous,
        ctx,
    )? || !exact_fields(receipt, &["planDigest", "entryDigest", "seedOutcomes"])
        || get(receipt, "planDigest") != get(&installed, "digest")
        || receipt_digest.len() != 64
        || !receipt_digest.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(err(
            "TABLE_MIGRATION_REVIEW",
            "/history",
            "Installed inventory source is not bound",
        ));
    }
    let old_doc = source(&previous, ctx)?;
    let new_doc = source(&next, ctx)?;
    let before = project_initial(&old_doc, &previous, ctx)?;
    let after = project_initial(&new_doc, &next, ctx)?;
    let intents = items(
        val(&selector, "tableIntents", "/selector/tableIntents")?,
        "/selector/tableIntents",
    )?;
    let mut created = Vec::new();
    let old_tables = before
        .inventory_tables
        .iter()
        .filter_map(|row| get(row, "table").and_then(text))
        .collect::<BTreeSet<_>>();
    for (index, intent) in intents.iter().enumerate() {
        let path = format!("/selector/tableIntents/{index}");
        if !exact_fields(intent, &["kind", "table", "record"])
            || !eq_text(get(intent, "kind"), "create")
        {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                &path,
                "Mixed G02 discovery requires CREATE intents",
            ));
        }
        let table = member_text(intent, "table", &path)?;
        if old_tables.contains(&table) || created.iter().any(|name| name == &table) {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                &path,
                "CREATE intent does not bind one new table",
            ));
        }
        created.push(table);
    }
    if created.is_empty() {
        return Err(err(
            "TABLE_MIGRATION_REVIEW",
            "/selector/tableIntents",
            "A retained G02 source needs an independent CREATE intent",
        ));
    }
    let versioned = o(vec![("version", s("umf.table-migration-discovery/0.3"))]);
    let migration = engine.discover_table_migration_changes_selected(
        &previous,
        &next,
        Some(&versioned),
        ctx,
    )?;
    let candidates = items(&migration, "/review")?;
    let mut operations = candidates.iter().filter(|candidate| {
        if !eq_text(get(candidate, "kind"), "change-operation")
            || get(candidate, "oldValue") != Some(&Value::Null)
        {
            return false;
        }
        let Some(declaration) = get(candidate, "newValue") else {
            return false;
        };
        let Some(body) = get(declaration, "body") else {
            return false;
        };
        let Some(where_clause) = get(body, "where") else {
            return false;
        };
        let Some(field) = get(where_clause, "field") else {
            return false;
        };
        let Some(values) = get(body, "values").and_then(array_items) else {
            return false;
        };
        eq_text(get(declaration, "version"), "umf.table-operation/0.2")
            && eq_text(get(body, "kind"), "update")
            && eq_text(get(where_clause, "op"), "isNull")
            && values.len() == 1
            && get(&values[0], "field").is_some_and(|value| ref_equal(value, field))
    });
    let operation = operations.next().ok_or_else(|| {
        err(
            "TABLE_MIGRATION_REVIEW",
            "/next/source",
            "A source-bound G02 operation is missing",
        )
    })?;
    if operations.next().is_some() {
        return Err(err(
            "TABLE_MIGRATION_REVIEW",
            "/next/source",
            "G02 operation source is ambiguous",
        ));
    }
    let declaration = val(operation, "newValue", "/review/newValue")?;
    let body = val(declaration, "body", "/review/newValue/body")?;
    let field = val(
        val(body, "where", "/review/newValue/body/where")?,
        "field",
        "/review/newValue/body/where/field",
    )?;
    let values = items(
        val(body, "values", "/review/newValue/body/values")?,
        "/review/newValue/body/values",
    )?;
    if !eq_text(get(declaration, "version"), "umf.table-operation/0.2")
        || !eq_text(get(body, "kind"), "update")
        || !eq_text(
            get(val(body, "where", "/review/newValue/body/where")?, "op"),
            "isNull",
        )
        || values.len() != 1
        || !get(&values[0], "field").is_some_and(|value| ref_equal(value, field))
    {
        return Err(err(
            "TABLE_MIGRATION_REVIEW",
            "/next/source",
            "Selected operation is not one bounded G02 fill",
        ));
    }
    let backfill = o(vec![
        (
            "table",
            clone_member(body, "table", "/review/newValue/body/table")?,
        ),
        ("column", umf_core::copy_json(field, ctx)?),
        (
            "operation",
            clone_member(declaration, "id", "/review/newValue/id")?,
        ),
        ("scopedRows", Value::Bool(true)),
    ]);
    let options = o(vec![
        ("tableIntents", a(intents.to_vec())),
        ("backfills", a(vec![backfill])),
        // Discovery has no seed selection. The source-closure check still
        // needs the explicit empty selection rather than a missing member.
        ("seedSets", a(vec![])),
    ]);
    verify_mixed_create_source(&previous, &next, &options, &created, ctx)?;
    Ok(a(mixed_review_candidates(
        engine, &previous, &next, &options, &after, &created, ctx,
    )?))
}

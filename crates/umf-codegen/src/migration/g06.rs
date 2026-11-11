// SPDX-License-Identifier: MIT OR Apache-2.0
//! G11 source admission for selected Field replacement and its reviewed dependency graph.
use super::*;

fn copy(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    umf_core::copy_json(value, ctx)
}
fn v<'a>(value: &'a Value, key: &str) -> &'a Value {
    get(value, key).unwrap_or(&Value::Null)
}
fn txt(value: &Value, key: &str) -> String {
    text(v(value, key)).unwrap_or_default()
}
fn cp(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    copy(value, ctx)
}
fn omit(value: &Value, keys: &[&str], ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let mut result = copy(value, ctx)?;
    if let Value::Object(fields) = &mut result {
        fields.retain(|(key, _)| !keys.iter().any(|name| key == &Utf16::from(*name)));
    }
    Ok(result)
}
fn fields(value: &Value) -> &[Value] {
    match value {
        Value::Array(values) => values,
        _ => &[],
    }
}
fn fields_mut(value: &mut Value) -> Option<&mut Vec<Value>> {
    if let Value::Array(values) = value {
        Some(values)
    } else {
        None
    }
}
fn remove_field_refs(value: &mut Value, module: &str, removed: &[String], added: &[String]) {
    let Value::Array(values) = value else { return };
    values.retain(|reference| {
        let element = text(get(reference, "element").unwrap_or(&Value::Null));
        let owner = text(get(reference, "module").unwrap_or(&Value::Null));
        !(owner.as_deref() == Some(module)
            && element
                .as_ref()
                .is_some_and(|id| removed.contains(id) || added.contains(id)))
    });
}
fn source_mapping<'a>(
    document: &'a Value,
    module_id: &str,
    table_id: &str,
    field_id: &str,
) -> Option<&'a Value> {
    let module = fields(get(document, "modules").unwrap_or(&Value::Null))
        .iter()
        .find(|item| text(get(item, "id").unwrap_or(&Value::Null)).as_deref() == Some(module_id))?;
    let payload = get(get(module, "extensions")?, "umf.tables")?;
    let table = fields(get(payload, "tables").unwrap_or(&Value::Null))
        .iter()
        .find(|item| text(get(item, "id").unwrap_or(&Value::Null)).as_deref() == Some(table_id))?;
    fields(get(table, "columns").unwrap_or(&Value::Null))
        .iter()
        .find(|item| {
            let field = get(item, "field").unwrap_or(&Value::Null);
            text(get(field, "module").unwrap_or(&Value::Null)).as_deref() == Some(module_id)
                && text(get(field, "element").unwrap_or(&Value::Null)).as_deref() == Some(field_id)
        })
}
fn source_mapping_count(
    document: &Value,
    module_id: &str,
    field_id: &str,
    ctx: &mut Context<'_>,
) -> Result<usize, EngineError> {
    let module = fields(get(document, "modules").unwrap_or(&Value::Null))
        .iter()
        .find(|item| text(get(item, "id").unwrap_or(&Value::Null)).as_deref() == Some(module_id));
    let payload = module
        .and_then(|item| get(item, "extensions"))
        .and_then(|item| get(item, "umf.tables"));
    let mut count = 0usize;
    for table in fields(
        payload
            .and_then(|item| get(item, "tables"))
            .unwrap_or(&Value::Null),
    ) {
        for column in fields(get(table, "columns").unwrap_or(&Value::Null)) {
            charge(
                ctx,
                1,
                "/source/modules/extensions/umf.tables/tables/columns",
            )?;
            let field = get(column, "field").unwrap_or(&Value::Null);
            if text(get(field, "module").unwrap_or(&Value::Null)).as_deref() == Some(module_id)
                && text(get(field, "element").unwrap_or(&Value::Null)).as_deref() == Some(field_id)
            {
                count = count.saturating_add(1);
            }
        }
    }
    Ok(count)
}
fn strip_selected(
    document: &mut Value,
    module_id: &str,
    removed: &[String],
    added: &[String],
    removed_declarations: &[String],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Some(Value::Array(modules)) = member_mut(document, "modules") else {
        return Err(error(
            "TABLE_MIGRATION_OPTIONS",
            "/next/source/modules",
            "G11 source modules are unavailable",
        ));
    };
    let Some(module) = modules
        .iter_mut()
        .find(|item| text(get(item, "id").unwrap_or(&Value::Null)).as_deref() == Some(module_id))
    else {
        return Err(error(
            "TABLE_MIGRATION_OPTIONS",
            "/next/source/modules",
            "G11 selected module is unavailable",
        ));
    };
    if let Some(Value::Array(elements)) = member_mut(module, "elements") {
        elements.retain(|element| {
            let id = text(get(element, "id").unwrap_or(&Value::Null));
            let is_field =
                text(get(element, "kind").unwrap_or(&Value::Null)).as_deref() == Some("field");
            !(is_field
                && id
                    .as_ref()
                    .is_some_and(|id| removed_declarations.contains(id) || added.contains(id)))
        });
        for element in elements.iter_mut() {
            if text(get(element, "kind").unwrap_or(&Value::Null)).as_deref() == Some("record") {
                if let Some(members) = member_mut(element, "members") {
                    remove_field_refs(members, module_id, removed, added);
                }
            }
        }
    }
    let payload = member_mut(module, "extensions")
        .and_then(|extensions| member_mut(extensions, "umf.tables"));
    let Some(payload) = payload else {
        return Err(error(
            "TABLE_MIGRATION_OPTIONS",
            "/next/source/modules",
            "G11 table source is unavailable",
        ));
    };
    if let Some(Value::Array(tables)) = member_mut(payload, "tables") {
        for table in tables {
            if let Some(Value::Array(columns)) = member_mut(table, "columns") {
                columns.retain(|column| {
                    let field = get(column, "field").unwrap_or(&Value::Null);
                    let element = text(get(field, "element").unwrap_or(&Value::Null));
                    let owner = text(get(field, "module").unwrap_or(&Value::Null));
                    !(owner.as_deref() == Some(module_id)
                        && element
                            .as_ref()
                            .is_some_and(|id| removed.contains(id) || added.contains(id)))
                });
            }
        }
    }
    charge_tree(document, ctx)
}

fn object_mut<'a>(value: &'a mut Value, key: &str) -> Option<&'a mut Value> {
    member_mut(value, key)
}
fn mask_g11_effect_lists(document: &mut Value) {
    let Some(Value::Array(modules)) = member_mut(document, "modules") else {
        return;
    };
    for module in modules {
        let Some(payload) =
            member_mut(module, "extensions").and_then(|v| member_mut(v, "umf.tables"))
        else {
            continue;
        };
        if let Some(commands) = object_mut(payload, "commands") {
            *commands = Value::Array(vec![]);
        }
        if let Some(tables) = member_mut(payload, "tables") {
            if let Value::Array(tables) = tables {
                for table in tables {
                    for key in ["checks", "foreignKeys", "indexes"] {
                        if let Some(items) = member_mut(table, key) {
                            *items = Value::Array(vec![]);
                        }
                    }
                    if let Some(policy) = member_mut(table, "policy") {
                        for audience in ["person", "batch"] {
                            if let Some(commands) = member_mut(policy, audience) {
                                if let Value::Object(items) = commands {
                                    items.retain(|(key, _)| {
                                        !["select", "insert", "update", "delete"]
                                            .iter()
                                            .any(|name| key == &Utf16::from(*name))
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    if let Some(Value::Array(modules)) = member_mut(document, "modules") {
        for module in modules {
            if let Some(Value::Array(elements)) = member_mut(module, "elements") {
                for element in elements {
                    if text(get(element, "kind").unwrap_or(&Value::Null)).as_deref()
                        == Some("record")
                    {
                        if let Some(keys) = member_mut(element, "keys") {
                            *keys = Value::Array(vec![]);
                        }
                    }
                }
            }
        }
    }
}
fn contains_selected(
    value: &Value,
    module: &str,
    selected: &[String],
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    charge(ctx, 1, "/options/reviewedChanges")?;
    if let Some(id) = text(get(value, "element").unwrap_or(&Value::Null)) {
        if text(get(value, "module").unwrap_or(&Value::Null)).as_deref() == Some(module)
            && selected.contains(&id)
        {
            return Ok(true);
        }
    }
    match value {
        Value::Array(items) => {
            for item in items {
                if contains_selected(item, module, selected, ctx)? {
                    return Ok(true);
                }
            }
        }
        Value::Object(items) => {
            for (_, item) in items {
                if contains_selected(item, module, selected, ctx)? {
                    return Ok(true);
                }
            }
        }
        _ => {}
    }
    Ok(false)
}
fn dependency_candidate(kind: &str) -> bool {
    matches!(
        kind,
        "replace-check"
            | "replace-foreign-key"
            | "replace-index"
            | "replace-primary-key"
            | "change-policy"
            | "change-operation"
            | "drop-column"
    )
}
fn dependency_property(kind: &str) -> Option<&'static str> {
    match kind {
        "check" => Some("checks"),
        "foreignKey" => Some("foreignKeys"),
        "index" => Some("indexes"),
        "key" => Some("keys"),
        _ => None,
    }
}
fn module_and_payload<'a>(document: &'a Value, module_id: &str) -> Option<(&'a Value, &'a Value)> {
    let module = fields(get(document, "modules").unwrap_or(&Value::Null))
        .iter()
        .find(|item| text(get(item, "id").unwrap_or(&Value::Null)).as_deref() == Some(module_id))?;
    Some((module, get(get(module, "extensions")?, "umf.tables")?))
}
pub(super) fn source_path(
    bundle: &Value,
    table_id: &str,
    kind: &str,
    id: &str,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let document = source_document(bundle, ctx)?;
    let module_id = text(get(bundle, "module").unwrap_or(&Value::Null)).unwrap_or_default();
    let (module, payload) = module_and_payload(&document, &module_id).ok_or_else(|| {
        error(
            "TABLE_MIGRATION_UNSUPPORTED",
            "/next/source",
            "G11 dependency source is missing",
        )
    })?;
    let modules = fields(get(&document, "modules").unwrap_or(&Value::Null));
    let module_index = modules
        .iter()
        .position(|item| std::ptr::eq(item, module))
        .unwrap_or(0);
    let tables = fields(get(payload, "tables").unwrap_or(&Value::Null));
    let table_index = tables
        .iter()
        .position(|item| text(get(item, "id").unwrap_or(&Value::Null)).as_deref() == Some(table_id))
        .ok_or_else(|| {
            error(
                "TABLE_MIGRATION_UNSUPPORTED",
                "/next/source",
                "G11 dependency table source is missing",
            )
        })?;
    let table = &tables[table_index];
    let path = if kind == "key" {
        let record = get(table, "record").unwrap_or(&Value::Null);
        let owner = text(get(record, "module").unwrap_or(&Value::Null)).unwrap_or_default();
        let rid = get(record, "element").unwrap_or(&Value::Null);
        let rm = modules
            .iter()
            .find(|item| get(item, "id").and_then(text).as_deref() == Some(owner.as_str()))
            .unwrap_or(&Value::Null);
        let elements = fields(get(rm, "elements").unwrap_or(&Value::Null));
        let ei = elements
            .iter()
            .position(|item| get(item, "id") == Some(rid))
            .unwrap_or(usize::MAX);
        let rec = elements.get(ei).unwrap_or(&Value::Null);
        let ki = fields(get(rec, "keys").unwrap_or(&Value::Null))
            .iter()
            .position(|item| get(item, "id").and_then(text).as_deref() == Some(id))
            .unwrap_or(usize::MAX);
        format!("/modules/{module_index}/elements/{ei}/keys/{ki}")
    } else if kind == "check" && id.starts_with("domain:") {
        let ci = fields(get(table, "columns").unwrap_or(&Value::Null))
            .iter()
            .position(|item| {
                let field = get(item, "field").unwrap_or(&Value::Null);
                format!(
                    "domain:{}.{}",
                    text(get(field, "module").unwrap_or(&Value::Null)).unwrap_or_default(),
                    text(get(field, "element").unwrap_or(&Value::Null)).unwrap_or_default()
                ) == id
            })
            .unwrap_or(usize::MAX);
        format!("/modules/{module_index}/extensions/umf.tables/tables/{table_index}/columns/{ci}/domain")
    } else {
        let property = dependency_property(kind).ok_or_else(|| {
            error(
                "TABLE_MIGRATION_UNSUPPORTED",
                "/next/source",
                "Unsupported G11 dependency kind",
            )
        })?;
        let index = fields(get(table, property).unwrap_or(&Value::Null))
            .iter()
            .position(|item| get(item, "id").and_then(text).as_deref() == Some(id))
            .unwrap_or(usize::MAX);
        format!(
            "/modules/{module_index}/extensions/umf.tables/tables/{table_index}/{property}/{index}"
        )
    };
    Ok(path)
}
fn policy_dependency_subject(
    bundle: &Value,
    table_id: &str,
    kind: &str,
    source_path: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let parts = pointer_parts(source_path);
    if parts.len() != 9
        || parts[0] != "modules"
        || parts[2] != "extensions"
        || parts[3] != "umf.tables"
        || parts[4] != "tables"
        || parts[6] != "policy"
        || !["person", "batch"].contains(&parts[7].as_str())
        || !["select", "insert", "update", "delete"].contains(&parts[8].as_str())
    {
        return Err(error(
            "TABLE_MIGRATION_UNSUPPORTED",
            source_path,
            "G11 policy dependency path is invalid",
        ));
    }
    let document = source_document(bundle, ctx)?;
    let module_id = text(get(bundle, "module").unwrap_or(&Value::Null)).unwrap_or_default();
    let (_, payload) = module_and_payload(&document, &module_id).ok_or_else(|| {
        error(
            "TABLE_MIGRATION_UNSUPPORTED",
            source_path,
            "G11 policy source is absent",
        )
    })?;
    let ti = parts[5].parse::<usize>().unwrap_or(usize::MAX);
    let table = fields(get(payload, "tables").unwrap_or(&Value::Null))
        .get(ti)
        .ok_or_else(|| {
            error(
                "TABLE_MIGRATION_UNSUPPORTED",
                source_path,
                "G11 policy table is absent",
            )
        })?;
    if text(get(table, "id").unwrap_or(&Value::Null)).as_deref() != Some(table_id) {
        return Err(error(
            "TABLE_MIGRATION_UNSUPPORTED",
            source_path,
            "G11 policy path/table mismatch",
        ));
    }
    let audience = parts[7].as_str();
    let command = parts[8].as_str();
    let role_key = if audience == "person" {
        "personRole"
    } else {
        "batchRole"
    };
    let role = v(v(bundle, "configuration"), role_key);
    let rule = v(
        v(get(table, "policy").unwrap_or(&Value::Null), audience),
        command,
    );
    let meaning = if kind == "policy" {
        let step = fields(get(bundle, "steps").unwrap_or(&Value::Null))
            .iter()
            .find(|item| {
                get(item, "kind").and_then(text).as_deref() == Some("policy")
                    && get(item, "sourcePath").and_then(text).as_deref() == Some(source_path)
            })
            .ok_or_else(|| {
                error(
                    "TABLE_MIGRATION_UNSUPPORTED",
                    source_path,
                    "G11 policy has no compiled SQL source",
                )
            })?;
        let sql = text(get(step, "sql").unwrap_or(&Value::Null)).unwrap_or_default();
        let name = format!("umf_{audience}_{command}");
        let relation = format!(
            "{}.{}",
            quote_ident(&txt(v(bundle, "configuration"), "schema")),
            quote_ident(&txt(table, "name"))
        );
        let prefix = format!(
            "CREATE POLICY {} ON {relation} AS PERMISSIVE FOR {} TO {}",
            quote_ident(&name),
            command.to_ascii_uppercase(),
            quote_ident(&text(role).unwrap_or_default())
        );
        let clauses = sql.strip_prefix(&prefix).ok_or_else(|| {
            error(
                "TABLE_MIGRATION_UNSUPPORTED",
                source_path,
                "G11 policy SQL has an unexpected source shape",
            )
        })?;
        let using = clauses
            .find(" USING ")
            .map(|at| {
                let start = at + 7;
                let end = clauses[start..]
                    .find(" WITH CHECK ")
                    .map(|offset| start + offset)
                    .unwrap_or(clauses.len());
                s(&clauses[start..end])
            })
            .unwrap_or(Value::Null);
        let check = clauses
            .find(" WITH CHECK ")
            .map(|at| s(&clauses[at + 12..]))
            .unwrap_or(Value::Null);
        object(vec![
            ("audience", s(audience)),
            ("command", s(command)),
            ("name", s(&name)),
            ("role", cp(role, ctx)?),
            ("permissive", Value::Bool(true)),
            ("rule", cp(rule, ctx)?),
            ("usingSql", using),
            ("withCheckSql", check),
        ])
    } else {
        let record_ref = v(table, "record");
        let owner = text(get(record_ref, "module").unwrap_or(&Value::Null)).unwrap_or_default();
        let rid = get(record_ref, "element").unwrap_or(&Value::Null);
        let modules = fields(get(&document, "modules").unwrap_or(&Value::Null));
        let rm = modules
            .iter()
            .find(|item| get(item, "id").and_then(text).as_deref() == Some(owner.as_str()))
            .unwrap_or(&Value::Null);
        let record = fields(get(rm, "elements").unwrap_or(&Value::Null))
            .iter()
            .find(|item| get(item, "id") == Some(rid))
            .unwrap_or(&Value::Null);
        let keys = fields(get(record, "keys").unwrap_or(&Value::Null));
        let mut writable = Vec::new();
        for column in fields(get(table, "columns").unwrap_or(&Value::Null)) {
            let field = v(column, "field");
            let is_key = keys.iter().any(|key| {
                fields(get(key, "fields").unwrap_or(&Value::Null))
                    .iter()
                    .any(|r| {
                        get(r, "module") == get(field, "module")
                            && get(r, "element") == get(field, "element")
                    })
            });
            if get(column, "immutable") == Some(&Value::Bool(true))
                || get(column, "generated").is_some_and(|v| v != &Value::Bool(false))
                || is_key
            {
                continue;
            }
            writable.push(object(vec![
                ("field", cp(field, ctx)?),
                ("name", cp(v(column, "name"), ctx)?),
            ]));
        }
        if command == "update" && writable.is_empty() {
            return Err(error(
                "TABLE_MIGRATION_UNSUPPORTED",
                source_path,
                "G11 cannot bind an empty UPDATE grant",
            ));
        }
        object(vec![
            ("audience", s(audience)),
            ("command", s(command)),
            ("role", cp(role, ctx)?),
            (
                "columns",
                if command == "update" {
                    array(writable)
                } else {
                    Value::Null
                },
            ),
            ("grantOption", Value::Bool(false)),
        ])
    };
    let relation = object(vec![
        ("table", cp(v(table, "id"), ctx)?),
        ("record", cp(v(table, "record"), ctx)?),
        ("schema", cp(v(v(bundle, "configuration"), "schema"), ctx)?),
        ("name", cp(v(table, "name"), ctx)?),
    ]);
    let subject = object(vec![
        ("version", s("umf.table-native-subject/0.1")),
        ("kind", s(kind)),
        ("relation", relation),
        ("meaning", meaning),
    ]);
    let digest = hex(&crate::canonical::canonical_sha256_admitted(&subject, ctx)?);
    Ok(object(vec![
        ("table", s(table_id)),
        ("kind", s(kind)),
        ("id", s(&format!("dependency-{digest}"))),
        ("sourcePath", s(source_path)),
        ("meaningDigest", s(&digest)),
    ]))
}
pub(super) fn dependency_subject(
    bundle: &Value,
    table_id: &str,
    kind: &str,
    id: &str,
    source_path: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if kind == "policy" || kind == "grant" {
        return policy_dependency_subject(bundle, table_id, kind, source_path, ctx);
    }
    let document = source_document(bundle, ctx)?;
    let module_id = text(get(bundle, "module").unwrap_or(&Value::Null)).unwrap_or_default();
    let (module, payload) = module_and_payload(&document, &module_id).ok_or_else(|| {
        error(
            "TABLE_MIGRATION_UNSUPPORTED",
            source_path,
            "G11 dependency source is missing",
        )
    })?;
    let modules = fields(get(&document, "modules").unwrap_or(&Value::Null));
    let module_index = modules
        .iter()
        .position(|item| std::ptr::eq(item, module))
        .unwrap_or(0);
    let tables = fields(get(payload, "tables").unwrap_or(&Value::Null));
    let table_index = tables
        .iter()
        .position(|item| text(get(item, "id").unwrap_or(&Value::Null)).as_deref() == Some(table_id))
        .ok_or_else(|| {
            error(
                "TABLE_MIGRATION_UNSUPPORTED",
                source_path,
                "G11 dependency table source is missing",
            )
        })?;
    let table = &tables[table_index];
    let property = dependency_property(kind).ok_or_else(|| {
        error(
            "TABLE_MIGRATION_UNSUPPORTED",
            source_path,
            "Unsupported G11 dependency kind",
        )
    })?;
    let catalog = get(bundle, "expectedCatalog").unwrap_or(&Value::Null);
    let catalog_property = match kind {
        "check" => "checks",
        "foreignKey" => "foreignKeys",
        "index" => "indexes",
        "key" => "keys",
        _ => unreachable!(),
    };
    let physical = fields(get(catalog, catalog_property).unwrap_or(&Value::Null))
        .iter()
        .find(|item| {
            get(item, "table").and_then(text).as_deref() == Some(table_id)
                && get(item, "id").and_then(text).as_deref() == Some(id)
        })
        .ok_or_else(|| {
            error(
                "TABLE_MIGRATION_UNSUPPORTED",
                source_path,
                "G11 native dependency expectation is missing",
            )
        })?;
    let logical = if kind == "key" {
        let record = get(table, "record").unwrap_or(&Value::Null);
        let owner = text(get(record, "module").unwrap_or(&Value::Null)).unwrap_or_default();
        let rid = get(record, "element").unwrap_or(&Value::Null);
        let rm = modules
            .iter()
            .find(|item| get(item, "id").and_then(text).as_deref() == Some(owner.as_str()))
            .unwrap_or(&Value::Null);
        let rec = fields(get(rm, "elements").unwrap_or(&Value::Null))
            .iter()
            .find(|item| get(item, "id") == Some(rid))
            .unwrap_or(&Value::Null);
        fields(get(rec, "keys").unwrap_or(&Value::Null))
            .iter()
            .find(|item| get(item, "id").and_then(text).as_deref() == Some(id))
            .cloned()
            .unwrap_or(Value::Null)
    } else if kind == "check" && id.starts_with("domain:") {
        let columns = fields(get(table, "columns").unwrap_or(&Value::Null));
        let column = columns
            .iter()
            .find(|item| {
                let field = get(item, "field").unwrap_or(&Value::Null);
                format!(
                    "domain:{}.{}",
                    text(get(field, "module").unwrap_or(&Value::Null)).unwrap_or_default(),
                    text(get(field, "element").unwrap_or(&Value::Null)).unwrap_or_default()
                ) == id
            })
            .cloned()
            .unwrap_or(Value::Null);
        let r = get(&column, "field").unwrap_or(&Value::Null);
        let owner = text(get(r, "module").unwrap_or(&Value::Null)).unwrap_or_default();
        let element = get(r, "element").unwrap_or(&Value::Null);
        let fm = modules
            .iter()
            .find(|item| get(item, "id").and_then(text).as_deref() == Some(owner.as_str()))
            .unwrap_or(&Value::Null);
        let field = fields(get(fm, "elements").unwrap_or(&Value::Null))
            .iter()
            .find(|item| get(item, "id") == Some(element))
            .cloned()
            .unwrap_or(Value::Null);
        object(vec![("column", column), ("field", field)])
    } else {
        fields(get(table, property).unwrap_or(&Value::Null))
            .iter()
            .find(|item| get(item, "id").and_then(text).as_deref() == Some(id))
            .cloned()
            .unwrap_or(Value::Null)
    };
    let expected_path = if kind == "key" {
        let record = get(table, "record").unwrap_or(&Value::Null);
        let owner = text(get(record, "module").unwrap_or(&Value::Null)).unwrap_or_default();
        let rid = get(record, "element").unwrap_or(&Value::Null);
        let rm = modules
            .iter()
            .find(|item| get(item, "id").and_then(text).as_deref() == Some(owner.as_str()))
            .unwrap_or(&Value::Null);
        let elems = fields(get(rm, "elements").unwrap_or(&Value::Null));
        let ei = elems
            .iter()
            .position(|item| get(item, "id") == Some(rid))
            .unwrap_or(usize::MAX);
        let rec = elems.get(ei).unwrap_or(&Value::Null);
        let ki = fields(get(rec, "keys").unwrap_or(&Value::Null))
            .iter()
            .position(|item| get(item, "id").and_then(text).as_deref() == Some(id))
            .unwrap_or(usize::MAX);
        format!("/modules/{module_index}/elements/{ei}/keys/{ki}")
    } else if kind == "check" && id.starts_with("domain:") {
        let ci = fields(get(table, "columns").unwrap_or(&Value::Null))
            .iter()
            .position(|item| {
                let field = get(item, "field").unwrap_or(&Value::Null);
                format!(
                    "domain:{}.{}",
                    text(get(field, "module").unwrap_or(&Value::Null)).unwrap_or_default(),
                    text(get(field, "element").unwrap_or(&Value::Null)).unwrap_or_default()
                ) == id
            })
            .unwrap_or(usize::MAX);
        format!("/modules/{module_index}/extensions/umf.tables/tables/{table_index}/columns/{ci}/domain")
    } else {
        let index = fields(get(table, property).unwrap_or(&Value::Null))
            .iter()
            .position(|item| get(item, "id").and_then(text).as_deref() == Some(id))
            .unwrap_or(usize::MAX);
        format!(
            "/modules/{module_index}/extensions/umf.tables/tables/{table_index}/{property}/{index}"
        )
    };
    if expected_path != source_path {
        return Err(error(
            "TABLE_MIGRATION_UNSUPPORTED",
            source_path,
            "G11 dependency path does not bind the exact source declaration",
        ));
    }
    let relation = object(vec![
        ("table", cp(v(table, "id"), ctx)?),
        ("record", cp(v(table, "record"), ctx)?),
        ("schema", cp(v(v(bundle, "configuration"), "schema"), ctx)?),
        ("name", cp(v(table, "name"), ctx)?),
    ]);
    let kind_value = s(kind);
    let meaning = object(vec![("physical", cp(physical, ctx)?), ("logical", logical)]);
    let subject = object(vec![
        ("version", s("umf.table-native-subject/0.1")),
        ("kind", kind_value.clone()),
        ("relation", relation),
        ("meaning", meaning),
    ]);
    let digest = s(&hex(&crate::canonical::canonical_sha256_admitted(
        &subject, ctx,
    )?));
    Ok(object(vec![
        ("table", s(table_id)),
        ("kind", kind_value),
        ("id", s(id)),
        ("sourcePath", s(source_path)),
        ("meaningDigest", digest),
    ]))
}
type FieldCoordinate = (String, Value);
fn add_dependency_field(
    bundle: &Value,
    table: &str,
    field: &Value,
    out: &mut Vec<FieldCoordinate>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let (Some(module), Some(element)) = (
        text(get(field, "module").unwrap_or(&Value::Null)),
        text(get(field, "element").unwrap_or(&Value::Null)),
    ) else {
        return Ok(());
    };
    let field = object(vec![("module", s(&module)), ("element", s(&element))]);
    let exists = fields(
        get(
            get(bundle, "expectedCatalog").unwrap_or(&Value::Null),
            "columns",
        )
        .unwrap_or(&Value::Null),
    )
    .iter()
    .any(|column| {
        get(column, "table").and_then(text).as_deref() == Some(table)
            && get(column, "field") == Some(&field)
    });
    if exists
        && !out
            .iter()
            .any(|(known_table, known)| known_table == table && known == &field)
    {
        out.push((table.to_owned(), cp(&field, ctx)?));
    }
    Ok(())
}
fn table_for_record(_document: &Value, payload: &Value, record: &Value) -> Option<(String, Value)> {
    fields(get(payload, "tables").unwrap_or(&Value::Null))
        .iter()
        .find(|table| get(table, "record") == Some(record))
        .and_then(|table| {
            text(get(table, "id").unwrap_or(&Value::Null))
                .map(|id| (id, get(table, "record").cloned().unwrap_or(Value::Null)))
        })
}
fn target_key_fields(
    document: &Value,
    payload: &Value,
    record: &Value,
    key_id: &str,
) -> Option<(String, Vec<Value>)> {
    let (table, _) = table_for_record(document, payload, record)?;
    let owner = text(get(record, "module")?)?;
    let element = get(record, "element")?;
    let module = fields(get(&document, "modules").unwrap_or(&Value::Null))
        .iter()
        .find(|item| {
            text(get(item, "id").unwrap_or(&Value::Null)).as_deref() == Some(owner.as_str())
        })?;
    let record = fields(get(module, "elements").unwrap_or(&Value::Null))
        .iter()
        .find(|item| get(item, "id") == Some(element))?;
    let key = fields(get(record, "keys").unwrap_or(&Value::Null))
        .iter()
        .find(|item| text(get(item, "id").unwrap_or(&Value::Null)).as_deref() == Some(key_id))?;
    Some((
        table,
        fields(get(key, "fields").unwrap_or(&Value::Null)).to_vec(),
    ))
}
fn dependency_expression_fields(
    bundle: &Value,
    table: &str,
    node: &Value,
    out: &mut Vec<FieldCoordinate>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    charge(ctx, 1, "/steps")?;
    match text(get(node, "op").unwrap_or(&Value::Null)).as_deref() {
        Some("field") => add_dependency_field(bundle, table, v(node, "field"), out, ctx)?,
        Some("literal") => {}
        Some("eq" | "ne" | "lt" | "le" | "gt" | "ge") => {
            dependency_expression_fields(bundle, table, v(node, "left"), out, ctx)?;
            dependency_expression_fields(bundle, table, v(node, "right"), out, ctx)?;
        }
        Some("and" | "or") => {
            for child in fields(get(node, "args").unwrap_or(&Value::Null)) {
                dependency_expression_fields(bundle, table, child, out, ctx)?;
            }
        }
        Some("not" | "isNull" | "in") => {
            dependency_expression_fields(bundle, table, v(node, "arg"), out, ctx)?
        }
        _ => {
            return Err(error(
                "TABLE_MIGRATION_UNSUPPORTED",
                "/steps",
                "G11 dependency expression has an unsupported typed operator",
            ))
        }
    }
    Ok(())
}
fn dependency_policy_fields(
    bundle: &Value,
    document: &Value,
    payload: &Value,
    table: &str,
    rule: &Value,
    out: &mut Vec<FieldCoordinate>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    charge(ctx, 1, "/steps")?;
    match text(get(rule, "kind").unwrap_or(&Value::Null)).as_deref() {
        Some("allow" | "deny" | "memberOfRole") => {}
        Some("owner" | "memberOf") => {
            add_dependency_field(bundle, table, v(rule, "field"), out, ctx)?
        }
        Some("any" | "all") => {
            for child in fields(get(rule, "rules").unwrap_or(&Value::Null)) {
                dependency_policy_fields(bundle, document, payload, table, child, out, ctx)?;
            }
        }
        Some("related") => {
            let related = get(rule, "record").unwrap_or(&Value::Null);
            let related_table = table_for_record(document, payload, related)
                .map(|(id, _)| id)
                .unwrap_or_else(|| table.to_owned());
            for pair in fields(get(rule, "matches").unwrap_or(&Value::Null)) {
                add_dependency_field(bundle, table, v(pair, "source"), out, ctx)?;
                add_dependency_field(bundle, &related_table, v(pair, "target"), out, ctx)?;
            }
            dependency_policy_fields(
                bundle,
                document,
                payload,
                &related_table,
                v(rule, "rule"),
                out,
                ctx,
            )?;
        }
        Some("via") => {
            let mut current_record = fields(get(payload, "tables").unwrap_or(&Value::Null))
                .iter()
                .find(|item| {
                    text(get(item, "id").unwrap_or(&Value::Null)).as_deref() == Some(table)
                })
                .and_then(|item| get(item, "record"))
                .cloned()
                .ok_or_else(|| {
                    error(
                        "TABLE_MIGRATION_UNSUPPORTED",
                        "/steps",
                        "G11 via policy has no current Record",
                    )
                })?;
            for step in fields(get(rule, "path").unwrap_or(&Value::Null)) {
                let owner = text(get(step, "module").unwrap_or(&Value::Null)).unwrap_or_default();
                let rid = get(step, "id").unwrap_or(&Value::Null);
                let module = fields(get(document, "modules").unwrap_or(&Value::Null))
                    .iter()
                    .find(|item| {
                        text(get(item, "id").unwrap_or(&Value::Null)).as_deref()
                            == Some(owner.as_str())
                    })
                    .ok_or_else(|| {
                        error(
                            "TABLE_MIGRATION_UNSUPPORTED",
                            "/steps",
                            "G11 policy relationship module is unresolved",
                        )
                    })?;
                let relationship = fields(get(module, "relationships").unwrap_or(&Value::Null))
                    .iter()
                    .find(|item| get(item, "id") == Some(rid))
                    .ok_or_else(|| {
                        error(
                            "TABLE_MIGRATION_UNSUPPORTED",
                            "/steps",
                            "G11 policy relationship is unresolved",
                        )
                    })?;
                let sources = fields(get(relationship, "source").unwrap_or(&Value::Null));
                let targets = fields(get(relationship, "target").unwrap_or(&Value::Null));
                if owner != text(get(bundle, "module").unwrap_or(&Value::Null)).unwrap_or_default()
                    || sources.len() != 1
                    || targets.len() != 1
                {
                    return Err(error(
                        "TABLE_MIGRATION_UNSUPPORTED",
                        "/steps",
                        "G11 via relationship is not a supported single-ended relationship",
                    ));
                }
                let forward = text(get(step, "direction").unwrap_or(&Value::Null)).as_deref()
                    == Some("forward");
                let from = if forward { &sources[0] } else { &targets[0] };
                let to = if forward { &targets[0] } else { &sources[0] };
                if ref_key(from) != ref_key(&current_record) {
                    return Err(error(
                        "TABLE_MIGRATION_UNSUPPORTED",
                        "/steps",
                        "G11 via relationship does not continue from the current Record",
                    ));
                }
                let mut bindings = Vec::new();
                for candidate in fields(get(payload, "tables").unwrap_or(&Value::Null)) {
                    for foreign_key in fields(get(candidate, "foreignKeys").unwrap_or(&Value::Null))
                    {
                        let rel = get(foreign_key, "relationship").unwrap_or(&Value::Null);
                        if get(rel, "module") == Some(&s(&owner)) && get(rel, "id") == Some(rid) {
                            bindings.push((candidate, foreign_key));
                        }
                    }
                }
                if bindings.len() != 1 {
                    return Err(error(
                        "TABLE_MIGRATION_UNSUPPORTED",
                        "/steps",
                        "G11 via relationship requires exactly one native ForeignKey binding",
                    ));
                }
                let (binding_table, foreign_key) = bindings[0];
                let binding_id =
                    text(get(binding_table, "id").unwrap_or(&Value::Null)).unwrap_or_default();
                let expected_source = table_for_record(document, payload, &sources[0]);
                let expected_target = table_for_record(document, payload, &targets[0]);
                let foreign_key_target_record =
                    get(get(foreign_key, "target").unwrap_or(&Value::Null), "record");
                if expected_source.as_ref().map(|(id, _)| id.as_str()) != Some(binding_id.as_str())
                    || expected_target
                        .as_ref()
                        .is_none_or(|(_, record)| Some(record) != foreign_key_target_record)
                {
                    return Err(error("TABLE_MIGRATION_UNSUPPORTED", "/steps", "G11 via ForeignKey binding disagrees with the typed relationship direction"));
                }
                for field in fields(get(foreign_key, "fields").unwrap_or(&Value::Null)) {
                    add_dependency_field(bundle, &binding_id, field, out, ctx)?;
                }
                let target = get(foreign_key, "target").unwrap_or(&Value::Null);
                if let Some((target_table, target_fields)) =
                    target_key_fields(document, payload, v(target, "record"), &txt(target, "key"))
                {
                    for field in &target_fields {
                        add_dependency_field(bundle, &target_table, field, out, ctx)?;
                    }
                } else {
                    return Err(error(
                        "TABLE_MIGRATION_UNSUPPORTED",
                        "/steps",
                        "G11 via ForeignKey target Key is unresolved",
                    ));
                }
                current_record = to.clone();
            }
            let final_table = table_for_record(document, payload, &current_record)
                .map(|(id, _)| id)
                .ok_or_else(|| {
                    error(
                        "TABLE_MIGRATION_UNSUPPORTED",
                        "/steps",
                        "G11 via path ends at an unresolved table",
                    )
                })?;
            dependency_policy_fields(
                bundle,
                document,
                payload,
                &final_table,
                v(rule, "rule"),
                out,
                ctx,
            )?;
        }
        _ => {
            return Err(error(
                "TABLE_MIGRATION_UNSUPPORTED",
                "/steps",
                "G11 policy dependency has an unsupported typed rule",
            ))
        }
    }
    Ok(())
}
fn dependency_refs(
    bundle: &Value,
    subject: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<FieldCoordinate>, EngineError> {
    let source_path = text(get(subject, "sourcePath").unwrap_or(&Value::Null)).unwrap_or_default();
    let doc = source_document(bundle, ctx)?;
    let item = at_pointer(&doc, &source_path).ok_or_else(|| {
        error(
            "TABLE_MIGRATION_UNSUPPORTED",
            &source_path,
            "G11 dependency source path does not resolve",
        )
    })?;
    let mut refs = Vec::new();
    let table = text(get(subject, "table").unwrap_or(&Value::Null)).unwrap_or_default();
    let kind = text(get(subject, "kind").unwrap_or(&Value::Null)).unwrap_or_default();
    let module_id = text(get(bundle, "module").unwrap_or(&Value::Null)).unwrap_or_default();
    let (_, payload) = module_and_payload(&doc, &module_id).ok_or_else(|| {
        error(
            "TABLE_MIGRATION_UNSUPPORTED",
            &source_path,
            "G11 dependency table payload is missing",
        )
    })?;
    match kind.as_str() {
        "check"
            if text(get(subject, "id").unwrap_or(&Value::Null))
                .is_some_and(|id| id.starts_with("domain:")) =>
        {
            for column in fields(
                get(
                    get(bundle, "expectedCatalog").unwrap_or(&Value::Null),
                    "columns",
                )
                .unwrap_or(&Value::Null),
            ) {
                let field = get(column, "field").unwrap_or(&Value::Null);
                let domain_id =
                    format!("domain:{}.{}", txt(field, "module"), txt(field, "element"));
                if get(column, "table").and_then(text).as_deref() == Some(table.as_str())
                    && text(get(subject, "id").unwrap_or(&Value::Null)).as_deref()
                        == Some(domain_id.as_str())
                {
                    add_dependency_field(bundle, &table, field, &mut refs, ctx)?;
                }
            }
        }
        "check" => {
            dependency_expression_fields(bundle, &table, v(item, "expression"), &mut refs, ctx)?
        }
        "key" | "index" => {
            for field in fields(get(item, "fields").unwrap_or(&Value::Null)) {
                add_dependency_field(bundle, &table, field, &mut refs, ctx)?;
            }
            if kind == "index" {
                for field in fields(get(item, "include").unwrap_or(&Value::Null)) {
                    add_dependency_field(bundle, &table, field, &mut refs, ctx)?;
                }
            }
        }
        "foreignKey" => {
            for field in fields(get(item, "fields").unwrap_or(&Value::Null)) {
                add_dependency_field(bundle, &table, field, &mut refs, ctx)?;
            }
            let target = get(item, "target").unwrap_or(&Value::Null);
            if let Some((target_table, target_fields)) =
                target_key_fields(&doc, payload, v(target, "record"), &txt(target, "key"))
            {
                for field in &target_fields {
                    add_dependency_field(bundle, &target_table, field, &mut refs, ctx)?;
                }
            }
        }
        "policy" => dependency_policy_fields(bundle, &doc, payload, &table, item, &mut refs, ctx)?,
        "grant" => {
            if source_path.ends_with("/update") {
                let table_source = fields(get(payload, "tables").unwrap_or(&Value::Null))
                    .iter()
                    .find(|candidate| {
                        text(get(candidate, "id").unwrap_or(&Value::Null)).as_deref()
                            == Some(table.as_str())
                    })
                    .unwrap_or(&Value::Null);
                let record_ref = get(table_source, "record").unwrap_or(&Value::Null);
                let owner =
                    text(get(record_ref, "module").unwrap_or(&Value::Null)).unwrap_or_default();
                let rid = get(record_ref, "element").unwrap_or(&Value::Null);
                let owner_module = fields(get(&doc, "modules").unwrap_or(&Value::Null))
                    .iter()
                    .find(|candidate| {
                        text(get(candidate, "id").unwrap_or(&Value::Null)).as_deref()
                            == Some(owner.as_str())
                    })
                    .unwrap_or(&Value::Null);
                let record = fields(get(owner_module, "elements").unwrap_or(&Value::Null))
                    .iter()
                    .find(|candidate| get(candidate, "id") == Some(rid))
                    .unwrap_or(&Value::Null);
                let keys = fields(get(record, "keys").unwrap_or(&Value::Null));
                for column in fields(get(table_source, "columns").unwrap_or(&Value::Null)) {
                    let field = get(column, "field").unwrap_or(&Value::Null);
                    let is_key = keys.iter().any(|key| {
                        fields(get(key, "fields").unwrap_or(&Value::Null))
                            .iter()
                            .any(|key_field| ref_key(key_field) == ref_key(field))
                    });
                    if get(column, "immutable") == Some(&Value::Bool(true))
                        || get(column, "generated")
                            .is_some_and(|value| value != &Value::Bool(false))
                        || is_key
                    {
                        continue;
                    }
                    add_dependency_field(bundle, &table, field, &mut refs, ctx)?;
                }
            }
        }
        _ => {
            return Err(error(
                "TABLE_MIGRATION_UNSUPPORTED",
                &source_path,
                "G11 dependency kind has no typed field semantics",
            ))
        }
    }
    Ok(refs)
}
fn foreign_key_target(
    bundle: &Value,
    subject: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<(String, String)>, EngineError> {
    if text(get(subject, "kind").unwrap_or(&Value::Null)).as_deref() != Some("foreignKey") {
        return Ok(None);
    }
    let path = text(get(subject, "sourcePath").unwrap_or(&Value::Null)).unwrap_or_default();
    let document = source_document(bundle, ctx)?;
    let Some(fk) = at_pointer(&document, &path) else {
        return Ok(None);
    };
    let target = get(fk, "target").unwrap_or(&Value::Null);
    let record = get(target, "record").unwrap_or(&Value::Null);
    let key = text(get(target, "key").unwrap_or(&Value::Null)).unwrap_or_default();
    let table = fields(
        get(
            get(bundle, "expectedCatalog").unwrap_or(&Value::Null),
            "tables",
        )
        .unwrap_or(&Value::Null),
    )
    .iter()
    .find(|table| get(table, "record") == Some(record));
    Ok(table.map(|table| (txt(table, "id"), key)))
}
pub(super) fn foreign_key_targets_key(
    bundle: &Value,
    foreign_key: &Value,
    target_table_id: &str,
    key_id: &str,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let table_id = txt(foreign_key, "table");
    let path = source_path(
        bundle,
        &table_id,
        "foreignKey",
        &txt(foreign_key, "id"),
        ctx,
    )?;
    let document = source_document(bundle, ctx)?;
    let Some(declaration) = at_pointer(&document, &path) else {
        return Ok(false);
    };
    let target = get(declaration, "target").unwrap_or(&Value::Null);
    if text(get(target, "key").unwrap_or(&Value::Null)).as_deref() != Some(key_id) {
        return Ok(false);
    }
    let target_record = get(target, "record").unwrap_or(&Value::Null);
    Ok(fields(
        get(
            get(bundle, "expectedCatalog").unwrap_or(&Value::Null),
            "tables",
        )
        .unwrap_or(&Value::Null),
    )
    .iter()
    .any(|table| {
        text(get(table, "id").unwrap_or(&Value::Null)).as_deref() == Some(target_table_id)
            && get(table, "record") == Some(target_record)
    }))
}
pub(super) fn order_steps(
    previous: &Value,
    next: &Value,
    steps: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let count = steps.len();
    let mut edges = vec![std::collections::BTreeSet::<usize>::new(); count];
    let mut indegree = vec![0usize; count];
    let role = |step: &Value| {
        text(get(step, "phaseOperation").unwrap_or(&Value::Null)).unwrap_or_default()
    };
    let same_target = |a: &Value, b: &Value| {
        let ta = get(a, "phaseTarget").unwrap_or(&Value::Null);
        let tb = get(b, "phaseTarget").unwrap_or(&Value::Null);
        get(ta, "table") == get(tb, "table")
            && get(ta, "field") == get(tb, "field")
            && get(a, "phaseTarget").is_some()
            && get(b, "phaseTarget").is_some()
    };
    let mut refs = Vec::new();
    for step in steps.iter() {
        if let Some(subject) = get(step, "phaseDependency") {
            refs.push(dependency_refs(
                if role(step) == "dependency-drop" {
                    previous
                } else {
                    next
                },
                subject,
                ctx,
            )?);
        } else {
            refs.push(vec![]);
        }
    }
    let mut add = |a: usize, b: usize| {
        if a != b && edges[a].insert(b) {
            indegree[b] += 1;
        }
    };
    for i in 0..count {
        for j in 0..count {
            charge(ctx, 1, "/steps")?;
            let a = &steps[i];
            let b = &steps[j];
            let ar = role(a);
            let br = role(b);
            let dep_drop = ar == "dependency-drop";
            let dep_add = ar == "dependency-add";
            if dep_drop && br == "drop-column" {
                let target = get(b, "phaseTarget").unwrap_or(&Value::Null);
                if refs[i].iter().any(|(table, field)| {
                    get(target, "field") == Some(field)
                        && get(target, "table").and_then(text).as_deref() == Some(table.as_str())
                }) {
                    add(i, j);
                }
            }
            if ar == "drop-column"
                && br == "add-column"
                && get(get(a, "phaseTarget").unwrap_or(&Value::Null), "table")
                    == get(get(b, "phaseTarget").unwrap_or(&Value::Null), "table")
            {
                let ta = get(a, "phaseTarget").unwrap_or(&Value::Null);
                let tb = get(b, "phaseTarget").unwrap_or(&Value::Null);
                let table = text(get(ta, "table").unwrap_or(&Value::Null)).unwrap_or_default();
                let fa = get(ta, "field").unwrap_or(&Value::Null);
                let fb = get(tb, "field").unwrap_or(&Value::Null);
                let old = fields(
                    get(
                        get(previous, "expectedCatalog").unwrap_or(&Value::Null),
                        "columns",
                    )
                    .unwrap_or(&Value::Null),
                )
                .iter()
                .find(|c| {
                    get(c, "table").and_then(text).as_deref() == Some(table.as_str())
                        && get(c, "field") == Some(fa)
                });
                let fresh = fields(
                    get(
                        get(next, "expectedCatalog").unwrap_or(&Value::Null),
                        "columns",
                    )
                    .unwrap_or(&Value::Null),
                )
                .iter()
                .find(|c| {
                    get(c, "table").and_then(text).as_deref() == Some(table.as_str())
                        && get(c, "field") == Some(fb)
                });
                if old.and_then(|c| get(c, "name")) == fresh.and_then(|c| get(c, "name")) {
                    add(i, j);
                }
            }
            if ar == "add-column" && same_target(a, b) && br != "dependency-drop" {
                add(i, j);
            }
            if ar == "backfill"
                && same_target(a, b)
                && ["install-default", "target-check", "tighten-not-null"].contains(&br.as_str())
            {
                add(i, j);
            }
            if ar == "target-check" && same_target(a, b) && br == "tighten-not-null" {
                add(i, j);
            }
            if br == "dependency-add" && get(a, "phaseTarget").is_some() {
                let target = get(a, "phaseTarget").unwrap();
                if refs[j].iter().any(|(table, field)| {
                    get(target, "field") == Some(field)
                        && get(target, "table").and_then(text).as_deref() == Some(table.as_str())
                }) && [
                    "add-column",
                    "backfill",
                    "install-default",
                    "target-check",
                    "tighten-not-null",
                ]
                .contains(&ar.as_str())
                {
                    add(i, j);
                }
            }
            if dep_drop
                && br == "dependency-drop"
                && text(
                    get(get(a, "phaseDependency").unwrap_or(&Value::Null), "kind")
                        .unwrap_or(&Value::Null),
                )
                .as_deref()
                    == Some("foreignKey")
                && text(
                    get(get(b, "phaseDependency").unwrap_or(&Value::Null), "kind")
                        .unwrap_or(&Value::Null),
                )
                .as_deref()
                    == Some("key")
            {
                let target = foreign_key_target(
                    previous,
                    get(a, "phaseDependency").unwrap_or(&Value::Null),
                    ctx,
                )?;
                let dep = get(b, "phaseDependency").unwrap_or(&Value::Null);
                if target.as_ref().is_some_and(|(table, key)| {
                    get(dep, "table").and_then(text).as_deref() == Some(table.as_str())
                        && get(dep, "id").and_then(text).as_deref() == Some(key.as_str())
                }) {
                    add(i, j);
                }
            }
            if dep_add
                && br == "dependency-add"
                && text(
                    get(get(a, "phaseDependency").unwrap_or(&Value::Null), "kind")
                        .unwrap_or(&Value::Null),
                )
                .as_deref()
                    == Some("key")
                && text(
                    get(get(b, "phaseDependency").unwrap_or(&Value::Null), "kind")
                        .unwrap_or(&Value::Null),
                )
                .as_deref()
                    == Some("foreignKey")
            {
                let target = foreign_key_target(
                    next,
                    get(b, "phaseDependency").unwrap_or(&Value::Null),
                    ctx,
                )?;
                let dep = get(a, "phaseDependency").unwrap_or(&Value::Null);
                if target.as_ref().is_some_and(|(table, key)| {
                    get(dep, "table").and_then(text).as_deref() == Some(table.as_str())
                        && get(dep, "id").and_then(text).as_deref() == Some(key.as_str())
                }) {
                    add(i, j);
                }
            }
        }
    }
    let mut ready = (0..count)
        .filter(|index| indegree[*index] == 0)
        .collect::<Vec<_>>();
    let mut sorted = Vec::new();
    while !ready.is_empty() {
        let index = ready.remove(0);
        sorted.push(steps[index].clone());
        for target in edges[index].iter().copied() {
            indegree[target] -= 1;
            if indegree[target] == 0 {
                let at = ready
                    .iter()
                    .position(|item| *item > target)
                    .unwrap_or(ready.len());
                ready.insert(at, target);
            }
        }
    }
    if sorted.len() != count {
        return Err(error(
            "TABLE_MIGRATION_UNSUPPORTED",
            "/steps",
            "G11 typed dependency schedule contains a cycle",
        ));
    }
    *steps = sorted;
    Ok(())
}
fn pointer_parts(path: &str) -> Vec<String> {
    path.trim_start_matches('/')
        .split('/')
        .map(|part| part.replace("~1", "/").replace("~0", "~"))
        .collect()
}
fn at_pointer<'a>(root: &'a Value, path: &str) -> Option<&'a Value> {
    let mut value = root;
    for part in pointer_parts(path) {
        value = match value {
            Value::Object(fields) => {
                &fields
                    .iter()
                    .find(|(key, _)| key == &Utf16::from(part.as_str()))?
                    .1
            }
            Value::Array(items) => items.get(part.parse::<usize>().ok()?)?,
            _ => return None,
        };
    }
    Some(value)
}
fn remove_pointer(root: &mut Value, path: &str) -> bool {
    let parts = pointer_parts(path);
    let Some((last, parents)) = parts.split_last() else {
        return false;
    };
    let mut parent = root;
    for part in parents {
        parent = match parent {
            Value::Object(fields) => match fields
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from(part.as_str()))
            {
                Some((_, value)) => value,
                None => return false,
            },
            Value::Array(items) => match part
                .parse::<usize>()
                .ok()
                .and_then(|index| items.get_mut(index))
            {
                Some(value) => value,
                None => return false,
            },
            _ => return false,
        };
    }
    match parent {
        Value::Object(fields) => {
            let before = fields.len();
            fields.retain(|(key, _)| key != &Utf16::from(last.as_str()));
            fields.len() != before
        }
        Value::Array(items) => last.parse::<usize>().ok().is_some_and(|index| {
            index < items.len() && {
                items.remove(index);
                true
            }
        }),
        _ => false,
    }
}
fn normalize_selected_refs(value: &mut Value, module: &str, selected: &[String]) {
    if let Some(id) = text(get(value, "element").unwrap_or(&Value::Null)) {
        if text(get(value, "module").unwrap_or(&Value::Null)).as_deref() == Some(module)
            && selected.contains(&id)
        {
            *value = object(vec![
                ("module", s("$G11_SELECTED")),
                ("element", s("$G11_SELECTED")),
            ]);
            return;
        }
    }
    match value {
        Value::Array(items) => {
            for item in items {
                normalize_selected_refs(item, module, selected);
            }
        }
        Value::Object(items) => {
            for (_, item) in items {
                normalize_selected_refs(item, module, selected);
            }
        }
        _ => {}
    }
}
/// Admit source edits only when the exact G11 discovery graph binds them to
/// reviewed markers; retained source structure is compared after projecting
/// selected Field identities and explicitly selected native dependencies.
pub(super) fn validate_mapping_replacement(
    previous: &Value,
    next: &Value,
    options: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if text(get(get(previous, "source").unwrap_or(&Value::Null), "format").unwrap_or(&Value::Null))
        .as_deref()
        != Some("json")
        || text(get(get(next, "source").unwrap_or(&Value::Null), "format").unwrap_or(&Value::Null))
            .as_deref()
            != Some("json")
    {
        return Err(error(
            "TABLE_MIGRATION_OPTIONS",
            "/next/source/format",
            "G11 requires retained JSON sources",
        ));
    }
    if !eq(
        get(previous, "configuration").unwrap_or(&Value::Null),
        get(next, "configuration").unwrap_or(&Value::Null),
        ctx,
    )? || get(previous, "module") != get(next, "module")
        || get(previous, "profile") != get(next, "profile")
    {
        return Err(error(
            "TABLE_MIGRATION_OPTIONS",
            "/next/configuration",
            "G11 preserves module and complete native configuration",
        ));
    }
    let module_id = text(get(next, "module").unwrap_or(&Value::Null)).unwrap_or_default();
    let old_doc = source_document(previous, ctx)?;
    let new_doc = source_document(next, ctx)?;
    let old_cols = fields(
        get(
            get(previous, "expectedCatalog").unwrap_or(&Value::Null),
            "columns",
        )
        .unwrap_or(&Value::Null),
    );
    let new_cols = fields(
        get(
            get(next, "expectedCatalog").unwrap_or(&Value::Null),
            "columns",
        )
        .unwrap_or(&Value::Null),
    );
    let mut removed = Vec::<String>::new();
    let mut added = Vec::<String>::new();
    for old in old_cols {
        charge(ctx, 1, "/previous/expectedCatalog/columns")?;
        if !new_cols.iter().any(|fresh| {
            get(fresh, "table") == get(old, "table") && get(fresh, "field") == get(old, "field")
        }) {
            let field = get(old, "field").ok_or_else(|| {
                error(
                    "TABLE_MIGRATION_OPTIONS",
                    "/previous/expectedCatalog/columns",
                    "Missing Field reference",
                )
            })?;
            if text(get(field, "module").unwrap_or(&Value::Null)).as_deref()
                == Some(module_id.as_str())
            {
                let id = text(get(field, "element").unwrap_or(&Value::Null)).ok_or_else(|| {
                    error(
                        "TABLE_MIGRATION_OPTIONS",
                        "/previous/expectedCatalog/columns",
                        "Invalid Field reference",
                    )
                })?;
                if !removed.contains(&id) {
                    removed.try_reserve(1).map_err(|_| {
                        error(
                            "LIMIT",
                            "/previous/expectedCatalog/columns",
                            "Allocation refused",
                        )
                    })?;
                    removed.push(id);
                }
            }
        }
    }
    for fresh in new_cols {
        charge(ctx, 1, "/next/expectedCatalog/columns")?;
        if !old_cols.iter().any(|old| {
            get(old, "table") == get(fresh, "table") && get(old, "field") == get(fresh, "field")
        }) {
            let field = get(fresh, "field").ok_or_else(|| {
                error(
                    "TABLE_MIGRATION_OPTIONS",
                    "/next/expectedCatalog/columns",
                    "Missing Field reference",
                )
            })?;
            if text(get(field, "module").unwrap_or(&Value::Null)).as_deref()
                == Some(module_id.as_str())
            {
                let id = text(get(field, "element").unwrap_or(&Value::Null)).ok_or_else(|| {
                    error(
                        "TABLE_MIGRATION_OPTIONS",
                        "/next/expectedCatalog/columns",
                        "Invalid Field reference",
                    )
                })?;
                if !added.contains(&id) {
                    added.try_reserve(1).map_err(|_| {
                        error(
                            "LIMIT",
                            "/next/expectedCatalog/columns",
                            "Allocation refused",
                        )
                    })?;
                    added.push(id);
                }
            }
        }
    }
    if removed.is_empty() || added.is_empty() {
        return Err(error(
            "TABLE_MIGRATION_OPTIONS",
            "/next/source",
            "G11 requires a stored Field removal and addition",
        ));
    }
    let all_fields_old = fields(
        get(
            get(&old_doc, "modules")
                .and_then(|a| {
                    fields(a)
                        .iter()
                        .find(|m| get(m, "id") == get(previous, "module"))
                })
                .unwrap_or(&Value::Null),
            "elements",
        )
        .unwrap_or(&Value::Null),
    );
    let all_fields_new = fields(
        get(
            get(&new_doc, "modules")
                .and_then(|a| {
                    fields(a)
                        .iter()
                        .find(|m| get(m, "id") == get(next, "module"))
                })
                .unwrap_or(&Value::Null),
            "elements",
        )
        .unwrap_or(&Value::Null),
    );
    let mut removed_declarations = Vec::new();
    for id in &removed {
        let is_selected = |element: &&Value| {
            text(get(element, "id").unwrap_or(&Value::Null)).as_deref() == Some(id.as_str())
        };
        if all_fields_old.iter().filter(is_selected).count() != 1 {
            return Err(error(
                "TABLE_MIGRATION_OPTIONS",
                "/next/source/modules",
                "Removed G11 mappings must refer to exact predecessor Field declarations",
            ));
        }
        if !all_fields_new.iter().any(|element| is_selected(&element)) {
            removed_declarations.push(id.clone());
        }
    }
    for id in &added {
        if all_fields_new
            .iter()
            .filter(|e| text(get(e, "id").unwrap_or(&Value::Null)).as_deref() == Some(id))
            .count()
            != 1
            || all_fields_old
                .iter()
                .any(|e| text(get(e, "id").unwrap_or(&Value::Null)).as_deref() == Some(id))
        {
            return Err(error(
                "TABLE_MIGRATION_OPTIONS",
                "/next/source/modules",
                "Added G11 Fields must be exact successor declarations absent from the predecessor",
            ));
        }
    }
    // G11 reviews the complete 0.3 discovery graph. Base discovery omits
    // added constraints and source-bound operations, so using it here would
    // leave legitimate selected dependencies in the source certificate.
    let base = discover_verified(previous, next, true, ctx)?;
    let added_constraints = discovery::discover_added_constraints(previous, next, ctx)?;
    let mut candidates = interleave_g03_added_constraints(
        base,
        added_constraints,
        get(next, "expectedCatalog")
            .and_then(|catalog| get(catalog, "tables"))
            .and_then(|tables| match tables {
                Value::Array(tables) => Some(tables.as_slice()),
                _ => None,
            })
            .unwrap_or(&[]),
        ctx,
    )?;
    candidates.extend(discovery::discover_default_changes(previous, next, ctx)?);
    candidates.extend(discovery::discover_operation_context_changes(
        previous, next, ctx,
    )?);
    let markers = fields(get(options, "reviewedChanges").unwrap_or(&Value::Null));
    let mut old_normal = copy(&old_doc, ctx)?;
    let mut new_normal = copy(&new_doc, ctx)?;
    strip_selected(
        &mut old_normal,
        &module_id,
        &removed,
        &added,
        &removed_declarations,
        ctx,
    )?;
    strip_selected(
        &mut new_normal,
        &module_id,
        &removed,
        &added,
        &removed_declarations,
        ctx,
    )?;
    for candidate in &candidates {
        let kind = text(get(candidate, "kind").unwrap_or(&Value::Null)).unwrap_or_default();
        if !dependency_candidate(&kind) {
            continue;
        }
        if kind == "change-policy" {
            let path = text(get(candidate, "path").unwrap_or(&Value::Null)).unwrap_or_default();
            if !remove_pointer(&mut old_normal, &path) || !remove_pointer(&mut new_normal, &path) {
                return Err(error(
                    "TABLE_MIGRATION_OPTIONS",
                    "/next/source",
                    "Discovered G11 policy path does not resolve on both sides",
                ));
            }
            continue;
        }
        let id = get(candidate, "id").cloned().unwrap_or(Value::Null);
        if !markers.iter().any(|marker| get(marker, "id") == Some(&id)) {
            continue;
        }
        let old_path = text(get(candidate, "oldPath").unwrap_or(&Value::Null));
        let new_path = text(get(candidate, "newPath").unwrap_or(&Value::Null));
        if kind == "change-operation" && old_path.is_some() && new_path.is_some() {
            let before =
                at_pointer(&old_normal, old_path.as_deref().unwrap()).ok_or_else(|| {
                    error(
                        "TABLE_MIGRATION_OPTIONS",
                        "/previous/source",
                        "Discovered G11 operation path does not resolve",
                    )
                })?;
            let after = at_pointer(&new_normal, new_path.as_deref().unwrap()).ok_or_else(|| {
                error(
                    "TABLE_MIGRATION_OPTIONS",
                    "/next/source",
                    "Discovered G11 operation path does not resolve",
                )
            })?;
            if !contains_selected(before, &module_id, &removed, ctx)?
                && !contains_selected(after, &module_id, &added, ctx)?
            {
                return Err(error(
                    "TABLE_MIGRATION_OPTIONS",
                    "/options/reviewedChanges",
                    "Changed operation must reference a selected G11 Field",
                ));
            }
            let before_body = v(before, "body");
            let after_body = v(after, "body");
            let editable_body_members: &[&str] = match txt(before_body, "kind").as_str() {
                "read" => &["fields"],
                "insert" | "insertFrom" | "update" | "upsert" => &["values", "returning"],
                _ => &[],
            };
            if !eq(
                &omit(before, &["parameters", "body"], ctx)?,
                &omit(after, &["parameters", "body"], ctx)?,
                ctx,
            )? || !eq(
                &omit(before_body, editable_body_members, ctx)?,
                &omit(after_body, editable_body_members, ctx)?,
                ctx,
            )? {
                return Err(error(
                    "TABLE_MIGRATION_OPTIONS",
                    new_path.as_deref().unwrap(),
                    "Changed G11 operation must preserve command metadata and non-projection body meaning",
                ));
            }
            continue;
        }
        if let Some(path) = old_path {
            if kind == "change-operation" {
                if let Some(operation) = at_pointer(&old_normal, &path) {
                    if !contains_selected(operation, &module_id, &removed, ctx)? {
                        return Err(error(
                            "TABLE_MIGRATION_OPTIONS",
                            "/options/reviewedChanges",
                            "Changed operation must reference a selected G11 Field",
                        ));
                    }
                }
            }
            if !remove_pointer(&mut old_normal, &path) {
                return Err(error(
                    "TABLE_MIGRATION_OPTIONS",
                    "/previous/source",
                    "Discovered G11 predecessor source path does not resolve",
                ));
            }
        }
        if let Some(path) = new_path {
            if kind == "change-operation" {
                if let Some(operation) = at_pointer(&new_normal, &path) {
                    if !contains_selected(operation, &module_id, &added, ctx)? {
                        return Err(error(
                            "TABLE_MIGRATION_OPTIONS",
                            "/options/reviewedChanges",
                            "Changed operation must reference a selected G11 Field",
                        ));
                    }
                }
            }
            if !remove_pointer(&mut new_normal, &path) {
                return Err(error(
                    "TABLE_MIGRATION_OPTIONS",
                    "/next/source",
                    "Discovered G11 successor source path does not resolve",
                ));
            }
        }
    }
    if let Some(old_module) = member_mut(&mut old_normal, "modules").and_then(|v| {
        fields_mut(v).and_then(|modules| {
            modules
                .iter_mut()
                .find(|m| get(m, "id") == get(previous, "module"))
        })
    }) {
        if let Some(payload) =
            member_mut(old_module, "extensions").and_then(|v| member_mut(v, "umf.tables"))
        {
            if let Some(commands) = member_mut(payload, "commands") {
                normalize_selected_refs(commands, &module_id, &removed);
            }
        }
    }
    if let Some(new_module) = member_mut(&mut new_normal, "modules").and_then(|v| {
        fields_mut(v).and_then(|modules| {
            modules
                .iter_mut()
                .find(|m| get(m, "id") == get(next, "module"))
        })
    }) {
        if let Some(payload) =
            member_mut(new_module, "extensions").and_then(|v| member_mut(v, "umf.tables"))
        {
            if let Some(commands) = member_mut(payload, "commands") {
                normalize_selected_refs(commands, &module_id, &added);
            }
        }
    }
    if !eq(&old_normal, &new_normal, ctx)? {
        return Err(error(
            "TABLE_MIGRATION_OPTIONS",
            "/next/source",
            "G11 replacement changes unselected source meaning",
        ));
    }
    for candidate in &candidates {
        let marker = markers.iter().find(|marker| {
            get(marker, "id") == get(candidate, "id")
                && get(marker, "kind") == get(candidate, "kind")
                && get(marker, "path") == get(candidate, "path")
                && get(marker, "oldDigest") == get(candidate, "oldDigest")
                && get(marker, "newDigest") == get(candidate, "newDigest")
        });
        if marker.is_none() {
            return Err(error(
                "TABLE_MIGRATION_OPTIONS",
                "/options/reviewedChanges",
                "Every discovered G11 source/dependency change requires its exact review marker",
            ));
        }
    }
    if markers.len() != candidates.len() {
        return Err(error(
            "TABLE_MIGRATION_OPTIONS",
            "/options/reviewedChanges",
            "G11 review markers must correspond exactly to discovered source changes",
        ));
    }
    if markers
        .iter()
        .any(|marker| get(marker, "conversion").is_some())
    {
        return Err(error(
            "TABLE_MIGRATION_OPTIONS",
            "/options/reviewedChanges",
            "G11 markers do not admit conversion metadata",
        ));
    }
    Ok(())
}

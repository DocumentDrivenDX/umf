// SPDX-License-Identifier: MIT OR Apache-2.0
//! Reviewed-change candidates bind exact source meanings, never installation authority.
use super::*;
fn v<'a>(x: &'a Value, k: &str) -> &'a Value {
    get(x, k).unwrap_or(&Value::Null)
}
fn cp(x: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    copy_value(x, ctx)
}
fn txt(x: &Value, k: &str) -> String {
    text(v(x, k)).unwrap_or_default()
}
fn add(
    out: &mut Vec<Value>,
    kind: &str,
    path: &str,
    old: Value,
    new: Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if eq(&old, &new, ctx)? {
        return Ok(());
    }
    let od = digest(&old, ctx)?;
    let nd = digest(&new, ctx)?;
    charge(
        ctx,
        path.len().saturating_add(kind.len()).saturating_add(256),
        path,
    )?;
    let id = format!(
        "review-{}",
        &hex(&crate::canonical::canonical_sha256_admitted(
            &array(vec![s(kind), s(path), cp(&od, ctx)?, cp(&nd, ctx)?]),
            ctx
        )?)[..24]
    );
    out.push(object(vec![
        ("id", s(&id)),
        ("kind", s(kind)),
        ("path", s(path)),
        ("oldDigest", od),
        ("newDigest", nd),
        ("oldValue", old),
        ("newValue", new),
    ]));
    Ok(())
}
fn filtered<'a>(
    bundle: &'a Value,
    kind: &str,
    table: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<&'a Value>, EngineError> {
    let a = items(get(v(bundle, "expectedCatalog"), kind));
    charge(ctx, a.len().saturating_add(1), "")?;
    Ok(a.iter()
        .filter(|x| get(x, "table") == get(table, "id"))
        .collect())
}
pub(super) fn discover(
    previous: &Value,
    next: &Value,
    domain_aware: bool,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let old_doc = source_document(previous, ctx)?;
    let new_doc = source_document(next, ctx)?;
    let ot = items(get(v(previous, "expectedCatalog"), "tables"));
    let nt = items(get(v(next, "expectedCatalog"), "tables"));
    let nm = items(get(&new_doc, "modules"));
    let mi = nm
        .iter()
        .position(|x| get(x, "id") == get(next, "module"))
        .unwrap_or(0);
    let mut out = Vec::new();
    for table in ot {
        charge(ctx, nt.len().saturating_add(1), "")?;
        let Some(fresh_table) = nt.iter().find(|t| get(t, "id") == get(table, "id")) else {
            continue;
        };
        let ti = nt
            .iter()
            .position(|t| get(t, "id") == get(table, "id"))
            .unwrap();
        let old_cols = filtered(previous, "columns", table, ctx)?;
        let new_cols = filtered(next, "columns", table, ctx)?;
        for old in old_cols {
            charge(ctx, new_cols.len().saturating_add(1), "")?;
            let fresh = new_cols
                .iter()
                .copied()
                .find(|x| field_key(x) == field_key(old));
            let reference = v(old, "field");
            let path = txt(fresh.unwrap_or(old), "sourcePath");
            let old_map = find_ref(items(get(table, "columns")), reference).unwrap_or(&Value::Null);
            let new_map = fresh
                .and_then(|x| find_ref(items(get(fresh_table, "columns")), v(x, "field")))
                .unwrap_or(&Value::Null);
            let ol = logical_field(&old_doc, reference).unwrap_or(&Value::Null);
            let nl = fresh
                .and_then(|x| logical_field(&new_doc, v(x, "field")))
                .unwrap_or(&Value::Null);
            let mut old_meaning = object(vec![
                ("physical", cp(old, ctx)?),
                ("logical", cp(ol, ctx)?),
                ("mapping", cp(old_map, ctx)?),
            ]);
            let new_meaning = match fresh {
                Some(f) => object(vec![
                    ("physical", cp(f, ctx)?),
                    ("logical", cp(nl, ctx)?),
                    ("mapping", cp(new_map, ctx)?),
                ]),
                None => Value::Null,
            };
            let Some(fresh) = fresh else {
                let mut seeds = Vec::new();
                for set in items(get(previous, "seedSets")) {
                    charge(ctx, 1, "")?;
                    for row in items(get(set, "rows")) {
                        charge(ctx, 1, "")?;
                        if get(row, "table") != get(old, "table") {
                            continue;
                        }
                        for entry in items(get(row, "values")) {
                            charge(ctx, 1, "")?;
                            if field_key(entry) == field_key(old) {
                                seeds.push(cp(entry, ctx)?);
                            }
                        }
                    }
                }
                if let Value::Object(fields) = &mut old_meaning {
                    fields.push((Utf16::from("seedValues"), array(seeds)));
                }
                add(
                    &mut out,
                    "drop-column",
                    &path,
                    old_meaning,
                    Value::Null,
                    ctx,
                )?;
                continue;
            };
            if get(old, "name") != get(fresh, "name") {
                add(
                    &mut out,
                    "rename-column",
                    &path,
                    cp(&old_meaning, ctx)?,
                    cp(&new_meaning, ctx)?,
                    ctx,
                )?;
            }
            if ["typeSchema", "typeName", "typeMod"]
                .iter()
                .any(|k| get(old, k) != get(fresh, k))
            {
                add(
                    &mut out,
                    "change-column-type",
                    &path,
                    cp(&old_meaning, ctx)?,
                    cp(&new_meaning, ctx)?,
                    ctx,
                )?;
            }
            if get(old, "nullable") == Some(&Value::Bool(true))
                && get(fresh, "nullable") != Some(&Value::Bool(true))
            {
                add(
                    &mut out,
                    "tighten-not-null",
                    &path,
                    cp(&old_meaning, ctx)?,
                    cp(&new_meaning, ctx)?,
                    ctx,
                )?;
            }
            if get(old, "nullable") != Some(&Value::Bool(true))
                && get(fresh, "nullable") == Some(&Value::Bool(true))
            {
                add(
                    &mut out,
                    "relax-not-null",
                    &path,
                    old_meaning,
                    new_meaning,
                    ctx,
                )?;
            }
        }
        let record = v(table, "record");
        let old_record = logical_field(&old_doc, record).unwrap_or(&Value::Null);
        let new_record = logical_field(&new_doc, record).unwrap_or(&Value::Null);
        let record_module = txt(record, "module");
        let record_index = module(&new_doc, &record_module)
            .map(|m| {
                items(get(m, "elements"))
                    .iter()
                    .position(|e| get(e, "id") == get(record, "element"))
                    .map(|i| i as isize)
                    .unwrap_or(-1)
            })
            .unwrap_or(0);
        for kind in ["checks", "foreignKeys", "indexes", "keys"] {
            let old = filtered(previous, kind, table, ctx)?;
            let fresh = filtered(next, kind, table, ctx)?;
            for item in old {
                charge(ctx, fresh.len().saturating_add(1), "")?;
                let successor = fresh
                    .iter()
                    .copied()
                    .find(|x| get(x, "id") == get(item, "id"));
                if eq(item, successor.unwrap_or(&Value::Null), ctx)? && !domain_aware {
                    continue;
                }
                let old_list = if kind == "keys" {
                    items(get(old_record, "keys"))
                } else {
                    items(get(table, kind))
                };
                let new_list = if kind == "keys" {
                    items(get(new_record, "keys"))
                } else {
                    items(get(fresh_table, kind))
                };
                let list = if kind == "keys" || successor.is_none() {
                    old_list
                } else {
                    new_list
                };
                charge(
                    ctx,
                    list.len()
                        .saturating_add(old_list.len())
                        .saturating_add(new_list.len()),
                    "",
                )?;
                let index = list
                    .iter()
                    .position(|x| get(x, "id") == get(item, "id"))
                    .map(|x| x as isize)
                    .unwrap_or(-1);
                let base_path = if kind == "keys" {
                    format!("/modules/{mi}/elements/{record_index}/keys/{index}")
                } else {
                    format!("/modules/{mi}/extensions/umf.tables/tables/{ti}/{kind}/{index}")
                };
                let old_index = old_list
                    .iter()
                    .position(|x| get(x, "id") == get(item, "id"))
                    .unwrap_or(0);
                let new_index = successor.and_then(|fresh_item| {
                    new_list
                        .iter()
                        .position(|x| get(x, "id") == get(fresh_item, "id"))
                });
                let old_path = if kind == "keys" {
                    format!("/modules/{mi}/elements/{record_index}/keys/{old_index}")
                } else {
                    format!("/modules/{mi}/extensions/umf.tables/tables/{ti}/{kind}/{old_index}")
                };
                let new_path = new_index.map(|new_index| {
                    if kind == "keys" {
                        format!("/modules/{mi}/elements/{record_index}/keys/{new_index}")
                    } else {
                        format!(
                            "/modules/{mi}/extensions/umf.tables/tables/{ti}/{kind}/{new_index}"
                        )
                    }
                });
                let old_domain = if domain_aware && kind == "checks" {
                    domain_column(previous, item, ctx)?
                } else {
                    None
                };
                let new_domain = if domain_aware && kind == "checks" {
                    match successor {
                        Some(fresh_item) => domain_column(next, fresh_item, ctx)?,
                        None => None,
                    }
                } else {
                    None
                };
                let path = new_domain
                    .or(old_domain)
                    .and_then(|column| text(get(column, "sourcePath").unwrap_or(&Value::Null)))
                    .map(|path| format!("{path}/domain"))
                    .unwrap_or(base_path);
                let old_logical = old_list
                    .iter()
                    .find(|x| get(x, "id") == get(item, "id"))
                    .unwrap_or(&&Value::Null);
                let new_logical = new_list
                    .iter()
                    .find(|x| get(x, "id") == get(item, "id"))
                    .unwrap_or(&&Value::Null);
                let old_value = if let Some(column) = old_domain {
                    domain_meaning(previous, &old_doc, table, item, column, ctx)?
                } else {
                    object(vec![
                        ("physical", cp(item, ctx)?),
                        ("logical", cp(old_logical, ctx)?),
                    ])
                };
                let new_value = if let Some(column) = new_domain {
                    domain_meaning(next, &new_doc, fresh_table, successor.unwrap(), column, ctx)?
                } else if let Some(fresh_item) = successor {
                    object(vec![
                        ("physical", cp(fresh_item, ctx)?),
                        ("logical", cp(new_logical, ctx)?),
                    ])
                } else {
                    Value::Null
                };
                if domain_aware {
                    add_with_source_paths(
                        &mut out,
                        reviewed_kind(kind),
                        &path,
                        old_value,
                        new_value,
                        Some(&old_path),
                        new_path.as_deref(),
                        ctx,
                    )?;
                } else {
                    add(
                        &mut out,
                        reviewed_kind(kind),
                        &path,
                        old_value,
                        new_value,
                        ctx,
                    )?;
                }
            }
        }
        for audience in ["person", "batch"] {
            for command in ["select", "insert", "update", "delete"] {
                let before = v(v(v(table, "policy"), audience), command);
                let after = v(v(v(fresh_table, "policy"), audience), command);
                if !eq(before, after, ctx)? {
                    let path=format!("/modules/{mi}/extensions/umf.tables/tables/{ti}/policy/{audience}/{command}");
                    add(
                        &mut out,
                        "change-policy",
                        &path,
                        cp(before, ctx)?,
                        cp(after, ctx)?,
                        ctx,
                    )?;
                }
            }
        }
    }
    Ok(out)
}

/// G03 default changes are opt-in under discovery selector 0.2 and later.
/// Logical-only defaults are deliberately omitted because native storage is
/// authoritative for omission behavior.
pub(super) fn discover_default_changes(
    previous: &Value,
    next: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let old_doc = source_document(previous, ctx)?;
    let new_doc = source_document(next, ctx)?;
    let old_module = txt(previous, "module");
    let new_module = txt(next, "module");
    let old_tables = source_tables(&old_doc, &old_module);
    let new_tables = source_tables(&new_doc, &new_module);
    let old_columns = items(get(v(previous, "expectedCatalog"), "columns"));
    let new_columns = items(get(v(next, "expectedCatalog"), "columns"));
    let mut result = Vec::new();
    for fresh in new_columns {
        charge(ctx, 1, "/expectedCatalog/columns")?;
        let field = v(fresh, "field");
        let table = v(fresh, "table");
        let mut old = None;
        for candidate in old_columns {
            charge(ctx, 1, "/previous/expectedCatalog/columns")?;
            if get(candidate, "table") == Some(table) && get(candidate, "field") == Some(field) {
                old = Some(candidate);
                break;
            }
        }
        let Some(old) = old else {
            continue;
        };
        let (Some(old_mapping), Some(new_mapping)) = (
            find_table_column(old_tables, table, field),
            find_table_column(new_tables, table, field),
        ) else {
            continue;
        };
        let old_field = logical_field(&old_doc, field).unwrap_or(&Value::Null);
        let new_field = logical_field(&new_doc, field).unwrap_or(&Value::Null);
        let old_native = presence(get(old_mapping, "default"));
        let new_native = presence(get(new_mapping, "default"));
        let old_logical = presence(get(old_field, "default"));
        let new_logical = presence(get(new_field, "default"));
        if eq(&old_native, &new_native, ctx)? {
            continue;
        }
        let table_id = get(fresh, "table").cloned().unwrap_or(Value::Null);
        let old_value = object(vec![
            (
                "target",
                object(vec![
                    ("table", cp(&table_id, ctx)?),
                    ("field", cp(field, ctx)?),
                ]),
            ),
            ("physicalExpectation", cp(old, ctx)?),
            ("logicalField", cp(old_field, ctx)?),
            ("nativeMapping", cp(old_mapping, ctx)?),
            ("nativeDefault", old_native),
            ("logicalDefault", old_logical),
        ]);
        let new_value = object(vec![
            (
                "target",
                object(vec![
                    ("table", cp(&table_id, ctx)?),
                    ("field", cp(field, ctx)?),
                ]),
            ),
            ("physicalExpectation", cp(fresh, ctx)?),
            ("logicalField", cp(new_field, ctx)?),
            ("nativeMapping", cp(new_mapping, ctx)?),
            ("nativeDefault", new_native),
            ("logicalDefault", new_logical),
        ]);
        let Some(path) = text(get(fresh, "sourcePath").unwrap_or(&Value::Null)) else {
            return Err(error(
                "MIGRATION_CHANGES_FAILED",
                "/expectedCatalog/columns/sourcePath",
                "Default transition requires its exact source path",
            ));
        };
        let path = format!("{path}/default");
        let kind = "change-default";
        let old_digest = digest(&old_value, ctx)?;
        let new_digest = digest(&new_value, ctx)?;
        let id_hash = crate::canonical::canonical_sha256_admitted(
            &array(vec![
                s(kind),
                s(&path),
                cp(&old_digest, ctx)?,
                cp(&new_digest, ctx)?,
            ]),
            ctx,
        )?;
        let id = format!("review-{}", &hex(&id_hash)[..24]);
        charge(
            ctx,
            path.len().saturating_add(id.len()).saturating_add(512),
            &path,
        )?;
        result.push(object(vec![
            ("id", s(&id)),
            ("kind", s(kind)),
            ("path", s(&path)),
            ("oldDigest", old_digest),
            ("newDigest", new_digest),
            ("oldValue", old_value),
            ("newValue", new_value),
        ]));
    }
    Ok(result)
}

/// G03 operation-context candidates are emitted only for retained operations
/// whose bytes/configuration source context changed while their operation
/// value itself stayed the same. The source digest remains tied to each exact
/// retained source archive, matching the public selector 0.3 contract.
pub(super) fn discover_operation_context_changes(
    previous: &Value,
    next: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    #[derive(Clone)]
    struct Entry<'a> {
        module: &'a Value,
        module_index: usize,
        operation_index: usize,
        operation: &'a Value,
    }
    fn entries<'a>(doc: &'a Value, ctx: &mut Context<'_>) -> Result<Vec<Entry<'a>>, EngineError> {
        let mut out = Vec::new();
        for (module_index, module) in items(get(doc, "modules")).iter().enumerate() {
            let payload = get(
                get(module, "extensions").unwrap_or(&Value::Null),
                "umf.tables",
            )
            .unwrap_or(&Value::Null);
            for (operation_index, operation) in items(get(payload, "commands")).iter().enumerate() {
                charge(ctx, 1, "/modules/extensions/umf.tables/commands")?;
                out.push(Entry {
                    module,
                    module_index,
                    operation_index,
                    operation,
                });
            }
        }
        Ok(out)
    }
    fn identity(entry: &Entry<'_>) -> Option<(String, String)> {
        let module = text(get(entry.module, "id")?)?;
        let id = text(get(entry.operation, "id")?)?;
        (!id.is_empty()).then_some((module, id))
    }
    fn by_identity<'a>(
        rows: &'a [Entry<'a>],
        ctx: &mut Context<'_>,
    ) -> Result<std::collections::BTreeMap<(String, String), &'a Entry<'a>>, EngineError> {
        let mut out = std::collections::BTreeMap::new();
        for entry in rows {
            charge_tree(entry.module, ctx)?;
            charge_tree(entry.operation, ctx)?;
            charge(ctx, 1, "/modules/extensions/umf.tables/commands")?;
            let Some(key) = identity(entry) else { continue };
            if out.insert(key, entry).is_some() {
                return Err(error(
                    "TABLE_MIGRATION_OPTIONS",
                    "/modules/extensions/umf.tables/commands",
                    "Duplicate operation identity prevents unambiguous source correspondence",
                ));
            }
        }
        Ok(out)
    }
    fn context_value(
        bundle: &Value,
        source_digest: &Value,
        module: &Value,
        operation: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        Ok(object(vec![
            ("version", s("umf.table-operation-source-context/0.1")),
            (
                "source",
                object(vec![
                    ("format", cp(v(v(bundle, "source"), "format"), ctx)?),
                    ("sha256", cp(source_digest, ctx)?),
                ]),
            ),
            ("configuration", cp(v(bundle, "configuration"), ctx)?),
            ("module", cp(module, ctx)?),
            ("operation", cp(operation, ctx)?),
        ]))
    }
    let old_doc = source_document(previous, ctx)?;
    let new_doc = source_document(next, ctx)?;
    let old_entries = entries(&old_doc, ctx)?;
    let new_entries = entries(&new_doc, ctx)?;
    let old_by = by_identity(&old_entries, ctx)?;
    let new_by = by_identity(&new_entries, ctx)?;
    let old_source = v(v(previous, "source"), "utf8");
    let new_source = v(v(next, "source"), "utf8");
    let old_sha = s(&hex(&crate::canonical::sha256_source_text(
        match old_source {
            Value::String(text) => text,
            _ => {
                return Err(error(
                    "TABLE_MIGRATION_OPTIONS",
                    "/previous/source/utf8",
                    "Retained source text is invalid",
                ))
            }
        },
        ctx,
    )?));
    let new_sha = s(&hex(&crate::canonical::sha256_source_text(
        match new_source {
            Value::String(text) => text,
            _ => {
                return Err(error(
                    "TABLE_MIGRATION_OPTIONS",
                    "/next/source/utf8",
                    "Retained source text is invalid",
                ))
            }
        },
        ctx,
    )?));
    let mut identities = std::collections::BTreeSet::new();
    identities.extend(old_by.keys().cloned());
    identities.extend(new_by.keys().cloned());
    let mut out = Vec::new();
    for key in identities {
        charge(ctx, 1, "/modules/extensions/umf.tables/commands")?;
        let old = old_by.get(&key).copied();
        let new = new_by.get(&key).copied();
        let old_path = old.map(|entry| {
            format!(
                "/modules/{}/extensions/umf.tables/commands/{}",
                entry.module_index, entry.operation_index
            )
        });
        let new_path = new.map(|entry| {
            format!(
                "/modules/{}/extensions/umf.tables/commands/{}",
                entry.module_index, entry.operation_index
            )
        });
        let path = new_path
            .as_deref()
            .or(old_path.as_deref())
            .unwrap_or("/modules/extensions/umf.tables/commands");
        let unchanged = match (old, new) {
            (Some(before), Some(after)) => eq(before.operation, after.operation, ctx)?,
            _ => false,
        };
        if !unchanged {
            let before = match old {
                Some(entry) => cp(entry.operation, ctx)?,
                None => Value::Null,
            };
            let after = match new {
                Some(entry) => cp(entry.operation, ctx)?,
                None => Value::Null,
            };
            add_with_source_paths(
                &mut out,
                "change-operation",
                path,
                before,
                after,
                old_path.as_deref(),
                new_path.as_deref(),
                ctx,
            )?;
            continue;
        }
        let (Some(old), Some(new)) = (old, new) else {
            continue;
        };
        let old_module_id = get(old.module, "id").unwrap_or(&Value::Null);
        let new_module_id = get(new.module, "id").unwrap_or(&Value::Null);
        let old_context = context_value(previous, &old_sha, old_module_id, old.operation, ctx)?;
        let new_context = context_value(next, &new_sha, new_module_id, new.operation, ctx)?;
        if eq(&old_context, &new_context, ctx)? {
            continue;
        }
        add_with_source_paths(
            &mut out,
            "change-operation-context",
            path,
            old_context,
            new_context,
            old_path.as_deref(),
            new_path.as_deref(),
            ctx,
        )?;
    }
    Ok(out)
}

/// Selector 0.3 admits newly added check/key/index/foreign-key declarations.
/// Their values are source-bound and carry both candidate paths so reviewers
/// can attach an exact marker before a later compiler accepts the change.
pub(super) fn discover_added_constraints(
    previous: &Value,
    next: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let doc = source_document(next, ctx)?;
    let previous_tables = items(get(v(previous, "expectedCatalog"), "tables"));
    let next_tables = items(get(v(next, "expectedCatalog"), "tables"));
    let module_index = items(get(&doc, "modules"))
        .iter()
        .position(|module| get(module, "id") == get(next, "module"))
        .unwrap_or(0);
    let mut out = Vec::new();
    for (table_index, table) in next_tables.iter().enumerate() {
        charge(
            ctx,
            previous_tables.len().saturating_add(1),
            "/expectedCatalog/tables",
        )?;
        let table_id = v(table, "id");
        let record = v(table, "record");
        let record_module = txt(record, "module");
        let record_element = txt(record, "element");
        let module_value = module(&doc, &record_module).unwrap_or(&Value::Null);
        let record_index = items(get(module_value, "elements"))
            .iter()
            .position(|element| {
                text(get(element, "id").unwrap_or(&Value::Null)).as_deref()
                    == Some(record_element.as_str())
            })
            .unwrap_or(0);
        let logical_record = items(get(module_value, "elements"))
            .get(record_index)
            .unwrap_or(&Value::Null);
        for kind in ["checks", "foreignKeys", "indexes", "keys"] {
            let fresh_items = items(get(v(next, "expectedCatalog"), kind));
            let old_items = items(get(v(previous, "expectedCatalog"), kind));
            for fresh in fresh_items
                .iter()
                .filter(|item| get(item, "table") == Some(table_id))
            {
                charge(ctx, old_items.len().saturating_add(1), "/expectedCatalog")?;
                if old_items.iter().any(|old| {
                    get(old, "table") == Some(table_id) && get(old, "id") == get(fresh, "id")
                }) {
                    continue;
                }
                let list = if kind == "keys" {
                    items(get(logical_record, "keys"))
                } else {
                    items(get(table, kind))
                };
                let item_index = if kind == "keys" {
                    list.iter()
                        .position(|item| get(item, "id") == get(fresh, "id"))
                        .unwrap_or(0)
                } else {
                    list.iter()
                        .position(|item| get(item, "id") == get(fresh, "id"))
                        .unwrap_or(0)
                };
                let ordinary_path = if kind == "keys" {
                    format!("/modules/{module_index}/elements/{record_index}/keys/{item_index}")
                } else {
                    format!("/modules/{module_index}/extensions/umf.tables/tables/{table_index}/{kind}/{item_index}")
                };
                let domain_column = if kind == "checks" {
                    text(get(fresh, "id").unwrap_or(&Value::Null))
                        .filter(|id| id.starts_with("domain:"))
                        .and_then(|id| {
                            let ref_text = id.strip_prefix("domain:")?;
                            items(get(v(next, "expectedCatalog"), "columns"))
                                .iter()
                                .find(|column| {
                                    get(column, "table") == Some(table_id)
                                        && format!(
                                            "{}.{}",
                                            txt(v(column, "field"), "module"),
                                            txt(v(column, "field"), "element")
                                        ) == ref_text
                                })
                        })
                } else {
                    None
                };
                let path = domain_column
                    .and_then(|column| text(get(column, "sourcePath").unwrap_or(&Value::Null)))
                    .map(|source| format!("{source}/domain"))
                    .unwrap_or(ordinary_path);
                let reviewed_kind = match kind {
                    "checks" => "replace-check",
                    "foreignKeys" => "replace-foreign-key",
                    "indexes" => "replace-index",
                    _ => "replace-primary-key",
                };
                let logical = if kind == "keys" {
                    items(get(logical_record, "keys"))
                        .iter()
                        .find(|item| get(item, "id") == get(fresh, "id"))
                } else {
                    list.iter().find(|item| get(item, "id") == get(fresh, "id"))
                };
                let meaning = if let Some(column) = domain_column {
                    let field = v(column, "field");
                    let field_doc = logical_field(&doc, field).unwrap_or(&Value::Null);
                    let mapping = items(get(table, "columns"))
                        .iter()
                        .find(|mapping| field_key(mapping) == field_key(column))
                        .unwrap_or(&Value::Null);
                    object(vec![
                        ("physical", cp(fresh, ctx)?),
                        (
                            "logical",
                            object(vec![
                                ("column", cp(mapping, ctx)?),
                                ("field", cp(field_doc, ctx)?),
                            ]),
                        ),
                    ])
                } else {
                    object(vec![
                        ("physical", cp(fresh, ctx)?),
                        ("logical", cp(logical.unwrap_or(&Value::Null), ctx)?),
                    ])
                };
                add_with_source_paths(
                    &mut out,
                    reviewed_kind,
                    &path,
                    Value::Null,
                    meaning,
                    None,
                    Some(&path),
                    ctx,
                )?;
            }
        }
    }
    Ok(out)
}

/// Build source-bound G04 conversion-effect candidates for the public recipe
/// set. This is discovery only; it never prepares or executes a converter.
pub(super) fn discover_g04_conversions(
    previous: &Value,
    next: &Value,
    intents: &[Value],
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    fn find_column<'a>(
        bundle: &'a Value,
        table_id: &Value,
        field: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Option<&'a Value>, EngineError> {
        let columns = items(get(v(bundle, "expectedCatalog"), "columns"));
        charge(ctx, columns.len(), "/expectedCatalog/columns")?;
        Ok(columns.iter().find(|column| {
            get(column, "table") == Some(table_id) && ref_key(v(column, "field")) == ref_key(field)
        }))
    }
    fn find_logical_field<'a>(
        doc: &'a Value,
        module_id: &str,
        element_id: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Option<&'a Value>, EngineError> {
        let Some(module) = module(doc, module_id) else {
            return Ok(None);
        };
        let elements = items(get(module, "elements"));
        charge(
            ctx,
            elements.len().saturating_add(1),
            "/source/modules/elements",
        )?;
        Ok(elements.iter().find(|element| {
            get(element, "id") == Some(element_id)
                && text(get(element, "kind").unwrap_or(&Value::Null)).as_deref() == Some("field")
        }))
    }
    let old_doc = source_document(previous, ctx)?;
    let new_doc = source_document(next, ctx)?;
    let old_source = v(previous, "source");
    let new_source = v(next, "source");
    let old_text = v(old_source, "utf8");
    let new_text = v(new_source, "utf8");
    let (Value::String(old_text), Value::String(new_text)) = (old_text, new_text) else {
        return Err(error(
            "TABLE_MIGRATION_OPTIONS",
            "/previous/source/utf8",
            "G04 requires exact retained source text",
        ));
    };
    let old_sha = s(&hex(&crate::canonical::sha256_source_text(old_text, ctx)?));
    let new_sha = s(&hex(&crate::canonical::sha256_source_text(new_text, ctx)?));
    let mut seen = std::collections::BTreeSet::new();
    let mut out = Vec::new();
    for (intent_index, intent) in intents.iter().enumerate() {
        charge_tree(intent, ctx)?;
        let path = format!("/selector/conversionIntents/{intent_index}");
        let Some(Value::String(kind)) = get(v(intent, "recipe"), "kind") else {
            return Err(error(
                "MIGRATION_CHANGES_FAILED",
                &format!("{path}/recipe/kind"),
                "Conversion recipe kind is invalid",
            ));
        };
        let kind = kind.to_utf8().map_err(|_| {
            error(
                "MIGRATION_CHANGES_FAILED",
                &format!("{path}/recipe/kind"),
                "Conversion recipe kind is invalid",
            )
        })?;
        let table_id = get(intent, "table").and_then(text).ok_or_else(|| {
            error(
                "MIGRATION_CHANGES_FAILED",
                &path,
                "Conversion table is invalid",
            )
        })?;
        let field_ref = get(intent, "field").ok_or_else(|| {
            error(
                "MIGRATION_CHANGES_FAILED",
                &path,
                "Conversion Field is invalid",
            )
        })?;
        let module_id = get(field_ref, "module").and_then(text).ok_or_else(|| {
            error(
                "MIGRATION_CHANGES_FAILED",
                &format!("{path}/field/module"),
                "Module identity is invalid",
            )
        })?;
        let element_id = get(field_ref, "element").and_then(text).ok_or_else(|| {
            error(
                "MIGRATION_CHANGES_FAILED",
                &format!("{path}/field/element"),
                "Field identity is invalid",
            )
        })?;
        let identity = (table_id.clone(), module_id.clone(), element_id.clone());
        if !seen.insert(identity) {
            return Err(error(
                "MIGRATION_CHANGES_FAILED",
                &path,
                "Duplicate conversion selection",
            ));
        }
        let element_value = s(&element_id);
        let target_table = s(&table_id);
        let field = object(vec![("module", s(&module_id)), ("element", s(&element_id))]);
        let old_tables = items(get(v(previous, "expectedCatalog"), "tables"));
        let new_tables = items(get(v(next, "expectedCatalog"), "tables"));
        charge(
            ctx,
            old_tables.len().saturating_add(new_tables.len()),
            "/expectedCatalog/tables",
        )?;
        let old_table = old_tables
            .iter()
            .find(|table| get(table, "id") == Some(&target_table))
            .ok_or_else(|| {
                error(
                    "MIGRATION_CHANGES_FAILED",
                    &path,
                    "Previous table is missing",
                )
            })?;
        let new_table = new_tables
            .iter()
            .find(|table| get(table, "id") == Some(&target_table))
            .ok_or_else(|| error("MIGRATION_CHANGES_FAILED", &path, "Next table is missing"))?;
        let old_column = find_column(previous, &target_table, &field, ctx)?.ok_or_else(|| {
            error(
                "MIGRATION_CHANGES_FAILED",
                &path,
                "Previous column binding is missing",
            )
        })?;
        let new_column = find_column(next, &target_table, &field, ctx)?.ok_or_else(|| {
            error(
                "MIGRATION_CHANGES_FAILED",
                &path,
                "Next column binding is missing",
            )
        })?;
        let old_mappings = items(get(old_table, "columns"));
        charge(ctx, old_mappings.len(), "/expectedCatalog/tables/columns")?;
        let old_mapping = old_mappings
            .iter()
            .find(|mapping| ref_key(v(mapping, "field")) == ref_key(&field))
            .ok_or_else(|| {
                error(
                    "MIGRATION_CHANGES_FAILED",
                    &path,
                    "Previous native mapping is missing",
                )
            })?;
        let new_mappings = items(get(new_table, "columns"));
        charge(ctx, new_mappings.len(), "/expectedCatalog/tables/columns")?;
        let new_mapping = new_mappings
            .iter()
            .find(|mapping| ref_key(v(mapping, "field")) == ref_key(&field))
            .ok_or_else(|| {
                error(
                    "MIGRATION_CHANGES_FAILED",
                    &path,
                    "Next native mapping is missing",
                )
            })?;
        let old_logical = find_logical_field(&old_doc, &module_id, &element_value, ctx)?
            .ok_or_else(|| {
                error(
                    "MIGRATION_CHANGES_FAILED",
                    &path,
                    "Previous logical Field is missing",
                )
            })?;
        let new_logical = find_logical_field(&new_doc, &module_id, &element_value, ctx)?
            .ok_or_else(|| {
                error(
                    "MIGRATION_CHANGES_FAILED",
                    &path,
                    "Next logical Field is missing",
                )
            })?;
        let old_scalar = text(get(old_logical, "scalarType").unwrap_or(&Value::Null));
        let new_scalar = text(get(new_logical, "scalarType").unwrap_or(&Value::Null));
        let native_kind = |mapping: &Value| {
            text(
                get(get(mapping, "nativeType").unwrap_or(&Value::Null), "kind")
                    .unwrap_or(&Value::Null),
            )
        };
        let native_matches = |logical: Option<&str>, native: Option<&str>| match logical {
            Some("integer") => matches!(native, Some("int2" | "int4" | "int8")),
            Some("decimal") => native == Some("numeric"),
            Some("string") => matches!(native, Some("text" | "varchar")),
            Some("date") => native == Some("date"),
            Some("timestamp") => native == Some("timestamptz"),
            Some("uuid") => native == Some("uuid"),
            Some("boolean") => native == Some("boolean"),
            _ => false,
        };
        let old_native_kind = native_kind(old_mapping);
        let new_native_kind = native_kind(new_mapping);
        let old_domain = old_scalar.as_deref();
        let new_domain = new_scalar.as_deref();
        let pair_matches = match kind.as_str() {
            "numeric-exact" => {
                matches!(old_domain, Some("integer" | "decimal"))
                    && matches!(new_domain, Some("integer" | "decimal"))
            }
            "numeric-rescale" => old_domain == Some("decimal") && new_domain == Some("decimal"),
            "text-date" => old_domain == Some("string") && new_domain == Some("date"),
            "date-text" => old_domain == Some("date") && new_domain == Some("string"),
            "text-instant" => old_domain == Some("string") && new_domain == Some("timestamp"),
            "instant-text" => old_domain == Some("timestamp") && new_domain == Some("string"),
            "date-instant" => old_domain == Some("date") && new_domain == Some("timestamp"),
            "instant-date" => old_domain == Some("timestamp") && new_domain == Some("date"),
            "text-uuid" => old_domain == Some("string") && new_domain == Some("uuid"),
            "uuid-text" => old_domain == Some("uuid") && new_domain == Some("string"),
            "text-boolean" => old_domain == Some("string") && new_domain == Some("boolean"),
            "boolean-text" => old_domain == Some("boolean") && new_domain == Some("string"),
            _ => false,
        };
        let rescale_scale_is_safe = if kind == "numeric-rescale" {
            matches!(
                get(get(new_logical, "facets").unwrap_or(&Value::Null), "scale"),
                Some(Value::Number(scale))
                    if scale.is_finite() && scale.fract() == 0.0 && scale.abs() <= 9_007_199_254_740_991.0
            )
        } else {
            true
        };
        let mut old_logical_meaning = cp(old_logical, ctx)?;
        let mut new_logical_meaning = cp(new_logical, ctx)?;
        let remove_type_facets = |value: &mut Value| {
            if let Value::Object(fields) = value {
                fields.retain(|(key, _)| {
                    key != &Utf16::from("scalarType") && key != &Utf16::from("facets")
                });
            }
        };
        remove_type_facets(&mut old_logical_meaning);
        remove_type_facets(&mut new_logical_meaning);
        let mut old_mapping_meaning = cp(old_mapping, ctx)?;
        let mut new_mapping_meaning = cp(new_mapping, ctx)?;
        let remove_native = |value: &mut Value| {
            if let Value::Object(fields) = value {
                fields.retain(|(key, _)| {
                    key != &Utf16::from("nativeType") && key != &Utf16::from("sourcePath")
                });
            }
        };
        remove_native(&mut old_mapping_meaning);
        remove_native(&mut new_mapping_meaning);
        if !pair_matches
            || !native_matches(old_domain, old_native_kind.as_deref())
            || !native_matches(new_domain, new_native_kind.as_deref())
            || !rescale_scale_is_safe
            || eq(&old_logical_meaning, &new_logical_meaning, ctx)? == false
            || eq(&old_mapping_meaning, &new_mapping_meaning, ctx)? == false
            || get(old_column, "nullable") != get(new_column, "nullable")
            || get(old_mapping, "generated").is_some_and(|value| value == &Value::Bool(true))
            || get(new_mapping, "generated").is_some_and(|value| value == &Value::Bool(true))
            || get(old_mapping, "immutable").is_some_and(|value| value == &Value::Bool(true))
            || get(new_mapping, "immutable").is_some_and(|value| value == &Value::Bool(true))
        {
            return Err(error(
                "MIGRATION_CHANGES_FAILED",
                &path,
                "Conversion intent does not bind a supported source and target domain",
            ));
        }
        let old_native = get(
            get(old_mapping, "nativeType").unwrap_or(&Value::Null),
            "kind",
        );
        let new_native = get(
            get(new_mapping, "nativeType").unwrap_or(&Value::Null),
            "kind",
        );
        if old_native == new_native
            && get(old_column, "typeSchema") == get(new_column, "typeSchema")
            && get(old_column, "typeName") == get(new_column, "typeName")
            && get(old_column, "typeMod") == get(new_column, "typeMod")
            && get(old_logical, "scalarType") == get(new_logical, "scalarType")
        {
            return Err(error(
                "MIGRATION_CHANGES_FAILED",
                &path,
                "Conversion intent must select an actual native type change",
            ));
        }
        let mut effects = vec![s("original-representation-replaced")];
        match kind.as_str() {
            "numeric-exact" if old_domain == Some("decimal") || new_domain == Some("decimal") => {
                effects.push(s("lexical-scale-not-promised"));
            }
            "numeric-rescale" => effects.push(s("numeric-quantization")),
            "text-instant" => effects.push(s("lexical-offset-and-fraction-spelling")),
            "instant-date"
                if matches!(
                    text(
                        get(
                            get(v(intent, "recipe"), "parameters").unwrap_or(&Value::Null),
                            "time"
                        )
                        .unwrap_or(&Value::Null)
                    )
                    .as_deref(),
                    Some("discard")
                ) =>
            {
                effects.push(s("time-component"));
            }
            "date-instant" => effects.push(s("utc-midnight-assignment")),
            "date-text" | "instant-text" | "uuid-text" => {
                effects.push(s("canonical-text-spelling"));
            }
            "text-boolean" | "boolean-text" => {
                effects.push(s("explicit-boolean-token-mapping"));
            }
            _ => {}
        }
        let old_meaning = object(vec![
            ("version", s("umf.field-conversion-review/0.1")),
            ("side", s("previous")),
            (
                "source",
                object(vec![
                    (
                        "format",
                        cp(get(old_source, "format").unwrap_or(&Value::Null), ctx)?,
                    ),
                    ("sha256", cp(&old_sha, ctx)?),
                ]),
            ),
            ("configuration", cp(v(previous, "configuration"), ctx)?),
            ("table", cp(&target_table, ctx)?),
            ("field", cp(&field, ctx)?),
            (
                "meaning",
                object(vec![
                    ("physical", cp(old_column, ctx)?),
                    ("logical", cp(old_logical, ctx)?),
                    ("mapping", cp(old_mapping, ctx)?),
                ]),
            ),
            ("conversionIntent", cp(intent, ctx)?),
            ("effects", array(effects.clone())),
        ]);
        let new_meaning = object(vec![
            ("version", s("umf.field-conversion-review/0.1")),
            ("side", s("next")),
            (
                "source",
                object(vec![
                    (
                        "format",
                        cp(get(new_source, "format").unwrap_or(&Value::Null), ctx)?,
                    ),
                    ("sha256", cp(&new_sha, ctx)?),
                ]),
            ),
            ("configuration", cp(v(next, "configuration"), ctx)?),
            ("table", cp(&target_table, ctx)?),
            ("field", cp(&field, ctx)?),
            (
                "meaning",
                object(vec![
                    ("physical", cp(new_column, ctx)?),
                    ("logical", cp(new_logical, ctx)?),
                    ("mapping", cp(new_mapping, ctx)?),
                ]),
            ),
            ("conversionIntent", cp(intent, ctx)?),
            ("effects", array(effects)),
        ]);
        let marker_path =
            text(get(new_column, "sourcePath").unwrap_or(&Value::Null)).ok_or_else(|| {
                error(
                    "MIGRATION_CHANGES_FAILED",
                    &path,
                    "Conversion target has no source path",
                )
            })?;
        let kind = "conversion-effects";
        let old_digest = digest(&old_meaning, ctx)?;
        let new_digest = digest(&new_meaning, ctx)?;
        charge(ctx, marker_path.len().saturating_add(512), &marker_path)?;
        let hash = crate::canonical::canonical_sha256_admitted(
            &array(vec![
                s(kind),
                s(&marker_path),
                cp(&old_digest, ctx)?,
                cp(&new_digest, ctx)?,
            ]),
            ctx,
        )?;
        out.push(object(vec![
            ("id", s(&format!("review-{}", &hex(&hash)[..24]))),
            ("kind", s(kind)),
            ("path", s(&marker_path)),
            ("oldDigest", old_digest),
            ("newDigest", new_digest),
            ("oldValue", old_meaning),
            ("newValue", new_meaning),
        ]));
    }
    Ok(out)
}

fn add_with_source_paths(
    out: &mut Vec<Value>,
    kind: &str,
    path: &str,
    old: Value,
    new: Value,
    old_path: Option<&str>,
    new_path: Option<&str>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if eq(&old, &new, ctx)? {
        return Ok(());
    }
    let old_digest = digest(&old, ctx)?;
    let new_digest = digest(&new, ctx)?;
    charge(
        ctx,
        path.len()
            .saturating_add(old_path.map_or(0, str::len))
            .saturating_add(new_path.map_or(0, str::len))
            .saturating_add(512),
        path,
    )?;
    let hash = crate::canonical::canonical_sha256_admitted(
        &array(vec![
            s(kind),
            s(path),
            cp(&old_digest, ctx)?,
            cp(&new_digest, ctx)?,
        ]),
        ctx,
    )?;
    let mut candidate = vec![
        ("id", s(&format!("review-{}", &hex(&hash)[..24]))),
        ("kind", s(kind)),
        ("path", s(path)),
        ("oldDigest", old_digest),
        ("newDigest", new_digest),
        ("oldValue", old),
        ("newValue", new),
    ];
    candidate.push(("oldPath", old_path.map(s).unwrap_or(Value::Null)));
    candidate.push(("newPath", new_path.map(s).unwrap_or(Value::Null)));
    out.try_reserve(1)
        .map_err(|_| error("LIMIT", path, "Migration candidate allocation refused"))?;
    out.push(object(candidate));
    Ok(())
}

fn presence(value: Option<&Value>) -> Value {
    object(vec![
        ("present", Value::Bool(value.is_some())),
        ("value", value.cloned().unwrap_or(Value::Null)),
    ])
}

fn domain_column<'a>(
    bundle: &'a Value,
    check: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    charge_tree(check, ctx)?;
    let Some(id) = text(get(check, "id").unwrap_or(&Value::Null)) else {
        return Ok(None);
    };
    let Some(ref_id) = id.strip_prefix("domain:") else {
        return Ok(None);
    };
    let table = get(check, "table");
    for column in items(get(v(bundle, "expectedCatalog"), "columns")) {
        charge_tree(column, ctx)?;
        charge(ctx, 1, "/expectedCatalog/columns")?;
        if get(column, "table") != table {
            continue;
        }
        let field = v(column, "field");
        let identity = format!("{}.{}", txt(field, "module"), txt(field, "element"));
        if identity == ref_id {
            return Ok(Some(column));
        }
    }
    Ok(None)
}

fn domain_meaning(
    bundle: &Value,
    document: &Value,
    table: &Value,
    physical: &Value,
    column: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let field_ref = v(column, "field");
    let mapping = items(get(table, "columns"))
        .iter()
        .find(|mapping| field_key(mapping) == field_key(column))
        .unwrap_or(&Value::Null);
    let field = logical_field(document, field_ref).unwrap_or(&Value::Null);
    let _ = bundle; // The exact catalog table was already source-recompiled by the caller.
    Ok(object(vec![
        ("physical", cp(physical, ctx)?),
        (
            "logical",
            object(vec![
                ("column", cp(mapping, ctx)?),
                ("field", cp(field, ctx)?),
            ]),
        ),
    ]))
}

fn source_tables<'a>(doc: &'a Value, module_id: &str) -> &'a [Value] {
    let Some(module) = module(doc, module_id) else {
        return &[];
    };
    items(get(
        get(v(module, "extensions"), "umf.tables").unwrap_or(&Value::Null),
        "tables",
    ))
}

fn find_table_column<'a>(
    tables: &'a [Value],
    table_id: &Value,
    field: &Value,
) -> Option<&'a Value> {
    let table = tables
        .iter()
        .find(|table| get(table, "id") == Some(table_id))?;
    items(get(table, "columns"))
        .iter()
        .find(|column| get(column, "field") == Some(field))
}

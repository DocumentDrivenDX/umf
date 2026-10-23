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
                if eq(item, successor.unwrap_or(&Value::Null), ctx)? {
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
                let path = if kind == "keys" {
                    format!("/modules/{mi}/elements/{record_index}/keys/{index}")
                } else {
                    format!("/modules/{mi}/extensions/umf.tables/tables/{ti}/{kind}/{index}")
                };
                let old_logical = old_list
                    .iter()
                    .find(|x| get(x, "id") == get(item, "id"))
                    .unwrap_or(&&Value::Null);
                let new_logical = new_list
                    .iter()
                    .find(|x| get(x, "id") == get(item, "id"))
                    .unwrap_or(&&Value::Null);
                let old_value = object(vec![
                    ("physical", cp(item, ctx)?),
                    ("logical", cp(old_logical, ctx)?),
                ]);
                let new_value = object(vec![
                    ("physical", cp(successor.unwrap_or(&Value::Null), ctx)?),
                    ("logical", cp(new_logical, ctx)?),
                ]);
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

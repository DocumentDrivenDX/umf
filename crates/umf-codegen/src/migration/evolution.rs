// SPDX-License-Identifier: MIT OR Apache-2.0
//! Source-ordered migration evolution. The retained compiler is the behavioral
//! reference; this module owns no execution, SQL parser, or host authority.
use super::*;
use std::collections::BTreeSet;

// Every input-derived scan observes the live invocation before inspecting an
// item. Text-bearing items reserve their copied/converted representation first;
// nested predicates receive the same Context and propagate terminal controls.
trait ScanItem {
    fn charge_scan(&self, ctx: &mut Context<'_>) -> Result<(), EngineError>;
}
impl ScanItem for Value {
    fn charge_scan(&self, ctx: &mut Context<'_>) -> Result<(), EngineError> {
        precharge(self, ctx)
    }
}
impl<T: ScanItem + ?Sized> ScanItem for &T {
    fn charge_scan(&self, ctx: &mut Context<'_>) -> Result<(), EngineError> {
        (*self).charge_scan(ctx)
    }
}
impl ScanItem for String {
    fn charge_scan(&self, ctx: &mut Context<'_>) -> Result<(), EngineError> {
        charge(ctx, self.len().saturating_mul(6).saturating_add(1), "")
    }
}
impl<T: ScanItem> ScanItem for Vec<T> {
    fn charge_scan(&self, ctx: &mut Context<'_>) -> Result<(), EngineError> {
        charge(ctx, self.len().saturating_add(1), "")?;
        for item in self {
            item.charge_scan(ctx)?;
        }
        Ok(())
    }
}
impl<A: ScanItem, B: ScanItem> ScanItem for (A, B) {
    fn charge_scan(&self, ctx: &mut Context<'_>) -> Result<(), EngineError> {
        self.0.charge_scan(ctx)?;
        self.1.charge_scan(ctx)
    }
}
impl<A: ScanItem, B: ScanItem, C: ScanItem> ScanItem for (A, B, C) {
    fn charge_scan(&self, ctx: &mut Context<'_>) -> Result<(), EngineError> {
        self.0.charge_scan(ctx)?;
        self.1.charge_scan(ctx)?;
        self.2.charge_scan(ctx)
    }
}
trait MigrationScan: Iterator + Sized
where
    Self::Item: ScanItem,
{
    fn metered_find(
        mut self,
        ctx: &mut Context<'_>,
        mut predicate: impl FnMut(&Self::Item, &mut Context<'_>) -> Result<bool, EngineError>,
    ) -> Result<Option<Self::Item>, EngineError> {
        for item in self.by_ref() {
            item.charge_scan(ctx)?;
            if predicate(&item, ctx)? {
                return Ok(Some(item));
            }
        }
        Ok(None)
    }
    fn metered_any(
        self,
        ctx: &mut Context<'_>,
        mut predicate: impl FnMut(Self::Item, &mut Context<'_>) -> Result<bool, EngineError>,
    ) -> Result<bool, EngineError> {
        for item in self {
            item.charge_scan(ctx)?;
            if predicate(item, ctx)? {
                return Ok(true);
            }
        }
        Ok(false)
    }
    fn metered_position(
        self,
        ctx: &mut Context<'_>,
        mut predicate: impl FnMut(Self::Item, &mut Context<'_>) -> Result<bool, EngineError>,
    ) -> Result<Option<usize>, EngineError> {
        for (index, item) in self.enumerate() {
            item.charge_scan(ctx)?;
            if predicate(item, ctx)? {
                return Ok(Some(index));
            }
        }
        Ok(None)
    }
    fn metered_filter(
        self,
        ctx: &mut Context<'_>,
        mut predicate: impl FnMut(&Self::Item, &mut Context<'_>) -> Result<bool, EngineError>,
    ) -> Result<Vec<Self::Item>, EngineError> {
        let mut result = Vec::new();
        for item in self {
            item.charge_scan(ctx)?;
            if predicate(&item, ctx)? {
                charge(ctx, 1, "")?;
                result.push(item);
            }
        }
        Ok(result)
    }
}
impl<I: Iterator> MigrationScan for I where I::Item: ScanItem {}

#[derive(Default)]
struct TableChanges {
    renames: Vec<(Value, Value)>,
    tighten: Vec<Value>,
    relax: Vec<Value>,
    types: Vec<(Value, Value)>,
    append: Vec<Value>,
    drops: Vec<Value>,
    index_drops: Vec<Value>,
    index_replace: BTreeSet<String>,
    check_drops: Vec<Value>,
    check_adds: Vec<Value>,
    fk_drops: Vec<Value>,
    fk_replace: BTreeSet<String>,
    key_drops: Vec<Value>,
    key_adds: Vec<Value>,
    policies: Vec<String>,
    grants: Vec<(String, Vec<Value>, Vec<Value>)>,
}
pub(super) struct Evolution {
    pub steps: Vec<Value>,
    pub drops: Vec<Value>,
    pub policies: Vec<String>,
}
fn v<'a>(value: &'a Value, key: &str) -> &'a Value {
    get(value, key).unwrap_or(&Value::Null)
}
fn txt(value: &Value, key: &str) -> String {
    text(v(value, key)).unwrap_or_default()
}
fn fail(message: impl AsRef<str>, path: impl AsRef<str>) -> EngineError {
    error(
        "TABLE_MIGRATION_UNSUPPORTED",
        path.as_ref(),
        message.as_ref(),
    )
}
fn destructive(message: impl AsRef<str>, path: impl AsRef<str>) -> EngineError {
    error(
        "destructive_change_unreviewed",
        path.as_ref(),
        message.as_ref(),
    )
}
fn precharge(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    match value {
        Value::String(t) => charge(ctx, t.len().saturating_mul(6).saturating_add(1), ""),
        Value::Array(a) => {
            charge(ctx, a.len().saturating_add(1), "")?;
            for x in a {
                precharge(x, ctx)?;
            }
            Ok(())
        }
        Value::Object(a) => {
            charge(ctx, a.len().saturating_add(1), "")?;
            for (k, x) in a {
                charge(ctx, k.len(), "")?;
                precharge(x, ctx)?;
            }
            Ok(())
        }
        _ => charge(ctx, 1, ""),
    }
}
fn cp(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    precharge(value, ctx)?;
    Ok(value.clone())
}
fn omit(value: &Value, keys: &[&str], ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    precharge(value, ctx)?;
    Ok(without(value, keys))
}
fn copies(values: &[&Value], ctx: &mut Context<'_>) -> Result<Vec<Value>, EngineError> {
    values.iter().map(|x| cp(x, ctx)).collect()
}
fn same_list(a: &[&Value], b: &[&Value], ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    if a.len() != b.len() {
        return Ok(false);
    }
    for (x, y) in a.iter().zip(b) {
        if !eq(x, y, ctx)? {
            return Ok(false);
        }
    }
    Ok(true)
}
fn cat<'a>(
    bundle: &'a Value,
    kind: &str,
    table: &str,
    ctx: &mut Context<'_>,
) -> Result<Vec<&'a Value>, EngineError> {
    let a = items(get(v(bundle, "expectedCatalog"), kind));
    charge(ctx, a.len(), "")?;
    Ok(a.iter()
        .metered_filter(ctx, |x, _ctx| Ok(txt(x, "table") == table))?
        .into_iter()
        .collect())
}
fn by_id<'a>(
    values: &[&'a Value],
    id: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    Ok(values
        .iter()
        .copied()
        .metered_find(ctx, |x, _ctx| Ok(get(x, "id") == Some(id)))?)
}
fn has_review(
    options: Option<&Value>,
    kind: &str,
    path: &str,
    conversion: Option<&str>,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    Ok(items(options.and_then(|x| get(x, "reviewedChanges")))
        .iter()
        .metered_any(ctx, |x, _ctx| {
            Ok(txt(x, "kind") == kind
                && txt(x, "path") == path
                && conversion.is_none_or(|c| txt(x, "conversion") == c))
        })?)
}
fn native_widen(a: &Value, b: &Value) -> bool {
    match (txt(a, "kind").as_str(), txt(b, "kind").as_str()) {
        ("int2", "int4") | ("int4", "int8") => true,
        ("numeric", "numeric") => {
            let n = |value: &Value, k: &str| {
                if let Value::Number(x) = v(value, k) {
                    *x
                } else {
                    f64::NAN
                }
            };
            let (ap, as_, bp, bs) = (
                n(a, "precision"),
                n(a, "scale"),
                n(b, "precision"),
                n(b, "scale"),
            );
            bp >= ap && bs >= as_ && bp - bs >= ap - as_
        }
        _ => false,
    }
}
fn refs_equal(a: &Value, b: &Value) -> bool {
    // Verified deployment references contain interoperable string identities.
    // Compare borrowed units instead of repeatedly allocating UTF-8 keys in
    // quadratic catalog scans.
    fn pair(v: &Value) -> Option<(&[u16], &[u16])> {
        match (get(v, "module"), get(v, "element")) {
            (Some(Value::String(m)), Some(Value::String(e))) => Some((m.units(), e.units())),
            _ => None,
        }
    }
    pair(a) == pair(b)
}
fn field_refs_equal(a: &Value, b: &Value) -> bool {
    refs_equal(v(a, "field"), v(b, "field"))
}
fn catalog_field<'a>(
    bundle: &'a Value,
    reference: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    Ok(items(get(v(bundle, "expectedCatalog"), "columns"))
        .iter()
        .metered_find(ctx, |x, _ctx| {
            Ok(get(x, "field").is_some_and(|r| refs_equal(r, reference)))
        })?)
}
fn source_module<'a>(
    doc: &'a Value,
    id: &str,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    items(get(doc, "modules"))
        .iter()
        .metered_find(ctx, |m, _ctx| Ok(txt(m, "id") == id))
}
fn source_field<'a>(
    doc: &'a Value,
    reference: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    precharge(reference, ctx)?;
    let Some(module_id) = get(reference, "module").and_then(text) else {
        return Ok(None);
    };
    let Some(module) = source_module(doc, &module_id, ctx)? else {
        return Ok(None);
    };
    Ok(items(get(module, "elements"))
        .iter()
        .metered_find(ctx, |field, _ctx| {
            Ok(get(field, "id") == get(reference, "element"))
        })?)
}
fn selected_validation(
    options: Option<&Value>,
    table: &str,
    constraint: &str,
    kind: &str,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    items(options.and_then(|value| get(value, "validations")))
        .iter()
        .metered_any(ctx, |selection, _ctx| {
            Ok(txt(selection, "table") == table
                && txt(selection, "constraint") == constraint
                && txt(selection, "kind") == kind)
        })
}
fn policy_path(mi: usize, ti: usize, a: &str, c: &str) -> String {
    format!("/modules/{mi}/extensions/umf.tables/tables/{ti}/policy/{a}/{c}")
}
fn sql_step(
    kind: &str,
    path: &str,
    args: std::fmt::Arguments<'_>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    struct Writer<'a, 'b> {
        ctx: &'a mut Context<'b>,
        text: String,
        error: Option<EngineError>,
    }
    impl std::fmt::Write for Writer<'_, '_> {
        fn write_str(&mut self, text: &str) -> std::fmt::Result {
            if let Err(error) = self.ctx.charge_work(
                text.len().saturating_add(text.encode_utf16().count()),
                Utf16::default(),
            ) {
                self.error = Some(error);
                return Err(std::fmt::Error);
            }
            self.text.push_str(text);
            Ok(())
        }
    }
    let mut writer = Writer {
        ctx,
        text: String::new(),
        error: None,
    };
    if std::fmt::write(&mut writer, args).is_err() {
        return Err(writer
            .error
            .unwrap_or_else(|| fail("SQL formatting failed", path)));
    }
    let sql = writer.text;
    charge(
        ctx,
        sql.encode_utf16()
            .count()
            .saturating_add(path.len())
            .saturating_add(64),
        path,
    )?;
    Ok(raw_step(kind, path, &sql, vec![]))
}
fn source_contains(
    value: &Value,
    reference: &Value,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    charge(ctx, 1, "")?;
    match value {
        Value::Array(a) => {
            for x in a {
                if source_contains(x, reference, ctx)? {
                    return Ok(true);
                }
            }
        }
        Value::Object(a) => {
            if eq(value, reference, ctx)? {
                return Ok(true);
            }
            for (_, x) in a {
                if source_contains(x, reference, ctx)? {
                    return Ok(true);
                }
            }
        }
        _ => {}
    }
    Ok(false)
}

pub(super) fn evolve(
    previous: &Value,
    next: &Value,
    options: Option<&Value>,
    legacy: bool,
    ctx: &mut Context<'_>,
) -> Result<Evolution, EngineError> {
    if !eq(v(previous, "configuration"), v(next, "configuration"), ctx)? {
        return Err(fail("Changing module, namespace or trusted role configuration requires a separately qualified migration","/next/configuration"));
    }
    let docs = [source_document(previous, ctx)?, source_document(next, ctx)?];
    let modules_a = items(get(&docs[0], "modules"));
    let modules_b = items(get(&docs[1], "modules"));
    if !eq(
        &omit(&docs[0], &["modules"], ctx)?,
        &omit(&docs[1], &["modules"], ctx)?,
        ctx,
    )? {
        return Err(fail(
            "Root metadata/vocabulary changes require a separately qualified migration",
            "/next/source",
        ));
    }
    if modules_a.len() != modules_b.len() {
        return Err(fail(
            "Module inventory changes are outside the append-table migration subset",
            "/next/source",
        ));
    }
    let mi = modules_a
        .iter()
        .metered_position(ctx, |x, _ctx| Ok(get(x, "id") == get(previous, "module")))?
        .ok_or_else(|| fail("The selected source module is missing", "/previous/module"))?;
    let mut appended = BTreeSet::new();
    for (i, (old, fresh)) in modules_a.iter().zip(modules_b).enumerate() {
        charge(ctx, modules_b.len().saturating_add(1), "/next/source")?;
        if get(old, "id") != get(previous, "module") {
            if !eq(old, fresh, ctx)? {
                return Err(fail(
                    "Unselected module changes require separate qualification",
                    "/next/source",
                ));
            }
            continue;
        }
        if !eq(
            &omit(old, &["elements", "relationships", "extensions"], ctx)?,
            &omit(fresh, &["elements", "relationships", "extensions"], ctx)?,
            ctx,
        )? || !eq(
            &omit(v(old, "extensions"), &["umf.tables"], ctx)?,
            &omit(v(fresh, "extensions"), &["umf.tables"], ctx)?,
            ctx,
        )? {
            return Err(fail(
                "Selected module metadata changes require separate qualification",
                "/next/source",
            ));
        }
        let oe = items(get(old, "elements"));
        let ne = items(get(fresh, "elements"));
        let or = items(get(old, "relationships"));
        let nr = items(get(fresh, "relationships"));
        if ne.len() < oe.len()
            || nr.len() < or.len()
            || !same_list(
                &or.iter().collect::<Vec<_>>(),
                &nr[..or.len()].iter().collect::<Vec<_>>(),
                ctx,
            )?
        {
            return Err(fail(
                "Existing relationships must remain exact; only append is qualified",
                "/next/source",
            ));
        }
        let new_fields = ne[oe.len()..]
            .iter()
            .metered_filter(ctx, |e, _ctx| Ok(txt(e, "kind") == "field"))?
            .into_iter()
            .map(|e| txt(e, "id"))
            .collect::<BTreeSet<_>>();
        for (j, (before, after)) in oe.iter().zip(ne).enumerate() {
            precharge(before, ctx)?;
            precharge(after, ctx)?;
            charge(ctx, ne.len().saturating_add(64), "/next/source")?;
            if eq(before, after, ctx)? {
                continue;
            }
            let path = format!("/next/source/modules/{i}/elements/{j}");
            if txt(before, "kind") == "field"
                && txt(after, "kind") == "field"
                && get(before, "id") == get(after, "id")
            {
                let reference = object(vec![
                    ("module", cp(v(old, "id"), ctx)?),
                    ("element", cp(v(before, "id"), ctx)?),
                ]);
                let column = catalog_field(previous, &reference, ctx)?;
                let old_null = txt(before, "nullability");
                let new_null = txt(after, "nullability");
                if ((old_null == "absent-allowed" && new_null == "required")
                    || (old_null == "required" && new_null == "absent-allowed"))
                    && eq(
                        &omit(before, &["nullability"], ctx)?,
                        &omit(after, &["nullability"], ctx)?,
                        ctx,
                    )?
                {
                    let kind = if new_null == "required" {
                        "tighten-not-null"
                    } else {
                        "relax-not-null"
                    };
                    let word = if new_null == "required" {
                        "tightening"
                    } else {
                        "relaxation"
                    };
                    if match column {
                        Some(c) => !has_review(options, kind, &txt(c, "sourcePath"), None, ctx)?,
                        None => true,
                    } {
                        return Err(destructive(
                            format!(
                                "Unreviewed NOT NULL {word} for column {}.{}",
                                column.map(|c| txt(c, "table")).unwrap_or("unknown".into()),
                                column.map(|c| txt(c, "name")).unwrap_or(txt(before, "id"))
                            ),
                            path,
                        ));
                    }
                    continue;
                }
                if eq(
                    &omit(before, &["facets"], ctx)?,
                    &omit(after, &["facets"], ctx)?,
                    ctx,
                )? && !eq(v(before, "facets"), v(after, "facets"), ctx)?
                {
                    if match column {
                        Some(c) => !has_review(
                            options,
                            "change-column-type",
                            &txt(c, "sourcePath"),
                            Some("pg-cast-v1"),
                            ctx,
                        )?,
                        None => true,
                    } {
                        return Err(destructive(
                            format!(
                                "Unreviewed type or capacity change for column {}.{}",
                                column.map(|c| txt(c, "table")).unwrap_or("unknown".into()),
                                column.map(|c| txt(c, "name")).unwrap_or(txt(before, "id"))
                            ),
                            path,
                        ));
                    }
                    continue;
                }
            }
            if eq(
                &omit(before, &["description"], ctx)?,
                &omit(after, &["description"], ctx)?,
                ctx,
            )? {
                continue;
            }
            let om = items(get(before, "members"));
            let nm = items(get(after, "members"));
            let removed = om
                .iter()
                .metered_filter(ctx, |r, ctx| {
                    Ok(!nm.iter().metered_any(ctx, |n, _ctx| Ok(refs_equal(r, n)))?)
                })?
                .into_iter()
                .collect::<Vec<_>>();
            let retained = om
                .iter()
                .metered_filter(ctx, |r, ctx| {
                    Ok(!removed
                        .iter()
                        .metered_any(ctx, |n, _ctx| Ok(refs_equal(r, n)))?)
                })?
                .into_iter()
                .collect::<Vec<_>>();
            let prefix = nm.len().saturating_sub(ne.len() - oe.len());
            if txt(before, "kind") != "record"
                || txt(after, "kind") != "record"
                || !eq(
                    &omit(before, &["members", "description", "keys"], ctx)?,
                    &omit(after, &["members", "description", "keys"], ctx)?,
                    ctx,
                )?
                || !same_list(&retained, &nm[..prefix].iter().collect::<Vec<_>>(), ctx)?
            {
                return Err(fail("Existing logical elements must remain exact except explicitly reviewed column removal and key evolution",path));
            }
            for reference in removed {
                precharge(reference, ctx)?;
                let column = catalog_field(previous, reference, ctx)?;
                if match column {
                    Some(c) => {
                        !has_review(options, "drop-column", &txt(c, "sourcePath"), None, ctx)?
                    }
                    None => true,
                } {
                    let name = column
                        .map(|c| txt(c, "name"))
                        .unwrap_or(txt(reference, "element"));
                    let table = items(get(v(previous, "expectedCatalog"), "tables"))
                        .iter()
                        .metered_find(ctx, |t, ctx| {
                            Ok(items(get(t, "columns"))
                                .iter()
                                .metered_any(ctx, |c, _ctx| {
                                    Ok(refs_equal(v(c, "field"), reference))
                                })?)
                        })?
                        .map(|t| txt(t, "name"))
                        .unwrap_or("unknown".into());
                    return Err(destructive(
                        format!("Unreviewed removal of existing column {name} from table {table}"),
                        format!("{path}/members"),
                    ));
                }
            }
            for reference in nm.iter().skip(om.len()) {
                precharge(reference, ctx)?;
                let key = ref_key(reference).unwrap_or_default();
                if get(reference, "module") != get(old, "id")
                    || !new_fields.contains(&txt(reference, "element"))
                {
                    return Err(fail(
                        "An existing Record may only append newly declared Fields",
                        format!("{path}/members"),
                    ));
                }
                if !appended.insert(key) {
                    return Err(fail(
                        "An appended Field may belong to only one existing Record",
                        format!("{path}/members"),
                    ));
                }
            }
        }
    }
    let ot = items(get(v(previous, "expectedCatalog"), "tables"));
    let nt = items(get(v(next, "expectedCatalog"), "tables"));
    if nt.len() < ot.len() {
        return Err(fail(
            "Removing native tables requires separate qualification",
            "/next/expectedCatalog/tables",
        ));
    }
    let mut changes = Vec::new();
    for (ti, (table, target)) in ot.iter().zip(nt).enumerate() {
        precharge(table, ctx)?;
        precharge(target, ctx)?;
        charge(
            ctx,
            nt.len().saturating_add(128),
            "/next/expectedCatalog/tables",
        )?;
        let id = txt(table, "id");
        let tp = format!("/next/expectedCatalog/tables/{ti}");
        let mut c = TableChanges::default();
        if !eq(
            &omit(
                table,
                &["indexes", "columns", "policy", "checks", "foreignKeys"],
                ctx,
            )?,
            &omit(
                target,
                &["indexes", "columns", "policy", "checks", "foreignKeys"],
                ctx,
            )?,
            ctx,
        )? {
            return Err(fail("Existing table definitions must remain exact except for reviewed object changes and appended columns",&tp));
        }
        let oc = cat(previous, "columns", &id, ctx)?;
        let nc = cat(next, "columns", &id, ctx)?;
        c.drops = copies(
            &oc.iter()
                .copied()
                .metered_filter(ctx, |x, ctx| {
                    Ok(!nc
                        .iter()
                        .metered_any(ctx, |n, _ctx| Ok(field_refs_equal(n, x)))?)
                })?
                .into_iter()
                .collect::<Vec<_>>(),
            ctx,
        )?;
        c.append = copies(
            &nc.iter()
                .copied()
                .metered_filter(ctx, |x, ctx| {
                    Ok(!oc
                        .iter()
                        .metered_any(ctx, |n, _ctx| Ok(field_refs_equal(n, x)))?)
                })?
                .into_iter()
                .collect::<Vec<_>>(),
            ctx,
        )?;
        if !c.drops.is_empty() && !c.append.is_empty() {
            return Err(fail("Combining column removal with appended columns on one existing table is not yet qualified",format!("{tp}/columns")));
        }
        let mut evolved = BTreeSet::new();
        for old in &oc {
            precharge(old, ctx)?;
            charge(ctx, nc.len().saturating_add(64), &tp)?;
            let Some(fresh) = nc
                .iter()
                .copied()
                .metered_find(ctx, |x, _ctx| Ok(field_refs_equal(x, old)))?
            else {
                continue;
            };
            let mapping = items(get(table, "columns"))
                .iter()
                .metered_find(ctx, |x, _ctx| Ok(field_refs_equal(x, old)))?
                .unwrap();
            let fresh_mapping = items(get(target, "columns"))
                .iter()
                .metered_find(ctx, |x, _ctx| Ok(field_refs_equal(x, old)))?
                .unwrap();
            let name = get(old, "name") != get(fresh, "name");
            let null = get(old, "nullable") != get(fresh, "nullable");
            let typ = get(old, "typeSchema") != get(fresh, "typeSchema")
                || get(old, "typeName") != get(fresh, "typeName")
                || get(old, "typeMod") != get(fresh, "typeMod");
            let mut expected = txt(old, "definitionSql");
            if name {
                expected = expected.replacen(
                    &(quote_ident(&txt(old, "name")) + " "),
                    &(quote_ident(&txt(fresh, "name")) + " "),
                    1,
                )
            }
            if null {
                if get(fresh, "nullable") == Some(&Value::Bool(true)) {
                    if let Some(x) = expected.strip_suffix(" NOT NULL") {
                        expected = x.into()
                    }
                } else {
                    expected.push_str(" NOT NULL")
                }
            }
            let path = txt(fresh, "sourcePath");
            if (name || null)
                && eq(
                    &omit(mapping, &["name"], ctx)?,
                    &omit(fresh_mapping, &["name"], ctx)?,
                    ctx,
                )?
                && eq(
                    &omit(old, &["name", "nullable", "definitionSql"], ctx)?,
                    &omit(fresh, &["name", "nullable", "definitionSql"], ctx)?,
                    ctx,
                )?
                && txt(fresh, "definitionSql") == expected
            {
                if name && !has_review(options, "rename-column", &path, None, ctx)? {
                    return Err(destructive(
                        format!(
                            "Unreviewed rename of column {}.{}",
                            txt(table, "name"),
                            txt(old, "name")
                        ),
                        "/next/expectedCatalog/columns",
                    ));
                }
                if name {
                    c.renames.push((cp(old, ctx)?, cp(fresh, ctx)?));
                }
                if null {
                    let nullable = get(fresh, "nullable") == Some(&Value::Bool(true));
                    let kind = if nullable {
                        "relax-not-null"
                    } else {
                        "tighten-not-null"
                    };
                    if !has_review(options, kind, &path, None, ctx)? {
                        return Err(destructive(
                            format!(
                                "Unreviewed NOT NULL {} for column {}.{}",
                                if nullable { "relaxation" } else { "tightening" },
                                txt(table, "name"),
                                txt(old, "name")
                            ),
                            "/next/expectedCatalog/columns",
                        ));
                    }
                    if nullable {
                        c.relax.push(cp(fresh, ctx)?)
                    } else {
                        c.tighten.push(cp(fresh, ctx)?)
                    }
                }
                evolved.insert(field_key(old));
                continue;
            }
            let ol = source_field(&docs[0], v(old, "field"), ctx)?.unwrap_or(&Value::Null);
            let nl = source_field(&docs[1], v(fresh, "field"), ctx)?.unwrap_or(&Value::Null);
            let logical_type = if txt(v(mapping, "nativeType"), "kind") == "numeric" {
                let mut okay = true;
                for (l, p) in [
                    (ol, v(mapping, "nativeType")),
                    (nl, v(fresh_mapping, "nativeType")),
                ] {
                    let facets = v(l, "facets");
                    let exact = if let Value::Object(fields) = facets {
                        fields.len() == 2
                            && get(facets, "precision") == get(p, "precision")
                            && get(facets, "scale") == get(p, "scale")
                    } else {
                        false
                    };
                    okay &= exact;
                }
                okay
            } else {
                eq(ol, nl, ctx)?
            };
            if typ
                && !name
                && !null
                && eq(
                    &omit(mapping, &["nativeType", "sourcePath"], ctx)?,
                    &omit(fresh_mapping, &["nativeType", "sourcePath"], ctx)?,
                    ctx,
                )?
                && native_widen(v(mapping, "nativeType"), v(fresh_mapping, "nativeType"))
                && logical_type
                && eq(
                    &omit(ol, &["facets"], ctx)?,
                    &omit(nl, &["facets"], ctx)?,
                    ctx,
                )?
            {
                if !has_review(
                    options,
                    "change-column-type",
                    &path,
                    Some("pg-cast-v1"),
                    ctx,
                )? {
                    return Err(destructive(format!("Safe type widening for {}.{} requires an exact pg-cast-v1 review marker",txt(table,"name"),txt(old,"name")),path));
                }
                c.types.push((cp(old, ctx)?, cp(fresh, ctx)?));
                evolved.insert(field_key(old));
                continue;
            }
            if !eq(
                &omit(mapping, &["name", "sourcePath"], ctx)?,
                &omit(fresh_mapping, &["name", "sourcePath"], ctx)?,
                ctx,
            )? || !eq(
                &omit(old, &["sourcePath"], ctx)?,
                &omit(fresh, &["sourcePath"], ctx)?,
                ctx,
            )? {
                return Err(fail("Existing native column type or semantics changed beyond the supported reviewed subset",format!("{tp}/columns")));
            }
        }
        let retained_map = items(get(table, "columns"))
            .iter()
            .metered_filter(ctx, |x, ctx| {
                Ok(!c
                    .drops
                    .iter()
                    .metered_any(ctx, |d, _ctx| Ok(field_refs_equal(d, x)))?
                    && !evolved.contains(&field_key(x)))
            })?
            .into_iter()
            .collect::<Vec<_>>();
        let fresh_map = items(get(target, "columns"))
            .iter()
            .metered_filter(ctx, |x, ctx| {
                Ok(oc
                    .iter()
                    .metered_any(ctx, |o, _ctx| Ok(field_refs_equal(o, x)))?
                    && !evolved.contains(&field_key(x)))
            })?
            .into_iter()
            .collect::<Vec<_>>();
        let retained_cat = oc
            .iter()
            .copied()
            .metered_filter(ctx, |x, ctx| {
                Ok(!c
                    .drops
                    .iter()
                    .metered_any(ctx, |d, _ctx| Ok(field_refs_equal(d, x)))?
                    && !evolved.contains(&field_key(x)))
            })?
            .into_iter()
            .collect::<Vec<_>>();
        let fresh_cat = nc
            .iter()
            .copied()
            .metered_filter(ctx, |x, ctx| {
                Ok(retained_cat
                    .iter()
                    .metered_any(ctx, |o, _ctx| Ok(field_refs_equal(o, x)))?)
            })?
            .into_iter()
            .collect::<Vec<_>>();
        for (a, b) in [(&retained_map, &fresh_map), (&retained_cat, &fresh_cat)] {
            if a.len() != b.len() {
                return Err(fail(
                    "Existing native columns changed beyond reviewed changes",
                    format!("{tp}/columns"),
                ));
            }
            for (x, y) in a.iter().zip(b.iter()) {
                if !eq(
                    &omit(x, &["sourcePath"], ctx)?,
                    &omit(y, &["sourcePath"], ctx)?,
                    ctx,
                )? {
                    return Err(fail(
                        "Existing native columns changed beyond reviewed changes",
                        format!("{tp}/columns"),
                    ));
                }
            }
        }
        for column in &c.drops {
            precharge(column, ctx)?;
            let path = txt(column, "sourcePath");
            if !has_review(options, "drop-column", &path, None, ctx)? {
                return Err(destructive(
                    format!(
                        "Unreviewed removal of column {}.{}",
                        txt(column, "table"),
                        txt(column, "name")
                    ),
                    "/next/expectedCatalog/columns",
                ));
            }
            assert_no_dependents(column, previous, next, &docs, ctx)?;
        }
        for column in &c.append {
            precharge(column, ctx)?;
            let mapping = items(get(target, "columns"))
                .iter()
                .metered_find(ctx, |x, _ctx| Ok(field_refs_equal(x, column)))?
                .unwrap();
            let key = field_key(column).unwrap_or_default();
            let backfill = items(options.and_then(|x| get(x, "backfills")))
                .iter()
                .metered_any(ctx, |x, _ctx| {
                    Ok(txt(x, "table") == id && ref_key(v(x, "column")).as_ref() == Some(&key))
                })?;
            if !appended.remove(&key)
                || txt(column, "sourcePath").is_empty()
                || (get(column, "nullable") != Some(&Value::Bool(true)) && !backfill)
                || txt(column, "identity") != ""
                || (get(mapping, "default").is_some() && !backfill)
                || get(mapping, "generated").is_some()
            {
                return Err(fail("Appended required columns require explicit scoped backfills; defaults/identity evolution is unsupported",format!("{tp}/columns")));
            }
        }
        for kind in ["indexes", "checks", "keys", "foreignKeys"] {
            let old = cat(previous, kind, &id, ctx)?;
            let fresh = cat(next, kind, &id, ctx)?;
            for old_item in &old {
                precharge(old_item, ctx)?;
                charge(ctx, fresh.len().saturating_add(64), &tp)?;
                let fresh_item = by_id(&fresh, v(old_item, "id"), ctx)?;
                if fresh_item.is_some_and(|x| std::ptr::eq(x, *old_item)) {
                    continue;
                }
                if let Some(x) = fresh_item {
                    if eq(old_item, x, ctx)? {
                        continue;
                    }
                }
                let (index, path) = if kind == "keys" {
                    let rec = v(table, "record");
                    let module = modules_a
                        .iter()
                        .metered_position(ctx, |m, _ctx| Ok(get(m, "id") == get(rec, "module")))?
                        .unwrap();
                    let elements = items(get(&modules_a[module], "elements"));
                    let ei = elements
                        .iter()
                        .metered_position(ctx, |e, _ctx| Ok(get(e, "id") == get(rec, "element")))?
                        .unwrap();
                    let ki = items(get(&elements[ei], "keys"))
                        .iter()
                        .metered_position(ctx, |k, _ctx| Ok(get(k, "id") == get(old_item, "id")))?
                        .map(|x| x as isize)
                        .unwrap_or(-1);
                    (ki, format!("/modules/{module}/elements/{ei}/keys/{ki}"))
                } else {
                    let idx = items(get(table, kind))
                        .iter()
                        .metered_position(ctx, |x, _ctx| Ok(get(x, "id") == get(old_item, "id")))?
                        .map(|x| x as isize)
                        .unwrap_or(-1);
                    (
                        idx,
                        format!("/modules/{mi}/extensions/umf.tables/tables/{ti}/{kind}/{idx}"),
                    )
                };
                let _ = index;
                let rk = match kind {
                    "indexes" => "replace-index",
                    "checks" => "replace-check",
                    "keys" => "replace-primary-key",
                    _ => "replace-foreign-key",
                };
                if !has_review(options, rk, &path, None, ctx)? {
                    let (message, location) = match kind {
                        "indexes" => (
                            format!(
                                "Unreviewed {} of index {}",
                                if fresh_item.is_some() {
                                    "replacement"
                                } else {
                                    "removal"
                                },
                                txt(old_item, "name")
                            ),
                            "/next/expectedCatalog/indexes".into(),
                        ),
                        "checks" => (
                            format!(
                                "Unreviewed replacement/removal of check constraint {}",
                                txt(old_item, "name")
                            ),
                            path.clone(),
                        ),
                        "keys" => (
                            format!(
                                "Unreviewed replacement/removal of key {}",
                                txt(old_item, "name")
                            ),
                            path.clone(),
                        ),
                        _ => (
                            format!(
                                "Unreviewed replacement/removal of foreign key {}",
                                txt(old_item, "name")
                            ),
                            path.clone(),
                        ),
                    };
                    return Err(destructive(message, location));
                }
                match kind {
                    "indexes" => {
                        c.index_drops.push(cp(old_item, ctx)?);
                        if let Some(x) = fresh_item {
                            c.index_replace.insert(txt(x, "id"));
                        }
                    }
                    "checks" => {
                        c.check_drops.push(cp(old_item, ctx)?);
                        if let Some(x) = fresh_item {
                            c.check_adds.push(cp(x, ctx)?);
                        }
                    }
                    "keys" => {
                        let inbound = items(get(v(previous, "expectedCatalog"), "foreignKeys"))
                            .iter()
                            .metered_filter(ctx, |fk, _ctx| {
                                Ok(get(fk, "targetKey") == get(old_item, "name"))
                            })?
                            .into_iter()
                            .map(|fk| txt(fk, "name"))
                            .collect::<Vec<_>>();
                        if !inbound.is_empty() {
                            return Err(fail(
                                format!(
                                    "Primary key {} has inbound foreign-key dependents: {}",
                                    txt(old_item, "name"),
                                    inbound.join(", ")
                                ),
                                &path,
                            ));
                        }
                        c.key_drops.push(cp(old_item, ctx)?);
                        if let Some(x) = fresh_item {
                            c.key_adds.push(cp(x, ctx)?);
                        }
                    }
                    _ => {
                        c.fk_drops.push(cp(old_item, ctx)?);
                        if let Some(x) = fresh_item {
                            c.fk_replace.insert(txt(x, "id"));
                        }
                    }
                }
            }
            if kind == "checks" {
                for x in fresh
                    .iter()
                    .metered_filter(ctx, |x, ctx| {
                        Ok(!old
                            .iter()
                            .metered_any(ctx, |o, _ctx| Ok(get(o, "id") == get(x, "id")))?)
                    })?
                    .into_iter()
                {
                    c.check_adds.push(cp(x, ctx)?);
                }
                if options.is_none() {
                    for x in &c.check_adds {
                        precharge(x, ctx)?;
                        let mut allowed = false;
                        for col in &c.append {
                            precharge(col, ctx)?;
                            let preimage = array(vec![
                                cp(v(table, "id"), ctx)?,
                                cp(v(col, "field"), ctx)?,
                                s("finite-domain"),
                            ]);
                            let name = format!(
                                "umf_d_{}",
                                &hex(&crate::canonical::canonical_sha256_admitted(
                                    &preimage, ctx
                                )?)[..32]
                            );
                            allowed |= txt(x, "name") == name;
                        }
                        if !allowed {
                            return Err(fail("Only compiler-generated domain checks for appended columns are qualified","/next/expectedCatalog/checks"));
                        }
                    }
                }
            }
            if kind == "keys" {
                for x in fresh
                    .iter()
                    .metered_filter(ctx, |x, ctx| {
                        Ok(!old
                            .iter()
                            .metered_any(ctx, |o, _ctx| Ok(get(o, "id") == get(x, "id")))?)
                    })?
                    .into_iter()
                {
                    return Err(fail("Adding a new key alongside an existing key requires separate qualification",txt(x,"definitionSql")));
                }
            }
            if kind == "foreignKeys" && options.is_none() && !same_list(&old, &fresh, ctx)? {
                return Err(fail(
                    "New foreign keys require explicit migration options",
                    "/next/expectedCatalog/foreignKeys",
                ));
            }
        }
        for audience in ["person", "batch"] {
            for command in ["select", "insert", "update", "delete"] {
                let path = policy_path(mi, ti, audience, command);
                if !eq(
                    v(v(v(table, "policy"), audience), command),
                    v(v(v(target, "policy"), audience), command),
                    ctx,
                )? {
                    if !legacy && !has_review(options, "change-policy", &path, None, ctx)? {
                        return Err(destructive(
                            format!("Unreviewed policy change for {id}.{audience}.{command}"),
                            &path,
                        ));
                    }
                    c.policies.push(path.clone());
                }
                let before = matching_grants(previous, &path, ctx)?;
                let after = matching_grants(next, &path, ctx)?;
                let mut same = before.len() == after.len();
                for (x, y) in before.iter().zip(&after) {
                    precharge(x, ctx)?;
                    precharge(y, ctx)?;
                    same &= get(x, "sql") == get(y, "sql");
                }
                if !same {
                    c.grants
                        .push((path, copies(&before, ctx)?, copies(&after, ctx)?));
                }
            }
        }
        changes.push(c);
    }
    if !appended.is_empty() {
        return Err(fail(
            "Every appended Field on an existing Record needs one nullable native column mapping",
            "/next/expectedCatalog/tables",
        ));
    }
    emit(previous, next, options, mi, &changes, ctx)
}

fn assert_no_dependents(
    column: &Value,
    previous: &Value,
    next: &Value,
    docs: &[Value; 2],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let table = items(get(v(previous, "expectedCatalog"), "tables"))
        .iter()
        .metered_find(ctx, |t, _ctx| Ok(get(t, "id") == get(column, "table")))?
        .unwrap();
    let ti = items(get(v(previous, "expectedCatalog"), "tables"))
        .iter()
        .metered_position(ctx, |t, _ctx| Ok(get(t, "id") == get(column, "table")))?
        .unwrap();
    let quoted = quote_ident(&txt(column, "name"));
    let mut affected = Vec::new();
    let mut add = |value: String, ctx: &mut Context<'_>| -> Result<(), EngineError> {
        charge(ctx, value.len().saturating_add(1), "")?;
        if !affected
            .iter()
            .metered_any(ctx, |entry, _ctx| Ok(entry == &value))?
        {
            affected.push(value);
        }
        Ok(())
    };
    for step in items(get(previous, "steps")) {
        precharge(step, ctx)?;
        charge(ctx, items(get(next, "steps")).len().saturating_add(1), "")?;
        let path = txt(step, "sourcePath");
        if path.ends_with(&format!("/tables/{ti}"))
            || path.contains("/columns/")
            || txt(step, "kind") == "comment"
            || !txt(step, "sql").contains(&quoted)
        {
            continue;
        }
        let successor = items(get(next, "steps"))
            .iter()
            .metered_find(ctx, |x, _ctx| {
                Ok(get(x, "sourcePath") == get(step, "sourcePath"))
            })?;
        if successor.is_none_or(|x| txt(x, "sql").contains(&quoted)) {
            add(path, ctx)?
        }
    }
    for (kind, label) in [
        ("indexes", "index"),
        ("checks", "constraint"),
        ("foreignKeys", "foreign-key"),
        ("keys", "key"),
    ] {
        for old in cat(previous, kind, &txt(column, "table"), ctx)? {
            precharge(old, ctx)?;
            charge(ctx, 1, "")?;
            let used = if kind == "keys" {
                items(get(old, "columns"))
                    .iter()
                    .metered_any(ctx, |x, _ctx| {
                        Ok(text(x).as_deref() == Some(&txt(column, "name")))
                    })?
            } else {
                txt(old, "definitionSql").contains(&quoted)
            };
            if !used {
                continue;
            }
            let fresh = cat(next, kind, &txt(column, "table"), ctx)?
                .into_iter()
                .metered_find(ctx, |x, _ctx| Ok(get(x, "id") == get(old, "id")))?;
            if match fresh {
                Some(x) => {
                    if kind == "keys" {
                        items(get(x, "columns"))
                            .iter()
                            .metered_any(ctx, |x, _ctx| {
                                Ok(text(x).as_deref() == Some(&txt(column, "name")))
                            })?
                    } else {
                        txt(x, "definitionSql").contains(&quoted)
                    }
                }
                None => false,
            } {
                add(format!("{label}:{}", txt(old, "name")), ctx)?
            }
        }
    }
    let local_keys = cat(previous, "keys", &txt(column, "table"), ctx)?
        .into_iter()
        .metered_filter(ctx, |k, ctx| {
            Ok(items(get(k, "columns"))
                .iter()
                .metered_any(ctx, |x, _ctx| {
                    Ok(text(x).as_deref() == Some(&txt(column, "name")))
                })?)
        })?
        .into_iter()
        .collect::<Vec<_>>();
    for fk in items(get(v(previous, "expectedCatalog"), "foreignKeys")) {
        precharge(fk, ctx)?;
        charge(ctx, local_keys.len().saturating_add(1), "")?;
        if local_keys.iter().metered_any(ctx, |key, _ctx| {
            Ok(get(key, "name") == get(fk, "targetKey"))
        })? {
            add(format!("inbound-foreign-key:{}", txt(fk, "name")), ctx)?
        }
    }
    let old_module =
        source_module(&docs[0], &txt(previous, "module"), ctx)?.unwrap_or(&Value::Null);
    let next_module =
        source_module(&docs[1], &txt(previous, "module"), ctx)?.unwrap_or(&Value::Null);
    let op = v(v(old_module, "extensions"), "umf.tables");
    let np = v(v(next_module, "extensions"), "umf.tables");
    let reference = v(column, "field");
    for (index, command) in items(get(op, "commands")).iter().enumerate() {
        precharge(command, ctx)?;
        if source_contains(command, reference, ctx)? {
            if let Some(successor) = items(get(np, "commands"))
                .iter()
                .metered_find(ctx, |x, _ctx| Ok(get(x, "id") == get(command, "id")))?
            {
                if source_contains(successor, reference, ctx)? {
                    add(
                        format!(
                            "command:{}",
                            get(command, "id")
                                .and_then(text)
                                .unwrap_or(index.to_string())
                        ),
                        ctx,
                    )?
                }
            }
        }
    }
    for (index, t) in items(get(op, "tables")).iter().enumerate() {
        precharge(t, ctx)?;
        let fresh = items(get(np, "tables")).get(index).unwrap_or(&Value::Null);
        for (kind, label) in [
            ("checks", "check"),
            ("foreignKeys", "foreignKey"),
            ("indexes", "index"),
        ] {
            for item in items(get(t, kind)) {
                precharge(item, ctx)?;
                if source_contains(item, reference, ctx)? {
                    let replacement = items(get(fresh, kind))
                        .iter()
                        .metered_find(ctx, |x, _ctx| Ok(get(x, "id") == get(item, "id")))?;
                    let changed = match replacement {
                        Some(x) => !eq(item, x, ctx)?,
                        None => true,
                    };
                    if changed {
                        add(format!("{label}:{}", txt(item, "id")), ctx)?
                    }
                }
            }
        }
    }
    for old in items(get(op, "tables")) {
        precharge(old, ctx)?;
        if let Some(fresh) = items(get(np, "tables"))
            .iter()
            .metered_find(ctx, |x, _ctx| Ok(get(x, "id") == get(old, "id")))?
        {
            for a in ["person", "batch"] {
                for c in ["select", "insert", "update", "delete"] {
                    if source_contains(v(v(v(old, "policy"), a), c), reference, ctx)?
                        && source_contains(v(v(v(fresh, "policy"), a), c), reference, ctx)?
                    {
                        add(format!("policy:{}.{a}.{c}", txt(old, "id")), ctx)?
                    }
                }
            }
        }
    }
    if !affected.is_empty() {
        for item in &affected {
            charge(ctx, item.len().saturating_add(2), "")?;
        }
        return Err(fail(
            format!(
                "Column {}.{} is referenced by dependent objects: {}",
                txt(table, "name"),
                txt(column, "name"),
                affected.join(", ")
            ),
            txt(column, "sourcePath"),
        ));
    }
    Ok(())
}
fn revoke(
    path: &str,
    table: &Value,
    config: &Value,
    c: &TableChanges,
    done: &mut BTreeSet<String>,
    steps: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if done.contains(path) {
        return Ok(());
    }
    let Some((_, before, _)) = c
        .grants
        .iter()
        .metered_find(ctx, |(p, _, _), _ctx| Ok(p == path))?
    else {
        return Ok(());
    };
    if before.is_empty() {
        return Ok(());
    }
    let parts = path.split('/').collect::<Vec<_>>();
    let audience = parts.get(8).copied().unwrap_or("");
    if !["person", "batch"].contains(&audience) {
        return Err(fail("Unexpected compiler grant source path", path));
    }
    for grant in before {
        precharge(grant, ctx)?;
        steps.push(sql_step(
            "grant",
            path,
            format_args!("{}", revoke_grant_sql(grant, table, config, audience)?),
            ctx,
        )?);
    }
    done.insert(path.into());
    Ok(())
}
fn emit(
    previous: &Value,
    next: &Value,
    options: Option<&Value>,
    mi: usize,
    changes: &[TableChanges],
    ctx: &mut Context<'_>,
) -> Result<Evolution, EngineError> {
    let ot = items(get(v(previous, "expectedCatalog"), "tables"));
    let nt = items(get(v(next, "expectedCatalog"), "tables"));
    let config = v(next, "configuration");
    let schema = txt(config, "schema");
    let mut steps = Vec::new();
    let mut emitted = BTreeSet::new();
    let mut grants = BTreeSet::new();
    let mut revoked = BTreeSet::new();
    for step in items(get(next, "steps")) {
        precharge(step, ctx)?;
        charge(ctx, 128, "")?;
        let path = txt(step, "sourcePath");
        let parts = path.split('/').collect::<Vec<_>>();
        if parts.get(5) != Some(&"tables") {
            continue;
        }
        let Some(ti) = parts.get(6).and_then(|x| x.parse::<usize>().ok()) else {
            continue;
        };
        if ti >= ot.len() {
            steps.push(cp(step, ctx)?);
            continue;
        }
        let table = &nt[ti];
        let c = &changes[ti];
        let relation = format!(
            "{}.{}",
            quote_ident(&schema),
            quote_ident(&txt(table, "name"))
        );
        let kind = txt(step, "kind");
        if kind == "table" && parts.len() == 7 && emitted.insert(ti) {
            if !c.renames.is_empty() {
                for (p, _, _) in &c.grants {
                    revoke(p, table, config, c, &mut revoked, &mut steps, ctx)?
                }
            }
            for (old, fresh) in &c.renames {
                precharge(old, ctx)?;
                precharge(fresh, ctx)?;
                steps.push(sql_step(
                    "table",
                    &txt(fresh, "sourcePath"),
                    format_args!(
                        "ALTER TABLE {relation} RENAME COLUMN {} TO {}",
                        quote_ident(&txt(old, "name")),
                        quote_ident(&txt(fresh, "name"))
                    ),
                    ctx,
                )?)
            }
            for col in &c.tighten {
                precharge(col, ctx)?;
                steps.push(sql_step(
                    "table",
                    &txt(col, "sourcePath"),
                    format_args!(
                        "ALTER TABLE {relation} ALTER COLUMN {} SET NOT NULL",
                        quote_ident(&txt(col, "name"))
                    ),
                    ctx,
                )?)
            }
            for col in &c.relax {
                precharge(col, ctx)?;
                steps.push(sql_step(
                    "table",
                    &txt(col, "sourcePath"),
                    format_args!(
                        "ALTER TABLE {relation} ALTER COLUMN {} DROP NOT NULL",
                        quote_ident(&txt(col, "name"))
                    ),
                    ctx,
                )?)
            }
            for (old, fresh) in &c.types {
                precharge(old, ctx)?;
                precharge(fresh, ctx)?;
                let mapping = items(get(table, "columns"))
                    .iter()
                    .metered_find(ctx, |x, _ctx| Ok(field_refs_equal(x, fresh)))?
                    .unwrap();
                precharge(v(mapping, "nativeType"), ctx)?;
                let ty = native_type(v(mapping, "nativeType"));
                steps.push(sql_step(
                    "table",
                    &txt(fresh, "sourcePath"),
                    format_args!(
                        "ALTER TABLE {relation} ALTER COLUMN {} TYPE {ty} USING {}::{ty}",
                        quote_ident(&txt(fresh, "name")),
                        quote_ident(&txt(old, "name"))
                    ),
                    ctx,
                )?)
            }
            for old in &c.index_drops {
                precharge(old, ctx)?;
                steps.push(sql_step(
                    "index",
                    &format!("/next/expectedCatalog/indexes/{}", txt(old, "id")),
                    format_args!(
                        "DROP INDEX {}.{}",
                        quote_ident(&schema),
                        quote_ident(&txt(old, "name"))
                    ),
                    ctx,
                )?)
            }
            for (kind, drops) in [
                ("checks", &c.check_drops),
                ("foreignKeys", &c.fk_drops),
                ("keys", &c.key_drops),
            ] {
                for old in drops {
                    precharge(old, ctx)?;
                    steps.push(sql_step(
                        "table",
                        &format!("/next/expectedCatalog/{kind}/{}", txt(old, "id")),
                        format_args!(
                            "ALTER TABLE {relation} DROP CONSTRAINT {}",
                            quote_ident(&txt(old, "name"))
                        ),
                        ctx,
                    )?);
                }
            }
            for key in &c.key_adds {
                precharge(key, ctx)?;
                steps.push(sql_step(
                    "table",
                    &format!("/next/expectedCatalog/keys/{}", txt(key, "id")),
                    format_args!("ALTER TABLE {relation} ADD {}", txt(key, "definitionSql")),
                    ctx,
                )?)
            }
            for col in &c.append {
                precharge(col, ctx)?;
                let mapping = items(get(table, "columns"))
                    .iter()
                    .metered_find(ctx, |x, _ctx| Ok(field_refs_equal(x, col)))?
                    .unwrap();
                precharge(v(mapping, "nativeType"), ctx)?;
                let ty = native_type(v(mapping, "nativeType"));
                steps.push(sql_step(
                    "table",
                    &txt(col, "sourcePath"),
                    format_args!(
                        "ALTER TABLE {relation} ADD COLUMN {} {ty}{}",
                        quote_ident(&txt(col, "name")),
                        if txt(col, "collation") == "C" {
                            " COLLATE pg_catalog.\"C\""
                        } else {
                            ""
                        }
                    ),
                    ctx,
                )?)
            }
            for (index, backfill) in items(options.and_then(|o| get(o, "backfills")))
                .iter()
                .enumerate()
            {
                precharge(backfill, ctx)?;
                if txt(backfill, "table") != txt(table, "id") {
                    continue;
                }
                let col = catalog_field(next, v(backfill, "column"), ctx)?.unwrap();
                let mapping = items(get(table, "columns"))
                    .iter()
                    .metered_find(ctx, |x, _ctx| Ok(field_refs_equal(x, col)))?
                    .unwrap();
                let mut bf = sql_step(
                    "backfill",
                    &format!("/options/backfills/{index}"),
                    format_args!("{}", String::new()),
                    ctx,
                )?;
                if let Value::Object(fields) = &mut bf {
                    fields.push((Utf16::from("operation"), cp(v(backfill, "operation"), ctx)?));
                }
                steps.push(bf);
                if let Some(default) = get(mapping, "default") {
                    let sql = match txt(default, "kind").as_str() {
                        "literal" => {
                            crate::deployment::literal_sql_for_migration(v(default, "value"), ctx)?
                        }
                        "randomUuid" => "pg_catalog.gen_random_uuid()".into(),
                        _ => "CURRENT_TIMESTAMP".into(),
                    };
                    steps.push(sql_step(
                        "table",
                        &txt(col, "sourcePath"),
                        format_args!(
                            "ALTER TABLE {relation} ALTER COLUMN {} SET DEFAULT {sql}",
                            quote_ident(&txt(col, "name"))
                        ),
                        ctx,
                    )?)
                }
                if get(col, "nullable") != Some(&Value::Bool(true)) {
                    steps.push(sql_step(
                        "table",
                        &txt(col, "sourcePath"),
                        format_args!(
                            "ALTER TABLE {relation} ALTER COLUMN {} SET NOT NULL",
                            quote_ident(&txt(col, "name"))
                        ),
                        ctx,
                    )?)
                }
            }
            for check in &c.check_adds {
                precharge(check, ctx)?;
                let mut path = None;
                for col in &c.append {
                    precharge(col, ctx)?;
                    let preimage = array(vec![
                        cp(v(table, "id"), ctx)?,
                        cp(v(col, "field"), ctx)?,
                        s("finite-domain"),
                    ]);
                    let name = format!(
                        "umf_d_{}",
                        &hex(&crate::canonical::canonical_sha256_admitted(
                            &preimage, ctx
                        )?)[..32]
                    );
                    if txt(check, "name") == name {
                        path = Some(format!("{}/domain", txt(col, "sourcePath")));
                        break;
                    }
                }
                let path = match path {
                    Some(path) => path,
                    None => {
                        format!(
                            "/modules/{mi}/extensions/umf.tables/tables/{ti}/checks/{}",
                            items(get(table, "checks"))
                                .iter()
                                .metered_position(ctx, |x, _ctx| Ok(
                                    get(x, "id") == get(check, "id")
                                ))?
                                .map(|x| x as isize)
                                .unwrap_or(-1)
                        )
                    }
                };
                let selected = selected_validation(
                    options,
                    &txt(table, "id"),
                    &txt(check, "id"),
                    "check",
                    ctx,
                )?;
                let mut add = sql_step(
                    "table",
                    &path,
                    format_args!(
                        "ALTER TABLE {relation} ADD {}{}",
                        txt(check, "definitionSql"),
                        if selected { " NOT VALID" } else { "" }
                    ),
                    ctx,
                )?;
                if selected {
                    if let Value::Object(fields) = &mut add {
                        fields.push((Utf16::from("operation"), s("add-not-valid")));
                        fields.push((Utf16::from("constraintKind"), s("check")));
                    }
                }
                steps.push(add);
                if selected {
                    let mut validate = sql_step(
                        "table",
                        &path,
                        format_args!(
                            "ALTER TABLE {relation} VALIDATE CONSTRAINT {}",
                            quote_ident(&txt(check, "name"))
                        ),
                        ctx,
                    )?;
                    if let Value::Object(fields) = &mut validate {
                        fields.push((Utf16::from("operation"), s("validate")));
                        fields.push((Utf16::from("constraintKind"), s("check")));
                    }
                    steps.push(validate)
                }
            }
            continue;
        }
        if kind == "comment" {
            if !items(get(previous, "steps"))
                .iter()
                .metered_any(ctx, |x, _ctx| {
                    Ok(txt(x, "kind") == "comment"
                        && get(x, "sourcePath") == get(step, "sourcePath")
                        && get(x, "sql") == get(step, "sql"))
                })?
            {
                steps.push(cp(step, ctx)?)
            }
            continue;
        }
        if kind == "foreignKey" && options.is_some() {
            if let Some(fi) = parts.get(8).and_then(|x| x.parse::<usize>().ok()) {
                let fk = &items(get(table, "foreignKeys"))[fi];
                if !items(get(&ot[ti], "foreignKeys"))
                    .iter()
                    .metered_any(ctx, |x, _ctx| Ok(get(x, "id") == get(fk, "id")))?
                    || c.fk_replace.contains(&txt(fk, "id"))
                {
                    let selected = selected_validation(
                        options,
                        &txt(table, "id"),
                        &txt(fk, "id"),
                        "foreignKey",
                        ctx,
                    )?;
                    let mut add = cp(step, ctx)?;
                    if selected {
                        set(&mut add, "sql", s(&(txt(step, "sql") + " NOT VALID")));
                        if let Value::Object(fields) = &mut add {
                            fields.push((Utf16::from("operation"), s("add-not-valid")));
                            fields.push((Utf16::from("constraintKind"), s("foreignKey")));
                        }
                    }
                    steps.push(add);
                    if selected {
                        let mut validate = sql_step(
                            "foreignKey",
                            &path,
                            format_args!(
                                "ALTER TABLE {relation} VALIDATE CONSTRAINT {}",
                                quote_ident(&txt(fk, "name"))
                            ),
                            ctx,
                        )?;
                        if let Value::Object(fields) = &mut validate {
                            fields.push((Utf16::from("operation"), s("validate")));
                            fields.push((Utf16::from("constraintKind"), s("foreignKey")));
                        }
                        steps.push(validate)
                    }
                    continue;
                }
            }
        }
        if kind == "index" && parts.get(7) == Some(&"indexes") {
            if let Some(ii) = parts.get(8).and_then(|x| x.parse::<usize>().ok()) {
                let index = &items(get(table, "indexes"))[ii];
                if !items(get(&ot[ti], "indexes"))
                    .iter()
                    .metered_any(ctx, |x, _ctx| Ok(get(x, "id") == get(index, "id")))?
                    || c.index_replace.contains(&txt(index, "id"))
                {
                    steps.push(cp(step, ctx)?);
                    continue;
                }
            }
        }
        if kind == "policy" {
            let audience = parts.get(8).copied().unwrap_or("");
            let command = parts.get(9).copied().unwrap_or("");
            if !["person", "batch"].contains(&audience)
                || !["select", "insert", "update", "delete"].contains(&command)
            {
                return Err(fail("Unexpected compiler policy source path", &path));
            }
            if c.policies.contains(&path) {
                steps.push(sql_step(
                    "policy",
                    &path,
                    format_args!("{}", alter_policy_sql(step, table, config, audience)?),
                    ctx,
                )?)
            }
            if c.grants
                .iter()
                .metered_any(ctx, |(p, _, n), _ctx| Ok(p == &path && n.is_empty()))?
            {
                revoke(&path, table, config, c, &mut revoked, &mut steps, ctx)?;
                grants.insert(path);
            }
            continue;
        }
        if kind == "grant" {
            if let Some((_, _, after)) = c
                .grants
                .iter()
                .metered_find(ctx, |(p, _, _), _ctx| Ok(p == &path))?
            {
                if grants.insert(path.clone()) {
                    revoke(&path, table, config, c, &mut revoked, &mut steps, ctx)?;
                    for grant in after {
                        steps.push(cp(grant, ctx)?);
                    }
                }
            }
        }
    }
    for comment in items(get(v(previous, "expectedCatalog"), "comments")) {
        precharge(comment, ctx)?;
        charge(ctx, 1, "")?;
        if items(get(v(next, "expectedCatalog"), "comments"))
            .iter()
            .metered_any(ctx, |x, _ctx| {
                Ok(get(x, "table") == get(comment, "table")
                    && get(x, "column") == get(comment, "column"))
            })?
        {
            continue;
        }
        let Some(ti) = nt
            .iter()
            .metered_position(ctx, |t, _ctx| Ok(get(t, "id") == get(comment, "table")))?
        else {
            continue;
        };
        if let Some(name) = get(comment, "column") {
            if changes[ti]
                .renames
                .iter()
                .metered_any(ctx, |(old, _), _ctx| Ok(get(old, "name") == Some(name)))?
                || changes[ti]
                    .drops
                    .iter()
                    .metered_any(ctx, |old, _ctx| Ok(get(old, "name") == Some(name)))?
            {
                continue;
            }
        }
        let target = format!(
            "{}.{}{}",
            quote_ident(&schema),
            quote_ident(&txt(&nt[ti], "name")),
            get(comment, "column")
                .map(|x| format!(".{}", quote_ident(&text(x).unwrap_or_default())))
                .unwrap_or_default()
        );
        steps.push(sql_step(
            "comment",
            "/next/expectedCatalog/comments",
            format_args!(
                "COMMENT ON {} {target} IS NULL",
                if get(comment, "column").is_some() {
                    "COLUMN"
                } else {
                    "TABLE"
                }
            ),
            ctx,
        )?);
    }
    let mut drops = Vec::new();
    let mut policies = Vec::new();
    for (ti, c) in changes.iter().enumerate() {
        for col in &c.drops {
            precharge(col, ctx)?;
            let relation = format!(
                "{}.{}",
                quote_ident(&schema),
                quote_ident(&txt(&nt[ti], "name"))
            );
            steps.push(sql_step(
                "table",
                &txt(col, "sourcePath"),
                format_args!(
                    "ALTER TABLE {relation} DROP COLUMN {}",
                    quote_ident(&txt(col, "name"))
                ),
                ctx,
            )?);
            drops.push(cp(col, ctx)?);
        }
        for p in &c.policies {
            charge(ctx, p.len(), p)?;
            policies.push(p.clone());
        }
    }
    Ok(Evolution {
        steps,
        drops,
        policies,
    })
}

fn matching_grants<'a>(
    bundle: &'a Value,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<Vec<&'a Value>, EngineError> {
    Ok(items(get(bundle, "steps"))
        .iter()
        .metered_filter(ctx, |x, _ctx| {
            Ok(txt(x, "kind") == "grant" && txt(x, "sourcePath") == path)
        })?
        .into_iter()
        .collect())
}

#[cfg(test)]
mod inner_scan_controls {
    use super::*;

    #[test]
    fn valid_compiler_catalog_and_reviews_interrupt_inside_late_scans() {
        // Retained TypeScript produced both complete deployment bundles and all
        // 256 exact source-bound review markers. The accompanying public frozen
        // migration control independently checks the complete plan, so these
        // scans use accepted compiler records rather than synthetic lookalikes.
        let input=umf_core::serialization::read_json_value(
            &include_str!("../../../../tests/rust-core/fixtures/r3/sol-final-migration-meter-review/scan-inputs.json").encode_utf16().collect::<Vec<_>>(),
            Format::Json,&mut Context::catalog()).unwrap();
        let previous = v(&input, "previous");
        let options = v(&input, "options");
        let columns = items(get(v(previous, "expectedCatalog"), "columns"));
        let reviews = items(get(options, "reviewedChanges"));
        assert_eq!(columns.len(), 258);
        assert_eq!(reviews.len(), 256);
        let last = columns.last().unwrap();
        let reference = v(last, "field");
        let path = txt(last, "sourcePath");
        let run = |operation, ctx: &mut Context<'_>| -> Result<(), EngineError> {
            match operation {
                0 => assert!(catalog_field(previous, reference, ctx)?.is_some()),
                1 => assert!(has_review(
                    Some(options),
                    "tighten-not-null",
                    &path,
                    None,
                    ctx
                )?),
                _ => assert_eq!(
                    cat(previous, "columns", &txt(last, "table"), ctx)?.len(),
                    258
                ),
            }
            Ok(())
        };
        for operation in 0..3 {
            let mut observed = Context::ordinary();
            run(operation, &mut observed).unwrap();
            let total = observed.charged_work();
            assert!(total > 1000);
            for code in ["LIMIT", "NUMBER", "VALUE_INVALID"] {
                let mut charged = 0u64;
                let mut stop = |amount: usize| {
                    charged = charged.saturating_add(amount as u64);
                    if charged >= total * 3 / 4 {
                        Err(EngineError::new(
                            code,
                            Utf16::from("/host/inner-scan"),
                            "bounded late catalog scan refusal",
                        ))
                    } else {
                        Ok(())
                    }
                };
                let error =
                    run(operation, &mut Context::ordinary().with_meter(&mut stop)).unwrap_err();
                assert!(error.is_control_failure());
                assert_eq!(error.code, code);
                assert_eq!(error.path, Utf16::from("/host/inner-scan"));
                assert!(charged >= total * 3 / 4 && charged < total);
            }
        }
    }
}

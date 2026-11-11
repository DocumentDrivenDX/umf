// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native G03 default-change plan compilation.
use super::*;

fn remove(value: &mut Value, key: &str) -> bool {
    if let Value::Object(fields) = value {
        if let Some(index) = fields.iter().position(|(k, _)| k == &Utf16::from(key)) {
            fields.remove(index);
            return true;
        }
    }
    false
}

fn indexed_path(path: &str) -> Option<(usize, usize, usize)> {
    let prefix = "/modules/";
    let tail = path.strip_prefix(prefix)?;
    let (module, tail) = tail.split_once("/extensions/umf.tables/tables/")?;
    let (table, tail) = tail.split_once("/columns/")?;
    let column = tail.strip_suffix("/default")?;
    Some((
        module.parse().ok()?,
        table.parse().ok()?,
        column.parse().ok()?,
    ))
}

fn clear_source_default(doc: &mut Value, path: &str) -> Result<(), EngineError> {
    let (module_index, table_index, column_index) = indexed_path(path).ok_or_else(|| {
        error(
            "TABLE_MIGRATION_OPTIONS",
            "/options/reviewedChanges/0/path",
            "G03 marker path must identify one native column default",
        )
    })?;
    let modules = match member_mut(doc, "modules") {
        Some(Value::Array(v)) => v,
        _ => {
            return Err(error(
                "TABLE_MIGRATION_UNSUPPORTED",
                "/next/source",
                "G03 source modules are malformed",
            ));
        }
    };
    let module = modules.get_mut(module_index).ok_or_else(|| {
        error(
            "TABLE_MIGRATION_UNSUPPORTED",
            "/options/reviewedChanges/0/path",
            "G03 module index is absent",
        )
    })?;
    let payload = member_mut(module, "extensions")
        .and_then(|v| member_mut(v, "umf.tables"))
        .ok_or_else(|| {
            error(
                "TABLE_MIGRATION_UNSUPPORTED",
                "/next/source",
                "G03 tables payload is absent",
            )
        })?;
    let tables = match member_mut(payload, "tables") {
        Some(Value::Array(v)) => v,
        _ => {
            return Err(error(
                "TABLE_MIGRATION_UNSUPPORTED",
                "/next/source",
                "G03 table list is malformed",
            ));
        }
    };
    let table = tables.get_mut(table_index).ok_or_else(|| {
        error(
            "TABLE_MIGRATION_UNSUPPORTED",
            "/options/reviewedChanges/0/path",
            "G03 table index is absent",
        )
    })?;
    let columns = match member_mut(table, "columns") {
        Some(Value::Array(v)) => v,
        _ => {
            return Err(error(
                "TABLE_MIGRATION_UNSUPPORTED",
                "/next/source",
                "G03 columns are malformed",
            ));
        }
    };
    let column = columns.get_mut(column_index).ok_or_else(|| {
        error(
            "TABLE_MIGRATION_UNSUPPORTED",
            "/options/reviewedChanges/0/path",
            "G03 column index is absent",
        )
    })?;
    remove(column, "default");
    let field = get(column, "field")
        .ok_or_else(|| {
            error(
                "TABLE_MIGRATION_UNSUPPORTED",
                "/next/source",
                "G03 field reference is absent",
            )
        })?
        .clone();
    let field_module = text(get(&field, "module").unwrap_or(&Value::Null)).ok_or_else(|| {
        error(
            "TABLE_MIGRATION_UNSUPPORTED",
            "/next/source",
            "G03 field module is invalid",
        )
    })?;
    let field_element = text(get(&field, "element").unwrap_or(&Value::Null)).ok_or_else(|| {
        error(
            "TABLE_MIGRATION_UNSUPPORTED",
            "/next/source",
            "G03 field element is invalid",
        )
    })?;
    let doc_modules = match member_mut(doc, "modules") {
        Some(Value::Array(v)) => v,
        _ => unreachable!(),
    };
    let target_module = doc_modules
        .iter_mut()
        .find(|m| {
            text(get(m, "id").unwrap_or(&Value::Null)).as_deref() == Some(field_module.as_str())
        })
        .ok_or_else(|| {
            error(
                "TABLE_MIGRATION_UNSUPPORTED",
                "/next/source",
                "G03 logical module is absent",
            )
        })?;
    let elements = match member_mut(target_module, "elements") {
        Some(Value::Array(v)) => v,
        _ => {
            return Err(error(
                "TABLE_MIGRATION_UNSUPPORTED",
                "/next/source",
                "G03 logical elements are malformed",
            ));
        }
    };
    let target = elements
        .iter_mut()
        .find(|e| {
            text(get(e, "id").unwrap_or(&Value::Null)).as_deref() == Some(field_element.as_str())
        })
        .ok_or_else(|| {
            error(
                "TABLE_MIGRATION_UNSUPPORTED",
                "/next/source",
                "G03 logical field is absent",
            )
        })?;
    remove(target, "default");
    Ok(())
}

fn clear_catalog_default(catalog: &mut Value, target: &Value) -> Result<(), EngineError> {
    let field = get(target, "field").ok_or_else(|| {
        error(
            "TABLE_MIGRATION_UNSUPPORTED",
            "/options/reviewedChanges/0",
            "G03 target field is absent",
        )
    })?;
    let table_id = get(target, "table").ok_or_else(|| {
        error(
            "TABLE_MIGRATION_UNSUPPORTED",
            "/options/reviewedChanges/0",
            "G03 target table is absent",
        )
    })?;
    let tables = match member_mut(catalog, "tables") {
        Some(Value::Array(v)) => v,
        _ => {
            return Err(error(
                "TABLE_MIGRATION_UNSUPPORTED",
                "/expectedCatalog/tables",
                "G03 table catalog is malformed",
            ));
        }
    };
    let table = tables
        .iter_mut()
        .find(|t| get(t, "id") == Some(table_id))
        .ok_or_else(|| {
            error(
                "TABLE_MIGRATION_UNSUPPORTED",
                "/expectedCatalog/tables",
                "G03 table is absent",
            )
        })?;
    let columns = match member_mut(table, "columns") {
        Some(Value::Array(v)) => v,
        _ => {
            return Err(error(
                "TABLE_MIGRATION_UNSUPPORTED",
                "/expectedCatalog/tables/columns",
                "G03 mapping list is malformed",
            ));
        }
    };
    let mapping = columns
        .iter_mut()
        .find(|c| get(c, "field") == Some(field))
        .ok_or_else(|| {
            error(
                "TABLE_MIGRATION_UNSUPPORTED",
                "/expectedCatalog/tables/columns",
                "G03 mapping is absent",
            )
        })?;
    remove(mapping, "default");
    let physical = match member_mut(catalog, "columns") {
        Some(Value::Array(v)) => v,
        _ => {
            return Err(error(
                "TABLE_MIGRATION_UNSUPPORTED",
                "/expectedCatalog/columns",
                "G03 column catalog is malformed",
            ));
        }
    };
    let column = physical
        .iter_mut()
        .find(|c| get(c, "table") == Some(table_id) && get(c, "field") == Some(field))
        .ok_or_else(|| {
            error(
                "TABLE_MIGRATION_UNSUPPORTED",
                "/expectedCatalog/columns",
                "G03 physical column is absent",
            )
        })?;
    remove(column, "default");
    if let Some(Value::String(path)) = member_mut(column, "sourcePath") {
        *path = Utf16::default();
    }
    if let Some(Value::String(sql)) = member_mut(column, "definitionSql") {
        *sql = Utf16::default();
    }
    Ok(())
}

pub(super) fn compile(
    input: &Value,
    previous: &Value,
    next: &Value,
    options: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if !exact_members(
        options,
        &[
            "version",
            "backfills",
            "concurrentIndexes",
            "reviewedChanges",
            "validations",
        ],
    ) || get(options, "version") != Some(&s("umf.table-migration-options/0.5"))
        || !matches!(get(options, "backfills"), Some(Value::Array(values)) if values.is_empty())
        || !matches!(get(options, "concurrentIndexes"), Some(Value::Array(values)) if values.is_empty())
        || !matches!(get(options, "validations"), Some(Value::Array(values)) if values.is_empty())
        || !matches!(get(options, "reviewedChanges"), Some(Value::Array(values)) if values.len() == 1)
    {
        return Ok(blocked(
            "TABLE_MIGRATION_OPTIONS",
            "/options",
            "Version 0.5 requires one exact reviewed default change and no other options",
        ));
    }
    charge_tree(options, ctx)?;
    let candidates = discovery::discover_default_changes(previous, next, ctx)?;
    let markers = items(get(options, "reviewedChanges"));
    if markers.len() != 1
        || !items(get(options, "backfills")).is_empty()
        || !items(get(options, "concurrentIndexes")).is_empty()
        || !items(get(options, "validations")).is_empty()
    {
        return Ok(blocked(
            "TABLE_MIGRATION_OPTIONS",
            "/options/reviewedChanges",
            "G03 requires exactly one reviewed default-change marker and no other options",
        ));
    }
    let marker = &markers[0];
    let candidate = candidates
        .iter()
        .find(|candidate| {
            ["id", "kind", "path", "oldDigest", "newDigest"]
                .iter()
                .all(|key| get(candidate, key) == get(marker, key))
                && get(marker, "kind") == Some(&s("change-default"))
        })
        .ok_or_else(|| {
            error(
                "TABLE_MIGRATION_OPTIONS",
                "/options/reviewedChanges/0",
                "Marker does not bind the exact selected native/logical default transition",
            )
        })?;
    let path = text(get(candidate, "path").unwrap_or(&Value::Null)).ok_or_else(|| {
        error(
            "TABLE_MIGRATION_OPTIONS",
            "/options/reviewedChanges/0/path",
            "G03 marker path is invalid",
        )
    })?;
    let (module_index, table_index, column_index) = indexed_path(&path).ok_or_else(|| {
        error(
            "TABLE_MIGRATION_OPTIONS",
            "/options/reviewedChanges/0/path",
            "G03 marker path must identify one native column default",
        )
    })?;
    if text(get(get(previous, "source").unwrap_or(&Value::Null), "format").unwrap_or(&Value::Null))
        .as_deref()
        != Some("json")
        || text(get(get(next, "source").unwrap_or(&Value::Null), "format").unwrap_or(&Value::Null))
            .as_deref()
            != Some("json")
    {
        return Ok(blocked(
            "TABLE_MIGRATION_OPTIONS",
            "/previous/source/format",
            "Version 0.5 requires exact JSON retained sources",
        ));
    }
    if !eq(
        get(previous, "configuration").unwrap_or(&Value::Null),
        get(next, "configuration").unwrap_or(&Value::Null),
        ctx,
    )? || get(previous, "module") != get(next, "module")
    {
        return Ok(blocked(
            "TABLE_MIGRATION_UNSUPPORTED",
            "/next/source",
            "Module and native configuration must remain unchanged",
        ));
    }
    let old_target =
        get(get(candidate, "oldValue").unwrap_or(&Value::Null), "target").unwrap_or(&Value::Null);
    let new_target =
        get(get(candidate, "newValue").unwrap_or(&Value::Null), "target").unwrap_or(&Value::Null);
    if get(old_target, "table") != get(new_target, "table")
        || !eq(
            get(old_target, "field").unwrap_or(&Value::Null),
            get(new_target, "field").unwrap_or(&Value::Null),
            ctx,
        )?
    {
        return Ok(blocked(
            "TABLE_MIGRATION_UNSUPPORTED",
            &path,
            "Selected default target must remain the same table Field",
        ));
    }
    let mut old_doc = source_document(previous, ctx)?;
    let mut new_doc = source_document(next, ctx)?;
    let old_module = items(get(&old_doc, "modules"))
        .get(module_index)
        .ok_or_else(|| {
            error(
                "TABLE_MIGRATION_UNSUPPORTED",
                &path,
                "G03 source module is absent",
            )
        })?;
    let new_module = items(get(&new_doc, "modules"))
        .get(module_index)
        .ok_or_else(|| {
            error(
                "TABLE_MIGRATION_UNSUPPORTED",
                &path,
                "G03 source module is absent",
            )
        })?;
    let old_tables = items(get(
        get(old_module, "extensions")
            .and_then(|extensions| get(extensions, "umf.tables"))
            .unwrap_or(&Value::Null),
        "tables",
    ));
    let new_tables = items(get(
        get(new_module, "extensions")
            .and_then(|extensions| get(extensions, "umf.tables"))
            .unwrap_or(&Value::Null),
        "tables",
    ));
    let old_table = old_tables.get(table_index).ok_or_else(|| {
        error(
            "TABLE_MIGRATION_UNSUPPORTED",
            &path,
            "G03 source table is absent",
        )
    })?;
    let new_table = new_tables.get(table_index).ok_or_else(|| {
        error(
            "TABLE_MIGRATION_UNSUPPORTED",
            &path,
            "G03 source table is absent",
        )
    })?;
    let old_columns = items(get(old_table, "columns"));
    let new_columns = items(get(new_table, "columns"));
    let old_column = old_columns.get(column_index).ok_or_else(|| {
        error(
            "TABLE_MIGRATION_UNSUPPORTED",
            &path,
            "G03 source column is absent",
        )
    })?;
    let new_column = new_columns.get(column_index).ok_or_else(|| {
        error(
            "TABLE_MIGRATION_UNSUPPORTED",
            &path,
            "G03 source column is absent",
        )
    })?;
    if get(old_column, "generated").is_some()
        || get(new_column, "generated").is_some()
        || get(old_table, "record") != get(new_table, "record")
    {
        return Ok(blocked(
            "TABLE_MIGRATION_UNSUPPORTED",
            &path,
            "Generated columns and changed table identity are not qualified",
        ));
    }
    clear_source_default(&mut old_doc, &path)?;
    clear_source_default(&mut new_doc, &path)?;
    if !eq(&old_doc, &new_doc, ctx)? {
        return Ok(blocked(
            "TABLE_MIGRATION_UNSUPPORTED",
            "/next/source",
            "Only the selected native and logical default properties may change",
        ));
    }
    let mut old_catalog = copy_value(
        get(previous, "expectedCatalog").unwrap_or(&Value::Null),
        ctx,
    )?;
    let mut new_catalog = copy_value(get(next, "expectedCatalog").unwrap_or(&Value::Null), ctx)?;
    clear_catalog_default(&mut old_catalog, old_target)?;
    clear_catalog_default(&mut new_catalog, new_target)?;
    if !eq(&old_catalog, &new_catalog, ctx)? {
        return Ok(blocked(
            "TABLE_MIGRATION_UNSUPPORTED",
            "/next/expectedCatalog",
            "Native catalog may change only the selected default expression",
        ));
    }
    let new_presence = get(
        get(candidate, "newValue").unwrap_or(&Value::Null),
        "nativeDefault",
    )
    .unwrap_or(&Value::Null);
    let has_new_default = get(new_presence, "present") == Some(&Value::Bool(true));
    let new_default = has_new_default.then(|| get(new_presence, "value").unwrap_or(&Value::Null));
    let logical = get(
        get(candidate, "newValue").unwrap_or(&Value::Null),
        "logicalDefault",
    )
    .unwrap_or(&Value::Null);
    let has_logical_default = get(logical, "present") == Some(&Value::Bool(true));
    let logical_default = get(logical, "value").unwrap_or(&Value::Null);
    if has_logical_default
        && (!exact_members(logical_default, &["on", "value"])
            || !matches!(new_default, Some(Value::Object(_)))
            || text(get(new_default.unwrap(), "kind").unwrap_or(&Value::Null)).as_deref()
                != Some("literal")
            || get(logical_default, "on") != Some(&s("missing"))
            || !eq(
                get(logical_default, "value").unwrap_or(&Value::Null),
                get(new_default.unwrap(), "value").unwrap_or(&Value::Null),
                ctx,
            )?)
    {
        return Ok(blocked(
            "TABLE_MIGRATION_UNSUPPORTED",
            &path,
            "Logical and native defaults must preserve the same missing-only literal",
        ));
    }
    let expression = if let Some(default) = new_default {
        let default_kind = text(get(default, "kind").unwrap_or(&Value::Null));
        let exact = match default_kind.as_deref() {
            Some("literal") => exact_members(default, &["kind", "value"]),
            Some("currentTimestamp" | "randomUuid") => exact_members(default, &["kind"]),
            _ => false,
        };
        if !exact {
            return Ok(blocked(
                "TABLE_MIGRATION_UNSUPPORTED",
                &path,
                "Native default must use the exact closed default vocabulary",
            ));
        }
        match default_kind.as_deref() {
            Some("literal") => crate::deployment::literal_sql_for_migration(
                get(default, "value").unwrap_or(&Value::Null),
                ctx,
            )?,
            Some("currentTimestamp") => "CURRENT_TIMESTAMP".to_owned(),
            Some("randomUuid") => "pg_catalog.gen_random_uuid()".to_owned(),
            _ => {
                return Ok(blocked(
                    "TABLE_MIGRATION_UNSUPPORTED",
                    &path,
                    "Unknown native default kind",
                ));
            }
        }
    } else {
        String::new()
    };
    if expression.len() > 1_048_576 {
        return Ok(blocked(
            "TABLE_MIGRATION_UNSUPPORTED",
            &path,
            "G03 default expression exceeds 1 MiB UTF-8",
        ));
    }
    let doc = source_document(next, ctx)?;
    let module = items(get(&doc, "modules"))
        .get(module_index)
        .ok_or_else(|| {
            error(
                "TABLE_MIGRATION_UNSUPPORTED",
                &path,
                "G03 module index is absent",
            )
        })?;
    let extension = get(
        get(module, "extensions").unwrap_or(&Value::Null),
        "umf.tables",
    )
    .unwrap_or(&Value::Null);
    let table = items(get(extension, "tables"))
        .get(table_index)
        .ok_or_else(|| {
            error(
                "TABLE_MIGRATION_UNSUPPORTED",
                &path,
                "G03 table index is absent",
            )
        })?;
    let column = items(get(table, "columns"))
        .get(column_index)
        .ok_or_else(|| {
            error(
                "TABLE_MIGRATION_UNSUPPORTED",
                &path,
                "G03 column index is absent",
            )
        })?;
    let schema = text(
        get(get(next, "configuration").unwrap_or(&Value::Null), "schema").unwrap_or(&Value::Null),
    )
    .unwrap_or_default();
    let table_name = text(get(table, "name").unwrap_or(&Value::Null)).unwrap_or_default();
    let column_name = text(get(column, "name").unwrap_or(&Value::Null)).unwrap_or_default();
    let output_units = schema
        .encode_utf16()
        .count()
        .saturating_add(table_name.encode_utf16().count())
        .saturating_add(column_name.encode_utf16().count())
        .saturating_add(expression.encode_utf16().count())
        .saturating_add(96);
    ctx.charge_text(output_units, Utf16::from(path.as_str()))?;
    let relation = format!("{}.{}", quote_ident(&schema), quote_ident(&table_name));
    let column_name = quote_ident(&column_name);
    let (operation, sql) = if has_new_default {
        (
            "set-default",
            format!("ALTER TABLE {relation} ALTER COLUMN {column_name} SET DEFAULT {expression}"),
        )
    } else {
        (
            "drop-default",
            format!("ALTER TABLE {relation} ALTER COLUMN {column_name} DROP DEFAULT"),
        )
    };
    if sql.len() > 1_049_600 {
        return Ok(blocked(
            "TABLE_MIGRATION_UNSUPPORTED",
            &path,
            "G03 ALTER statement exceeds 1,049,600 UTF-8 bytes",
        ));
    }
    let table_id = match get(new_target, "table") {
        Some(value) => copy_value(value, ctx)?,
        None => Value::Null,
    };
    let field = match get(new_target, "field") {
        Some(value) => copy_value(value, ctx)?,
        None => Value::Null,
    };
    let step = object(vec![
        ("id", s("step-00001")),
        ("kind", s("table")),
        ("sourcePath", s(&path)),
        ("transaction", s("required")),
        ("sql", s(&sql)),
        ("operation", s(operation)),
        ("phaseOperation", s("change-default")),
        (
            "phaseTarget",
            object(vec![("table", table_id), ("field", field)]),
        ),
        (
            "preconditions",
            object(vec![
                ("phase", s("before-plan")),
                ("kind", s("installed-source-cohort")),
                (
                    "bundleDigest",
                    get(previous, "bundleDigest")
                        .cloned()
                        .unwrap_or(Value::Null),
                ),
            ]),
        ),
        (
            "expectedOutcome",
            object(vec![
                ("phase", s("before-commit")),
                ("kind", s("complete-next-source-catalog")),
                (
                    "bundleDigest",
                    get(next, "bundleDigest").cloned().unwrap_or(Value::Null),
                ),
            ]),
        ),
        (
            "verification",
            s("native-catalog-privileges-and-role-scope"),
        ),
        ("recovery", s("rollback-transaction")),
    ]);
    let phases = array(vec![object(vec![
        ("id", s("phase-00001")),
        ("kind", s("default-change")),
        ("transaction", s("required")),
        ("steps", array(vec![s("step-00001")])),
    ])]);
    let execution = object(vec![
        ("version", s("umf.table-migration-execution/0.4")),
        ("progressRelation", s("umf_lifecycle_progress")),
        ("ownerOnly", Value::Bool(true)),
    ]);
    let body = object(vec![
        ("version", s("umf.table-migration/0.5")),
        ("canonicalization", s("RFC8785")),
        ("id", copy_field(input, "id", ctx)?),
        ("predecessor", copy_field(input, "predecessor", ctx)?),
        ("previous", copy_value(previous, ctx)?),
        ("next", copy_value(next, ctx)?),
        (
            "fromBundleDigest",
            get(previous, "bundleDigest")
                .cloned()
                .unwrap_or(Value::Null),
        ),
        (
            "toBundleDigest",
            get(next, "bundleDigest").cloned().unwrap_or(Value::Null),
        ),
        ("steps", array(vec![step])),
        ("seedExecution", s("none")),
        ("phases", phases),
        ("executionProfile", execution),
        (
            "approvalProfile",
            object(vec![
                ("version", s("umf.table-migration-approval/0.1")),
                ("relation", s("umf_lifecycle_approvals")),
                ("ownerOnly", Value::Bool(true)),
            ]),
        ),
        ("options", copy_value(options, ctx)?),
        ("review", array(vec![])),
        ("requiresApproval", Value::Bool(true)),
        ("nativeQualified", Value::Bool(false)),
    ]);
    if crate::canonical::canonical_json_admitted(&body, ctx)?.len() > 24_000_000 {
        return Ok(blocked(
            "TABLE_MIGRATION_UNSUPPORTED",
            "",
            "Migration plan exceeds24MB",
        ));
    }
    let plan_digest = digest(&body, ctx)?;
    let mut plan = body;
    if let Value::Object(fields) = &mut plan {
        fields.push((Utf16::from("digest"), plan_digest));
    }
    Ok(object(vec![
        ("status", s("compiled")),
        ("plan", plan),
        ("diagnostics", array(vec![])),
    ]))
}

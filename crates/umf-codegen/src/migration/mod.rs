// SPDX-License-Identifier: MIT OR Apache-2.0
//! Source-recompiled table migration plans.
//!
//! Migration bundles are authority only after native deployment recompilation.
//! Plans are signed by canonical digest and are never validated from their
//! embedded SQL or claimed digest alone.

mod discovery;
mod evolution;
use crate::{
    canonical::canonical_json_admitted,
    resources::CodegenEngine,
    value::{member, read_source_value},
};
use umf_core::serialization::Format;
use umf_core::{Context, EngineError, Utf16, Value};

fn s(value: &str) -> Value {
    Value::String(Utf16::from(value))
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn array(values: Vec<Value>) -> Value {
    Value::Array(values)
}
fn eq(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(canonical_json_admitted(a, ctx)? == canonical_json_admitted(b, ctx)?)
}
fn get<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    member(v, key)
}
fn text(v: &Value) -> Option<String> {
    if let Value::String(x) = v {
        x.to_utf8().ok()
    } else {
        None
    }
}
fn js_truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) | Some(Value::Bool(false)) => false,
        Some(Value::Number(n)) => *n != 0.0 && !n.is_nan(),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Bool(true)) | Some(Value::Array(_)) | Some(Value::Object(_)) => true,
    }
}
fn charge(ctx: &mut Context<'_>, amount: usize, path: &str) -> Result<(), EngineError> {
    ctx.charge_work(amount.max(1), Utf16::from(path))
}
fn error(code: &str, path: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::from(path), message)
}
fn diagnostic(code: &str, path: &str, message: &str) -> Value {
    object(vec![
        ("code", s(code)),
        ("path", s(path)),
        ("message", s(message)),
        ("severity", s("error")),
    ])
}
fn blocked(code: &str, path: &str, message: &str) -> Value {
    object(vec![
        ("status", s("blocked")),
        ("diagnostics", array(vec![diagnostic(code, path, message)])),
    ])
}
fn portable_blocked(error: &EngineError, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    if error.code == "CANONICAL_INVALID_UNICODE" {
        return Ok(blocked(
            "TABLE_MIGRATION_INPUT",
            "",
            "Invalid Unicode or resource limit",
        ));
    }
    charge(
        ctx,
        error
            .code
            .len()
            .saturating_add(error.path.len())
            .saturating_add(error.message.len())
            .saturating_add(64),
        "",
    )?;
    Ok(object(vec![
        ("status", s("blocked")),
        (
            "diagnostics",
            array(vec![object(vec![
                ("code", s(&error.code)),
                ("path", Value::String(error.path.clone())),
                ("message", Value::String(error.message.clone())),
                ("severity", s("error")),
            ])]),
        ),
    ]))
}
fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(DIGITS[(byte >> 4) as usize] as char);
        out.push(DIGITS[(byte & 15) as usize] as char);
    }
    out
}
fn digest(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    Ok(s(&hex(&crate::canonical::canonical_sha256_admitted(
        value, ctx,
    )?)))
}

fn migration_identity(value: Option<&Value>, path: &str) -> Result<(), EngineError> {
    let Some(Value::String(id)) = value else {
        return Err(error(
            "TABLE_MIGRATION_UNSUPPORTED",
            path,
            "Expected a nonempty migration identity of at most256 UTF-8 bytes",
        ));
    };
    // Match TextEncoder capacity measurement without changing original units.
    // JCS rejects noninteroperable identities before a plan can be published.
    let bytes = char::decode_utf16(id.units().iter().copied())
        .map(|c| c.map(|c| c.len_utf8()).unwrap_or(3))
        .sum::<usize>();
    if id.is_empty() || id.units().contains(&0) || bytes > 256 {
        return Err(error(
            "TABLE_MIGRATION_UNSUPPORTED",
            path,
            "Expected a nonempty migration identity of at most256 UTF-8 bytes",
        ));
    }
    Ok(())
}

fn source_document(bundle: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let source = get(bundle, "source").ok_or_else(|| {
        error(
            "TABLE_DEPLOYMENT_UNSUPPORTED",
            "/source",
            "Deployment bundle source is invalid",
        )
    })?;
    charge_tree(source, ctx)?;
    let source_text = get(source, "utf8").and_then(text).ok_or_else(|| {
        error(
            "TABLE_DEPLOYMENT_UNSUPPORTED",
            "/source/utf8",
            "Deployment source text is invalid",
        )
    })?;
    let format = match get(source, "format").and_then(text).as_deref() {
        Some("json") => Format::Json,
        Some("yaml") => Format::Yaml,
        _ => {
            return Err(error(
                "TABLE_DEPLOYMENT_UNSUPPORTED",
                "/source/format",
                "Unknown source serialization",
            ));
        }
    };
    read_source_value(&Utf16::from(source_text), format, ctx)
}
fn set(value: &mut Value, key: &str, replacement: Value) -> bool {
    if let Value::Object(items) = value {
        if let Some((_, v)) = items.iter_mut().find(|(k, _)| k == &Utf16::from(key)) {
            *v = replacement;
            return true;
        }
    }
    false
}
fn member_mut<'a>(value: &'a mut Value, key: &str) -> Option<&'a mut Value> {
    if let Value::Object(items) = value {
        items
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from(key))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn command_only(
    previous: &Value,
    next: &Value,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    if !eq(
        get(previous, "configuration").unwrap_or(&Value::Null),
        get(next, "configuration").unwrap_or(&Value::Null),
        ctx,
    )? || get(previous, "module") != get(next, "module")
    {
        return Ok(false);
    }
    let mut docs = [source_document(previous, ctx)?, source_document(next, ctx)?];
    let module = text(get(next, "module").unwrap_or(&Value::Null)).unwrap_or_default();
    for doc in &mut docs {
        let Some(Value::Array(modules)) = member_mut(doc, "modules") else {
            return Ok(false);
        };
        let Some(m) = modules
            .iter_mut()
            .find(|m| get(m, "id").and_then(text).as_deref() == Some(module.as_str()))
        else {
            return Ok(false);
        };
        let Some(payload) = member_mut(m, "extensions").and_then(|e| member_mut(e, "umf.tables"))
        else {
            return Ok(false);
        };
        if !set(payload, "commands", Value::Array(vec![]))
            || !set(payload, "seedSets", Value::Array(vec![]))
        {
            return Ok(false);
        }
    }
    eq(&docs[0], &docs[1], ctx)
}

fn charge_tree(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    match value {
        Value::String(t) => charge(ctx, t.len().saturating_add(1), ""),
        Value::Array(a) => {
            charge(ctx, a.len().saturating_add(1), "")?;
            for x in a {
                charge_tree(x, ctx)?;
            }
            Ok(())
        }
        Value::Object(a) => {
            charge(ctx, a.len().saturating_add(1), "")?;
            for (k, x) in a {
                charge(ctx, k.len(), "")?;
                charge_tree(x, ctx)?;
            }
            Ok(())
        }
        _ => charge(ctx, 1, ""),
    }
}
fn copy_value(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    charge_tree(value, ctx)?;
    Ok(value.clone())
}
fn copy_field(value: &Value, key: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    match get(value, key) {
        Some(value) => copy_value(value, ctx),
        None => Ok(Value::Null),
    }
}
fn without(value: &Value, excluded: &[&str]) -> Value {
    match value {
        Value::Object(fields) => Value::Object(
            fields
                .iter()
                .filter(|(key, _)| !excluded.iter().any(|name| key == &Utf16::from(*name)))
                .cloned()
                .collect(),
        ),
        _ => value.clone(),
    }
}
fn items<'a>(value: Option<&'a Value>) -> &'a [Value] {
    match value {
        Some(Value::Array(values)) => values,
        _ => &[],
    }
}
fn field_key(value: &Value) -> Option<String> {
    ref_key(get(value, "field")?)
}
fn table_id(value: &Value) -> Option<String> {
    text(get(value, "id")?)
}
fn revoke_grant_sql(
    step: &Value,
    table: &Value,
    config: &Value,
    audience: &str,
) -> Result<String, EngineError> {
    let schema = text(get(config, "schema").unwrap_or(&Value::Null)).unwrap_or_default();
    let table_name = text(get(table, "name").unwrap_or(&Value::Null)).unwrap_or_default();
    let role_key = if audience == "person" {
        "personRole"
    } else {
        "batchRole"
    };
    let role = text(get(config, role_key).unwrap_or(&Value::Null)).unwrap_or_default();
    let sql = text(get(step, "sql").unwrap_or(&Value::Null)).unwrap_or_default();
    let relation = format!("{}.{}", quote_ident(&schema), quote_ident(&table_name));
    let suffix = format!(" ON TABLE {relation} TO {}", quote_ident(&role));
    let Some(privilege) = sql
        .strip_prefix("GRANT ")
        .and_then(|v| v.strip_suffix(&suffix))
    else {
        let path = text(get(step, "sourcePath").unwrap_or(&Value::Null)).unwrap_or_default();
        return Err(error(
            "TABLE_MIGRATION_UNSUPPORTED",
            &path,
            "The grant compiler emitted an unexpected revoke-compatible shape",
        ));
    };
    Ok(format!(
        "REVOKE {privilege} ON TABLE {relation} FROM {}",
        quote_ident(&role)
    ))
}

fn alter_policy_sql(
    step: &Value,
    table: &Value,
    config: &Value,
    audience: &str,
) -> Result<String, EngineError> {
    let schema = text(get(config, "schema").unwrap_or(&Value::Null)).unwrap_or_default();
    let table_name = text(get(table, "name").unwrap_or(&Value::Null)).unwrap_or_default();
    let path = text(get(step, "sourcePath").unwrap_or(&Value::Null)).unwrap_or_default();
    let command = path.rsplit('/').next().unwrap_or("");
    let role_key = if audience == "person" {
        "personRole"
    } else {
        "batchRole"
    };
    let role = text(get(config, role_key).unwrap_or(&Value::Null)).unwrap_or_default();
    let policy_name = format!("umf_{audience}_{command}");
    let relation = format!("{}.{}", quote_ident(&schema), quote_ident(&table_name));
    let prefix = format!(
        "CREATE POLICY {} ON {relation} AS PERMISSIVE FOR {} TO {}",
        quote_ident(&policy_name),
        command.to_ascii_uppercase(),
        quote_ident(&role)
    );
    let sql = text(get(step, "sql").unwrap_or(&Value::Null)).unwrap_or_default();
    let Some(clauses) = sql.strip_prefix(&prefix) else {
        return Err(error(
            "TABLE_MIGRATION_UNSUPPORTED",
            &path,
            "The policy compiler emitted an unexpected ALTER-compatible shape",
        ));
    };
    if clauses.is_empty() {
        return Err(error(
            "TABLE_MIGRATION_UNSUPPORTED",
            &path,
            "The policy compiler emitted no predicate clauses",
        ));
    }
    Ok(format!(
        "ALTER POLICY {} ON {relation}{clauses}",
        quote_ident(&policy_name)
    ))
}

fn ref_key(value: &Value) -> Option<String> {
    let module = text(get(value, "module")?)?;
    let element = text(get(value, "element")?)?;
    Some(format!("{}:{}{}", module.len(), module, element))
}
fn find_ref<'a>(items: &'a [Value], r: &Value) -> Option<&'a Value> {
    let key = ref_key(r)?;
    items
        .iter()
        .find(|item| field_key(item).as_deref() == Some(key.as_str()))
}
fn module<'a>(doc: &'a Value, id: &str) -> Option<&'a Value> {
    items(get(doc, "modules"))
        .iter()
        .find(|m| text(get(m, "id").unwrap_or(&Value::Null)).as_deref() == Some(id))
}
fn logical_field<'a>(doc: &'a Value, r: &Value) -> Option<&'a Value> {
    let m = module(doc, &text(get(r, "module")?)?)?;
    items(get(m, "elements")).iter().find(|e| {
        text(get(e, "id").unwrap_or(&Value::Null)).as_deref()
            == text(get(r, "element").unwrap_or(&Value::Null)).as_deref()
    })
}
fn item_by_id<'a>(items: &'a [Value], id: &Value) -> Option<&'a Value> {
    items.iter().find(|item| get(item, "id") == Some(id))
}
fn reviewed_kind(kind: &str) -> &str {
    match kind {
        "checks" => "replace-check",
        "foreignKeys" => "replace-foreign-key",
        "indexes" => "replace-index",
        "keys" => "replace-primary-key",
        _ => kind,
    }
}
fn discover_verified(
    previous: &Value,
    next: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    discovery::discover(previous, next, ctx)
}
fn migration_options(
    value: Option<&Value>,
    previous: Option<&Value>,
    next: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<Value>, EngineError> {
    let Some(value) = value else { return Ok(None) };
    if value == &Value::Null {
        return Err(error(
            "MIGRATION_FAILED",
            "",
            "null is not an object (evaluating 'value.version')",
        ));
    }
    let fail = |message: &str, path: &str| error("TABLE_MIGRATION_OPTIONS", path, message);
    let Some(version) = get(value, "version").and_then(text) else {
        return Err(fail(
            "Unknown options profile, members or resource bounds",
            "/options",
        ));
    };
    let v1 = version == "umf.table-migration-options/0.1";
    let v2 = version == "umf.table-migration-options/0.2";
    let allowed: &[&str] = if v1 {
        &["version", "backfills", "concurrentIndexes"]
    } else if v2 {
        &[
            "version",
            "backfills",
            "concurrentIndexes",
            "reviewedChanges",
            "validations",
        ]
    } else {
        return Err(fail(
            "Unknown options profile, members or resource bounds",
            "/options",
        ));
    };
    let Some(Value::Object(fields)) = Some(value) else {
        return Err(fail(
            "Unknown options profile, members or resource bounds",
            "/options",
        ));
    };
    if fields.len() != allowed.len()
        || fields
            .iter()
            .any(|(key, _)| !allowed.iter().any(|allowed| key == &Utf16::from(*allowed)))
        || allowed.iter().any(|key| get(value, key).is_none())
        || items(get(value, "backfills")).len() > 256
        || items(get(value, "concurrentIndexes")).len() > 256
        || !matches!(get(value, "backfills"), Some(Value::Array(_)))
        || !matches!(get(value, "concurrentIndexes"), Some(Value::Array(_)))
        || (v2
            && (!matches!(get(value, "reviewedChanges"), Some(Value::Array(_)))
                || !matches!(get(value, "validations"), Some(Value::Array(_)))
                || items(get(value, "validations")).len() > 256))
    {
        return Err(fail(
            "Unknown options profile, members or resource bounds",
            "/options",
        ));
    }
    let Some(previous) = previous else {
        return Err(fail(
            if v2 {
                "Version 0.2 phased plans require a previous installed source; initial publication is not supported"
            } else {
                "Options require a previous installed source"
            },
            "/options",
        ));
    };
    let exact = |item: &Value, names: &[&str]| -> bool {
        let Some(Value::Object(members)) = Some(item) else {
            return false;
        };
        members.len() == names.len()
            && members
                .iter()
                .all(|(key, _)| names.iter().any(|name| key == &Utf16::from(*name)))
            && names.iter().all(|name| get(item, name).is_some())
    };
    let catalog_tables = items(get(
        get(next, "expectedCatalog").unwrap_or(&Value::Null),
        "tables",
    ));
    let previous_tables = items(get(
        get(previous, "expectedCatalog").unwrap_or(&Value::Null),
        "tables",
    ));
    let catalog_columns = items(get(
        get(next, "expectedCatalog").unwrap_or(&Value::Null),
        "columns",
    ));
    let previous_columns = items(get(
        get(previous, "expectedCatalog").unwrap_or(&Value::Null),
        "columns",
    ));
    if v2 {
        if items(get(value, "reviewedChanges")).len() > 512 {
            return Err(fail(
                "reviewedChanges must be an array of at most512 exact markers",
                "/options",
            ));
        }
        let candidates = discover_verified(previous, next, ctx)?;
        let mut seen = Vec::<String>::new();
        for (index, marker) in items(get(value, "reviewedChanges")).iter().enumerate() {
            charge(ctx, 128, "")?;
            let path = format!("/options/reviewedChanges/{index}");
            let Some(Value::Object(members)) = Some(marker) else {
                return Err(fail(
                    &format!("{path}: expected reviewed change object"),
                    "/options",
                ));
            };
            let allowed_marker = ["conversion", "id", "kind", "newDigest", "oldDigest", "path"];
            if members
                .iter()
                .any(|(key, _)| !allowed_marker.iter().any(|n| key == &Utf16::from(*n)))
                || ["id", "kind", "path", "oldDigest", "newDigest"]
                    .iter()
                    .any(|key| get(marker, key).is_none())
            {
                return Err(fail(
                    &format!("{path}: unknown or missing marker member"),
                    "/options",
                ));
            }
            let id = text(get(marker, "id").unwrap_or(&Value::Null)).unwrap_or_default();
            let kind = text(get(marker, "kind").unwrap_or(&Value::Null)).unwrap_or_default();
            let string_field = |key: &str| matches!(get(marker, key), Some(Value::String(_)));
            let valid_digest = |key: &str| {
                text(get(marker, key).unwrap_or(&Value::Null)).is_some_and(|d| {
                    d.len() == 64
                        && d.bytes()
                            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
                })
            };
            let valid_id = match get(marker, "id") {
                Some(Value::String(id)) => {
                    !id.is_empty() && id.len() <= 128 && !id.units().contains(&0)
                }
                _ => false,
            };
            let valid_conversion = get(marker, "conversion").is_none_or(
                |value| matches!(value,Value::String(text) if !text.is_empty()&&text.len()<=128),
            );
            if !valid_id
                || !string_field("kind")
                || !string_field("path")
                || !valid_digest("oldDigest")
                || !valid_digest("newDigest")
                || !valid_conversion
            {
                return Err(fail(
                    &format!("{path}: invalid marker identity or digest"),
                    "/options",
                ));
            }
            let candidate = candidates.iter().find(|item| {
                text(get(item, "id").unwrap_or(&Value::Null)).as_deref() == Some(id.as_str())
                    && text(get(item, "kind").unwrap_or(&Value::Null)).as_deref()
                        == Some(kind.as_str())
                    && get(item, "path") == get(marker, "path")
                    && get(item, "oldDigest") == get(marker, "oldDigest")
                    && get(item, "newDigest") == get(marker, "newDigest")
            });
            if candidate.is_none() {
                return Err(fail(
                    &format!("{path}: marker does not bind an exact source change"),
                    "/options",
                ));
            }
            if seen.contains(&id) {
                return Err(fail(&format!("{path}: duplicate marker"), "/options"));
            }
            seen.push(id);
        }
        let mut seen_validations = Vec::<String>::new();
        for (index, selection) in items(get(value, "validations")).iter().enumerate() {
            charge(ctx, 128, "")?;
            let path = format!("/options/validations/{index}");
            if !exact(selection, &["table", "constraint", "kind"])
                || !matches!(
                    text(get(selection, "kind").unwrap_or(&Value::Null)).as_deref(),
                    Some("check" | "foreignKey")
                )
                || text(get(selection, "table").unwrap_or(&Value::Null)).is_none()
                || text(get(selection, "constraint").unwrap_or(&Value::Null)).is_none()
            {
                return Err(fail(
                    "Validation selection requires table, constraint and supported kind",
                    &path,
                ));
            }
            let table_id = text(get(selection, "table").unwrap()).unwrap();
            let constraint_id = text(get(selection, "constraint").unwrap()).unwrap();
            let kind = text(get(selection, "kind").unwrap()).unwrap();
            let identity = format!(
                "{}:{table_id}{}:{constraint_id}{kind}",
                table_id.len(),
                constraint_id.len()
            );
            if seen_validations.contains(&identity) {
                return Err(fail("Duplicate validation selection", &path));
            }
            seen_validations.push(identity);
            let old_table = previous_tables.iter().find(|item| {
                text(get(item, "id").unwrap_or(&Value::Null)).as_deref() == Some(table_id.as_str())
            });
            let new_table = catalog_tables.iter().find(|item| {
                text(get(item, "id").unwrap_or(&Value::Null)).as_deref() == Some(table_id.as_str())
            });
            let property = if kind == "check" {
                "checks"
            } else {
                "foreignKeys"
            };
            let old_exists = old_table.is_some_and(|table| {
                items(get(table, property)).iter().any(|item| {
                    text(get(item, "id").unwrap_or(&Value::Null)).as_deref()
                        == Some(constraint_id.as_str())
                })
            });
            let new_exists = new_table.is_some_and(|table| {
                items(get(table, property)).iter().any(|item| {
                    text(get(item, "id").unwrap_or(&Value::Null)).as_deref()
                        == Some(constraint_id.as_str())
                })
            });
            if old_table.is_none() || !new_exists || old_exists {
                return Err(fail(
                    "Validation must select a newly added constraint on an existing table",
                    &path,
                ));
            }
        }
    }
    let mut seen_backfills = Vec::<String>::new();
    for (index, backfill) in items(get(value, "backfills")).iter().enumerate() {
        charge(ctx, 128, "")?;
        let path = format!("/options/backfills/{index}");
        if !exact(backfill, &["table", "column", "operation", "scopedRows"])
            || !exact(
                get(backfill, "column").unwrap_or(&Value::Null),
                &["module", "element"],
            )
            || !matches!(get(backfill, "scopedRows"), Some(Value::Bool(true)))
        {
            return Err(fail(
                "Backfill requires explicit scoped-row acknowledgement",
                &path,
            ));
        }
        let table_id = text(get(backfill, "table").unwrap_or(&Value::Null)).unwrap_or_default();
        let column_ref = get(backfill, "column").unwrap();
        let ref_id = |item: &Value| ref_key(item).unwrap_or_default();
        let column_key = ref_id(column_ref);
        let fresh_table = catalog_tables.iter().find(|item| {
            text(get(item, "id").unwrap_or(&Value::Null)).as_deref() == Some(table_id.as_str())
        });
        let old_table = previous_tables.iter().find(|item| {
            text(get(item, "id").unwrap_or(&Value::Null)).as_deref() == Some(table_id.as_str())
        });
        let fresh_column = catalog_columns.iter().find(|item| {
            text(get(item, "table").unwrap_or(&Value::Null)).as_deref() == Some(table_id.as_str())
                && ref_id(get(item, "field").unwrap_or(&Value::Null)) == column_key
        });
        let old_column = previous_columns.iter().any(|item| {
            text(get(item, "table").unwrap_or(&Value::Null)).as_deref() == Some(table_id.as_str())
                && ref_id(get(item, "field").unwrap_or(&Value::Null)) == column_key
        });
        if fresh_table.is_none() || old_table.is_none() || fresh_column.is_none() || old_column {
            return Err(fail(
                "Backfill must select an appended column on an existing table",
                &path,
            ));
        }
        let identity = format!("{}:{table_id}{column_key}", table_id.len());
        if seen_backfills.contains(&identity) {
            return Err(fail("Duplicate backfill", &path));
        }
        seen_backfills.push(identity);
        let operation_id =
            text(get(backfill, "operation").unwrap_or(&Value::Null)).unwrap_or_default();
        let document = source_document(next, ctx)?;
        let module = text(get(next, "module").unwrap_or(&Value::Null)).unwrap_or_default();
        let payload = items(get(&document, "modules"))
            .iter()
            .find(|item| {
                text(get(item, "id").unwrap_or(&Value::Null)).as_deref() == Some(module.as_str())
            })
            .and_then(|item| {
                get(
                    get(item, "extensions").unwrap_or(&Value::Null),
                    "umf.tables",
                )
            })
            .unwrap_or(&Value::Null);
        let command = items(get(payload, "commands")).iter().find(|item| {
            text(get(item, "id").unwrap_or(&Value::Null)).as_deref() == Some(operation_id.as_str())
        });
        let body = command
            .and_then(|item| get(item, "body"))
            .unwrap_or(&Value::Null);
        let values = items(get(body, "values"));
        let where_clause = get(body, "where").unwrap_or(&Value::Null);
        let value = values
            .first()
            .and_then(|item| get(item, "value"))
            .unwrap_or(&Value::Null);
        let supported_value = matches!(
            text(get(value, "kind").unwrap_or(&Value::Null)).as_deref(),
            Some("literal" | "currentTimestamp")
        );
        let valid_command = command.is_some_and(|item| {
            items(get(item, "parameters")).is_empty() && !js_truthy(get(item, "batch"))
        }) && text(get(body, "kind").unwrap_or(&Value::Null)).as_deref()
            == Some("update")
            && text(get(body, "table").unwrap_or(&Value::Null)).as_deref()
                == Some(table_id.as_str())
            && items(get(body, "returning")).is_empty()
            && values.len() == 1
            && ref_id(get(&values[0], "field").unwrap_or(&Value::Null)) == column_key
            && supported_value
            && text(get(where_clause, "op").unwrap_or(&Value::Null)).as_deref() == Some("isNull")
            && ref_id(get(where_clause, "field").unwrap_or(&Value::Null)) == column_key;
        if !valid_command {
            return Err(fail(
                "Backfill requires an original parameter-free bounded UPDATE of only its selected NULL column",
                &path,
            ));
        }
    }
    let mut seen_indexes = Vec::<String>::new();
    for (index, selection) in items(get(value, "concurrentIndexes")).iter().enumerate() {
        charge(ctx, 128, "")?;
        let path = format!("/options/concurrentIndexes/{index}");
        if !exact(selection, &["table", "index"]) {
            return Err(fail("Unknown concurrent index selection", &path));
        }
        let table = text(get(selection, "table").unwrap_or(&Value::Null)).unwrap_or_default();
        let index_id = text(get(selection, "index").unwrap_or(&Value::Null)).unwrap_or_default();
        let fresh = catalog_tables.iter().find(|item| {
            text(get(item, "id").unwrap_or(&Value::Null)).as_deref() == Some(table.as_str())
        });
        let old = previous_tables.iter().find(|item| {
            text(get(item, "id").unwrap_or(&Value::Null)).as_deref() == Some(table.as_str())
        });
        let fresh_exists = fresh.is_some_and(|item| {
            items(get(item, "indexes")).iter().any(|idx| {
                text(get(idx, "id").unwrap_or(&Value::Null)).as_deref() == Some(index_id.as_str())
            })
        });
        let old_exists = old.is_some_and(|item| {
            items(get(item, "indexes")).iter().any(|idx| {
                text(get(idx, "id").unwrap_or(&Value::Null)).as_deref() == Some(index_id.as_str())
            })
        });
        if !fresh_exists || old.is_none() || old_exists {
            return Err(fail(
                "Concurrent index must be newly appended on an existing table",
                &path,
            ));
        }
        let id = format!("{}:{table}{index_id}", table.len());
        if seen_indexes.contains(&id) {
            return Err(fail("Duplicate concurrent index selection", &path));
        }
        seen_indexes.push(id);
    }
    Ok(Some(copy_value(value, ctx)?))
}

fn quote_ident(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}
fn native_type(value: &Value) -> String {
    crate::deployment::native_type_sql(value).expect("source-verified deployment native type")
}
fn raw_step(kind: &str, path: &str, sql: &str, extra: Vec<(&str, Value)>) -> Value {
    let mut fields = vec![
        ("id", s("")),
        ("kind", s(kind)),
        ("sourcePath", s(path)),
        ("transaction", s("required")),
        ("sql", s(sql)),
    ];
    fields.extend(extra);
    object(fields)
}
fn plan_version_is_v2(options: Option<&Value>) -> bool {
    options
        .and_then(|value| get(value, "version"))
        .and_then(text)
        .as_deref()
        == Some("umf.table-migration-options/0.2")
}

fn validation_selected(options: Option<&Value>, table: &str, constraint: &str, kind: &str) -> bool {
    items(options.and_then(|value| get(value, "validations")))
        .iter()
        .any(|selection| {
            text(get(selection, "table").unwrap_or(&Value::Null)).as_deref() == Some(table)
                && text(get(selection, "constraint").unwrap_or(&Value::Null)).as_deref()
                    == Some(constraint)
                && text(get(selection, "kind").unwrap_or(&Value::Null)).as_deref() == Some(kind)
        })
}

/// Retained seeds are immutable except that their values for a reviewed
/// dropped column disappear with that column. The caller still performs the
/// destructive-change review before producing any plan.
fn retained_seed_sets(
    previous: &Value,
    next: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let previous_columns = items(get(
        get(previous, "expectedCatalog").unwrap_or(&Value::Null),
        "columns",
    ));
    let next_columns = items(get(
        get(next, "expectedCatalog").unwrap_or(&Value::Null),
        "columns",
    ));
    let mut removed = Vec::new();
    for column in previous_columns {
        charge(ctx, 1, "/previous/expectedCatalog/columns")?;
        let key = field_key(column);
        if key.is_some()
            && !next_columns
                .iter()
                .any(|fresh| get(fresh, "table") == get(column, "table") && field_key(fresh) == key)
        {
            removed.push(key.unwrap());
        }
    }
    let mut retained = match get(previous, "seedSets") {
        Some(value) => copy_value(value, ctx)?,
        None => array(vec![]),
    };
    let Value::Array(sets) = &mut retained else {
        return Ok(retained);
    };
    for set in sets {
        charge(ctx, 1, "/previous/seedSets")?;
        let Some(Value::Array(rows)) = member_mut(set, "rows") else {
            continue;
        };
        for row in rows {
            charge(ctx, 1, "/previous/seedSets/rows")?;
            let Some(Value::Array(values)) = member_mut(row, "values") else {
                continue;
            };
            charge(ctx, values.len().max(1), "/previous/seedSets/rows/values")?;
            values.retain(|value| {
                let key = field_key(value);
                !key.is_some_and(|key| removed.contains(&key))
            });
        }
    }
    Ok(retained)
}

impl CodegenEngine<'_> {
    /// Discover reviewed changes between two source-recompiled deployment bundles.
    pub fn discover_table_migration_changes(
        &self,
        previous: &Value,
        next: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let previous = self.verify_table_deployment(previous, ctx)?;
        let next = self.verify_table_deployment(next, ctx)?;
        Ok(array(discover_verified(&previous, &next, ctx)?))
    }

    /// Compile an initial plan or a command/seed-only source revision.
    pub fn compile_table_migration(
        &self,
        input: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        self.compile_migration_inner(input, ctx, false)
    }
    fn compile_migration_inner(
        &self,
        input: &Value,
        ctx: &mut Context<'_>,
        legacy: bool,
    ) -> Result<Value, EngineError> {
        let admitted = match crate::value::admit_json(input, ctx) {
            Ok(value) => value,
            Err(error)
                if !error.is_control_failure()
                    && ["INPUT", "LIMIT"].contains(&error.code.as_str()) =>
            {
                return Ok(blocked(
                    "TABLE_MIGRATION_INPUT",
                    "",
                    "Invalid Unicode or resource limit",
                ));
            }
            Err(error) => return Err(error),
        };
        let input = &admitted;
        let fields = match input {
            Value::Object(fields) => fields,
            _ => {
                return Ok(blocked(
                    "TABLE_MIGRATION_UNSUPPORTED",
                    "",
                    "Unknown or missing migration request member",
                ));
            }
        };
        let allowed = ["id", "predecessor", "previous", "next", "options"];
        if fields
            .iter()
            .any(|(k, _)| !allowed.iter().any(|name| k == &Utf16::from(*name)))
            || ["id", "predecessor", "previous", "next"]
                .iter()
                .any(|k| get(input, k).is_none())
        {
            return Ok(blocked(
                "TABLE_MIGRATION_UNSUPPORTED",
                "",
                "Unknown or missing migration request member",
            ));
        }
        if let Err(e) = migration_identity(get(input, "id"), "/id") {
            return Ok(blocked(
                &e.code,
                "/id",
                &e.message.to_utf8().unwrap_or_default(),
            ));
        }
        let predecessor = get(input, "predecessor").unwrap();
        if !matches!(predecessor, Value::Null) {
            let Value::Object(members) = predecessor else {
                return Ok(blocked(
                    "TABLE_MIGRATION_UNSUPPORTED",
                    "/predecessor",
                    "Expected an exact predecessor identity/digest",
                ));
            };
            if members.len() != 2
                || get(predecessor, "id").is_none()
                || get(predecessor, "digest").is_none()
            {
                return Ok(blocked(
                    "TABLE_MIGRATION_UNSUPPORTED",
                    "/predecessor",
                    "Expected an exact predecessor identity/digest",
                ));
            }
            if let Err(e) = migration_identity(get(predecessor, "id"), "/predecessor/id") {
                return Ok(blocked(
                    &e.code,
                    "/predecessor/id",
                    &e.message.to_utf8().unwrap_or_default(),
                ));
            }
            if get(predecessor, "id") == get(input, "id")
                || !text(get(predecessor, "digest").unwrap()).is_some_and(|d| {
                    d.len() == 64
                        && d.bytes()
                            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
                })
            {
                return Ok(blocked(
                    "TABLE_MIGRATION_UNSUPPORTED",
                    "/predecessor",
                    "Invalid predecessor identity/digest",
                ));
            }
        }
        let previous = if matches!(get(input, "previous"), Some(Value::Null)) {
            None
        } else {
            Some(
                match self.verify_table_deployment(get(input, "previous").unwrap(), ctx) {
                    Ok(v) => v,
                    Err(e) => {
                        if e.is_control_failure() {
                            return Err(e);
                        }
                        return Ok(portable_blocked(&e, ctx)?);
                    }
                },
            )
        };
        let next_request = get(input, "next").unwrap();
        let next = match self.verify_table_deployment(next_request, ctx) {
            Ok(value) => value,
            Err(error)
                if !error.is_control_failure()
                    && (error.code.starts_with("TABLE_DEPLOYMENT_")
                        || error.code == "CANONICAL_INVALID_UNICODE") =>
            {
                return Ok(portable_blocked(&error, ctx)?);
            }
            Err(error) => return Err(error),
        };
        if previous.is_some() != !matches!(predecessor, Value::Null) {
            return Ok(blocked(
                "TABLE_MIGRATION_UNSUPPORTED",
                "/predecessor",
                "Only initial deployment has a null predecessor",
            ));
        }
        let bundle = next;
        let options =
            match migration_options(get(input, "options"), previous.as_ref(), &bundle, ctx) {
                Ok(value) => value,
                Err(error) => {
                    if error.is_control_failure() || error.code == "MIGRATION_FAILED" {
                        return Err(error);
                    }
                    return Ok(portable_blocked(&error, ctx)?);
                }
            };
        if plan_version_is_v2(options.as_ref()) {
            if let Some(previous) = previous.as_ref() {
                let ids = |deployment: &Value| {
                    let mut values = items(get(
                        get(deployment, "expectedCatalog").unwrap_or(&Value::Null),
                        "tables",
                    ))
                    .iter()
                    .filter_map(table_id)
                    .collect::<Vec<_>>();
                    values.sort();
                    values
                };
                if ids(previous) != ids(&bundle) {
                    return Ok(blocked(
                        "TABLE_MIGRATION_UNSUPPORTED",
                        "/next/expectedCatalog/tables",
                        "Version 0.2 phased plans cannot add or remove tables until the runtime models absent and newly created table identities explicitly",
                    ));
                }
            }
        }
        let raw_steps = match get(&bundle, "steps") {
            Some(Value::Array(steps)) => steps.as_slice(),
            _ => {
                return Ok(blocked(
                    "TABLE_DEPLOYMENT_UNSUPPORTED",
                    "/next/steps",
                    "Verified deployment bundle has no steps",
                ));
            }
        };
        let mut evolved_drops = Vec::new();
        let mut evolved_policies = Vec::new();
        let mut steps: Vec<Value> = if let Some(previous) = &previous {
            let evolved = match evolution::evolve(previous, &bundle, options.as_ref(), legacy, ctx)
            {
                Ok(value) => value,
                Err(error) if error.is_control_failure() => return Err(error),
                Err(error) => return Ok(portable_blocked(&error, ctx)?),
            };
            if get(previous, "bundleDigest") == get(&bundle, "bundleDigest") {
                return Ok(blocked(
                    "TABLE_MIGRATION_UNSUPPORTED",
                    "/next",
                    "An unchanged bundle does not create a new migration",
                ));
            }
            evolved_drops = evolved.drops;
            evolved_policies = evolved.policies;
            let steps = evolved.steps;
            if let (Some(Value::Array(old)), Some(Value::Array(fresh))) =
                (get(previous, "seedSets"), get(&bundle, "seedSets"))
            {
                let retained = retained_seed_sets(previous, &bundle, ctx)?;
                if fresh.len() < old.len()
                    || !eq(
                        &retained,
                        &array(
                            fresh[..old.len()]
                                .iter()
                                .map(|value| copy_value(value, ctx))
                                .collect::<Result<Vec<_>, _>>()?,
                        ),
                        ctx,
                    )?
                {
                    return Ok(blocked(
                        "TABLE_MIGRATION_UNSUPPORTED",
                        "/next/seedSets",
                        "Existing seed sets are immutable except reviewed dropped-column seed values",
                    ));
                }
            }
            steps
        } else {
            raw_steps
                .iter()
                .map(|value| copy_value(value, ctx))
                .collect::<Result<Vec<_>, _>>()?
        };
        if let Some(previous) = &previous {
            if steps.is_empty() && !command_only(previous, &bundle, ctx)? {
                return Ok(blocked(
                    "TABLE_MIGRATION_UNSUPPORTED",
                    "/next/source",
                    "A plan without DDL may change only declared commands or source serialization",
                ));
            }
        }
        if let Some(options) = options.as_ref() {
            let concurrent = items(get(options, "concurrentIndexes"));
            let legacy = text(get(options, "version").unwrap_or(&Value::Null)).as_deref()
                == Some("umf.table-migration-options/0.1");
            if !concurrent.is_empty() {
                if legacy {
                    let mut docs = [
                        source_document(
                            previous.as_ref().expect("validated options predecessor"),
                            ctx,
                        )?,
                        source_document(&bundle, ctx)?,
                    ];
                    let module_id = text(get(&bundle, "module").unwrap_or(&Value::Null)).unwrap();
                    for document in &mut docs {
                        charge(ctx, 128, "")?;
                        if let Some(Value::Array(modules)) = member_mut(document, "modules") {
                            if let Some(module) = modules.iter_mut().find(|m| {
                                get(m, "id").and_then(text).as_deref() == Some(&module_id)
                            }) {
                                if let Some(payload) = member_mut(module, "extensions")
                                    .and_then(|x| member_mut(x, "umf.tables"))
                                {
                                    if let Some(Value::Array(tables)) =
                                        member_mut(payload, "tables")
                                    {
                                        for table in tables {
                                            charge(ctx, 1, "")?;
                                            set(table, "indexes", array(vec![]));
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if !eq(&docs[0], &docs[1], ctx)? {
                        return Ok(blocked(
                            "TABLE_MIGRATION_UNSUPPORTED",
                            "/options/concurrentIndexes",
                            "Concurrent phases may change only index declarations",
                        ));
                    }
                    let previous_count = previous
                        .as_ref()
                        .map(|p| items(get(p, "seedSets")).len())
                        .unwrap_or(0);
                    if items(get(&bundle, "seedSets")).len() > previous_count
                        || !items(get(options, "backfills")).is_empty()
                    {
                        return Ok(blocked("TABLE_MIGRATION_UNSUPPORTED","/options/concurrentIndexes","Legacy concurrent indexes cannot share a migration with seeds or backfills"));
                    }
                }

                if legacy
                    && steps.iter().any(|step| {
                        text(get(step, "kind").unwrap_or(&Value::Null)).as_deref() != Some("index")
                    })
                {
                    return Ok(blocked(
                        "TABLE_MIGRATION_UNSUPPORTED",
                        "/options/concurrentIndexes",
                        "Legacy concurrent-index plans must contain indexes only",
                    ));
                }
                for step in &mut steps {
                    charge(ctx, 128, "")?;
                    charge(ctx, 128, "")?;
                    if text(get(step, "kind").unwrap_or(&Value::Null)).as_deref() != Some("index") {
                        continue;
                    }
                    let source_path =
                        text(get(step, "sourcePath").unwrap_or(&Value::Null)).unwrap_or_default();
                    let segments = source_path.split('/').collect::<Vec<_>>();
                    let Some(table_at) = segments.iter().position(|part| *part == "tables") else {
                        continue;
                    };
                    let table_index = segments
                        .get(table_at + 1)
                        .and_then(|s| s.parse::<usize>().ok())
                        .unwrap_or(usize::MAX);
                    let index_index = segments
                        .get(table_at + 3)
                        .and_then(|s| s.parse::<usize>().ok())
                        .unwrap_or(usize::MAX);
                    let selected = concurrent.iter().any(|selection| {
                        let table_id = text(get(selection, "table").unwrap_or(&Value::Null))
                            .unwrap_or_default();
                        let index_id = text(get(selection, "index").unwrap_or(&Value::Null))
                            .unwrap_or_default();
                        items(get(
                            get(&bundle, "expectedCatalog").unwrap_or(&Value::Null),
                            "tables",
                        ))
                        .get(table_index)
                        .is_some_and(|table| {
                            text(get(table, "id").unwrap_or(&Value::Null)).as_deref()
                                == Some(table_id.as_str())
                        }) && items(get(
                            get(&bundle, "expectedCatalog").unwrap_or(&Value::Null),
                            "tables",
                        ))
                        .get(table_index)
                        .is_some_and(|table| {
                            items(get(table, "indexes"))
                                .get(index_index)
                                .is_some_and(|idx| {
                                    text(get(idx, "id").unwrap_or(&Value::Null)).as_deref()
                                        == Some(index_id.as_str())
                                })
                        })
                    });
                    if selected {
                        let sql =
                            text(get(step, "sql").unwrap_or(&Value::Null)).unwrap_or_default();
                        let rewritten = if let Some(rest) = sql.strip_prefix("CREATE UNIQUE INDEX ")
                        {
                            format!("CREATE UNIQUE INDEX CONCURRENTLY {rest}")
                        } else if let Some(rest) = sql.strip_prefix("CREATE INDEX ") {
                            format!("CREATE INDEX CONCURRENTLY {rest}")
                        } else {
                            return Ok(blocked(
                                "TABLE_MIGRATION_UNSUPPORTED",
                                &source_path,
                                "Concurrent index compiler emitted an unexpected SQL shape",
                            ));
                        };
                        set(step, "transaction", s("forbidden"));
                        set(step, "sql", s(&rewritten));
                    } else if legacy {
                        return Ok(blocked(
                            "TABLE_MIGRATION_UNSUPPORTED",
                            "/options/concurrentIndexes",
                            "Every index in this legacy phase must be explicitly selected as concurrent",
                        ));
                    }
                }
            }
        }
        if steps.len() > 8192 {
            return Ok(blocked(
                "TABLE_MIGRATION_UNSUPPORTED",
                "/steps",
                "Migration step count exceeds8192",
            ));
        }
        let mut generated_id = 90000usize;
        let mut step_ids = steps
            .iter()
            .filter_map(|step| get(step, "id").and_then(text))
            .collect::<std::collections::BTreeSet<_>>();
        for step in &mut steps {
            if text(get(step, "id").unwrap_or(&Value::Null)).is_none_or(|id| id.is_empty()) {
                while step_ids.contains(&format!("step-{generated_id:05}")) {
                    generated_id += 1;
                }
                let id = format!("step-{generated_id:05}");
                step_ids.insert(id.clone());
                set(step, "id", s(&id));
                generated_id += 1;
            }
        }
        let bundle_digest = get(&bundle, "bundleDigest").cloned().unwrap_or(Value::Null);
        charge(ctx, steps.len(), "/steps")?;
        let mut migration_steps = Vec::with_capacity(steps.len());
        for step in &steps {
            charge(ctx, 128, "")?;
            charge_tree(step, ctx)?;
            ctx.charge_work(512, Utf16::default())?;
            let transaction = get(step, "transaction")
                .cloned()
                .unwrap_or_else(|| s("required"));
            let mut planned = object(vec![
                ("id", get(step, "id").cloned().unwrap_or(Value::Null)),
                ("kind", get(step, "kind").cloned().unwrap_or(Value::Null)),
                (
                    "sourcePath",
                    get(step, "sourcePath").cloned().unwrap_or(Value::Null),
                ),
                ("transaction", transaction.clone()),
                ("sql", get(step, "sql").cloned().unwrap_or(Value::Null)),
                (
                    "preconditions",
                    object(vec![
                        ("phase", s("before-plan")),
                        (
                            "kind",
                            s(if previous.is_some() {
                                "installed-source-cohort"
                            } else {
                                "empty-private-schema"
                            }),
                        ),
                        (
                            "bundleDigest",
                            previous
                                .as_ref()
                                .and_then(|p| get(p, "bundleDigest"))
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
                        ("bundleDigest", bundle_digest.clone()),
                    ]),
                ),
                (
                    "verification",
                    s("native-catalog-privileges-and-role-scope"),
                ),
                (
                    "recovery",
                    if text(&transaction).as_deref() == Some("forbidden") {
                        s("inspect-index")
                    } else {
                        s("rollback-transaction")
                    },
                ),
            ]);
            if let Some(operation) = get(step, "operation") {
                if let Value::Object(fields) = &mut planned {
                    fields.push((Utf16::from("operation"), operation.clone()));
                }
            }
            if let Some(constraint_kind) = get(step, "constraintKind") {
                if let Value::Object(fields) = &mut planned {
                    fields.push((Utf16::from("constraintKind"), constraint_kind.clone()));
                }
            }
            migration_steps.push(planned);
        }
        let all_seed_sets: &[Value] = match get(&bundle, "seedSets") {
            Some(Value::Array(v)) => v.as_slice(),
            _ => &[],
        };
        let old_seed_count = previous
            .as_ref()
            .and_then(|p| get(p, "seedSets"))
            .and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a.len())
                } else {
                    None
                }
            })
            .unwrap_or(0);
        let seed_sets = if old_seed_count <= all_seed_sets.len() {
            &all_seed_sets[old_seed_count..]
        } else {
            &[]
        };
        if !seed_sets.is_empty() {
            let format = get(get(&bundle, "source").unwrap_or(&Value::Null), "format")
                .and_then(text)
                .unwrap_or_default();
            let rows = seed_sets
                .iter()
                .map(|set| match get(set, "rows") {
                    Some(Value::Array(v)) => v.len(),
                    _ => usize::MAX,
                })
                .fold(0usize, usize::saturating_add);
            let bad_ids = seed_sets.iter().any(|set| {
                get(set, "id")
                    .and_then(text)
                    .is_none_or(|id| id.len() > 256)
            });
            if format != "json" || seed_sets.len() > 128 || rows > 10000 || bad_ids {
                return Ok(blocked(
                    "TABLE_MIGRATION_UNSUPPORTED",
                    "/next/seedSets",
                    "Native seeds require JSON source, at most128 new sets/10000 rows, and256-byte IDs",
                ));
            }
        }
        let seed_execution = if seed_sets.is_empty() {
            s("none")
        } else {
            let ids = seed_sets
                .iter()
                .filter_map(|v| get(v, "id").cloned())
                .collect();
            object(vec![
                ("version", s("umf.table-seed-execution/0.1")),
                ("sets", array(ids)),
            ])
        };
        if plan_version_is_v2(options.as_ref()) && !seed_sets.is_empty() {
            let previous_digest = previous
                .as_ref()
                .and_then(|p| get(p, "bundleDigest"))
                .cloned()
                .unwrap_or(Value::Null);
            let ids = get(&seed_execution, "sets")
                .cloned()
                .unwrap_or_else(|| Value::Array(vec![]));
            let next_id = migration_steps
                .iter()
                .filter_map(|step| text(get(step, "id").unwrap_or(&Value::Null)))
                .filter_map(|id| {
                    id.strip_prefix("step-")
                        .and_then(|n| n.parse::<usize>().ok())
                })
                .max()
                .unwrap_or(0)
                + 1;
            if next_id > 99999 {
                return Err(error("MIGRATION_FAILED", "", "migration-step-capacity"));
            }
            migration_steps.push(object(vec![
                ("id", s(&format!("step-{next_id:05}"))),
                ("kind", s("seed")),
                ("transaction", s("required")),
                ("sourcePath", s("/seedExecution/sets")),
                ("sql", s("")),
                ("operation", s("apply-seeds")),
                ("seedSets", ids),
                (
                    "preconditions",
                    object(vec![
                        ("phase", s("before-plan")),
                        ("kind", s("installed-source-cohort")),
                        ("bundleDigest", previous_digest),
                    ]),
                ),
                (
                    "expectedOutcome",
                    object(vec![
                        ("phase", s("before-commit")),
                        ("kind", s("complete-next-source-catalog")),
                        (
                            "bundleDigest",
                            get(&bundle, "bundleDigest").cloned().unwrap_or(Value::Null),
                        ),
                    ]),
                ),
                (
                    "verification",
                    s("native-catalog-privileges-and-role-scope"),
                ),
                ("recovery", s("rollback-transaction")),
            ]));
        }
        let mut review_items = Vec::new();
        if let Some(options) = options.as_ref() {
            for (index, _) in items(get(options, "backfills")).iter().enumerate() {
                charge(ctx, 128, "")?;
                review_items.push(object(vec![("code",s("SCOPED_BACKFILL")),("path",s(&format!("/options/backfills/{index}"))), ("message",s("Administrative UPDATE may touch protected rows; exact source and effect bound require approval"))]));
            }
            for path in evolved_policies {
                review_items.push(object(vec![("code",s("POLICY_CHANGE_REVIEW")),("path",s(&path)),("message",s("Changed row predicate may widen access; review old and new command policy"))]));
            }
            for column in evolved_drops {
                let name =
                    |key: &str| text(get(&column, key).unwrap_or(&Value::Null)).unwrap_or_default();
                let field = get(&column, "field").unwrap_or(&Value::Null);
                let module = text(get(field, "module").unwrap_or(&Value::Null)).unwrap_or_default();
                let element =
                    text(get(field, "element").unwrap_or(&Value::Null)).unwrap_or_default();
                review_items.push(object(vec![("code",s("IRREVERSIBLE_COLUMN_PURGE")),("path",s(&name("sourcePath"))),("message",s(&format!("Irreversible purge of stored values for Field {module}.{element} at table {}.{}. Metadata history is not a data backup; this profile performs immediate physical deletion.",name("table"),name("name"))))]));
            }
        }
        let mut phases = Vec::new();
        let mut execution_profile = None;
        if plan_version_is_v2(options.as_ref()) {
            let mut groups: Vec<(String, String, Vec<Value>)> = Vec::new();
            for step in &migration_steps {
                charge(ctx, 128, "")?;
                let kind = text(get(step, "kind").unwrap_or(&Value::Null)).unwrap_or_default();
                let transaction = text(get(step, "transaction").unwrap_or(&Value::Null))
                    .unwrap_or_else(|| "required".into());
                let operation =
                    text(get(step, "operation").unwrap_or(&Value::Null)).unwrap_or_default();
                let phase_kind = if kind == "backfill" {
                    "backfill"
                } else if kind == "seed" {
                    "seed"
                } else if kind == "index" && transaction == "forbidden" {
                    "concurrent-index"
                } else if operation == "add-not-valid" {
                    "constraint-add"
                } else if operation == "validate" {
                    "constraint-validation"
                } else {
                    "transaction"
                }
                .to_string();
                let isolated = phase_kind != "transaction";
                if isolated && !groups.is_empty() { /* flushed below by forcing a new group */ }
                if isolated || groups.last().is_none_or(|(_, tx, _)| tx != &transaction) {
                    groups.push((phase_kind.clone(), transaction.clone(), Vec::new()));
                }
                groups
                    .last_mut()
                    .unwrap()
                    .2
                    .push(get(step, "id").cloned().unwrap_or(Value::Null));
                if isolated {
                    groups.push(("__flush__".into(), String::new(), Vec::new()));
                }
            }
            groups.retain(|(kind, _, _)| kind != "__flush__");
            let mut compact: Vec<(String, String, Vec<Value>)> = Vec::new();
            for group in groups {
                charge(ctx, 128, "")?;
                if group.0 == "__flush__" {
                    continue;
                }
                if compact.last().is_some_and(|(kind, tx, _)| {
                    kind == &group.0 && tx == &group.1 && group.0 == "transaction"
                }) {
                    compact.last_mut().unwrap().2.extend(group.2);
                } else {
                    compact.push(group);
                }
            }
            for (index, (kind, transaction, ids)) in compact.iter().enumerate() {
                charge(ctx, 128, "")?;
                phases.push(object(vec![
                    ("id", s(&format!("phase-{:05}", index + 1))),
                    ("kind", s(kind)),
                    ("transaction", s(transaction)),
                    ("steps", array(ids.clone())),
                ]));
            }
            execution_profile = Some(object(vec![
                ("version", s("umf.table-migration-execution/0.1")),
                ("progressRelation", s("umf_lifecycle_progress")),
                ("ownerOnly", Value::Bool(true)),
            ]));
        }
        let plan_version = if get(options.as_ref().unwrap_or(&Value::Null), "version")
            .and_then(text)
            .as_deref()
            == Some("umf.table-migration-options/0.2")
        {
            "umf.table-migration/0.2"
        } else {
            "umf.table-migration/0.1"
        };
        charge_tree(input, ctx)?;
        charge_tree(&bundle, ctx)?;
        let mut body = object(vec![
            ("version", s(plan_version)),
            ("canonicalization", s("RFC8785")),
            ("id", get(input, "id").cloned().unwrap()),
            ("predecessor", predecessor.clone()),
            ("previous", previous.clone().unwrap_or(Value::Null)),
            ("next", bundle.clone()),
            (
                "fromBundleDigest",
                previous
                    .as_ref()
                    .and_then(|p| get(p, "bundleDigest"))
                    .cloned()
                    .unwrap_or(Value::Null),
            ),
            ("toBundleDigest", bundle_digest),
            ("steps", array(migration_steps)),
            ("seedExecution", seed_execution),
            ("requiresApproval", Value::Bool(true)),
            ("nativeQualified", Value::Bool(false)),
        ]);
        if let Some(options) = options {
            if let Value::Object(fields) = &mut body {
                fields.push((Utf16::from("options"), options.clone()));
                fields.push((Utf16::from("review"), array(review_items)));
                if plan_version == "umf.table-migration/0.2" {
                    fields.push((Utf16::from("phases"), array(phases)));
                    fields.push((
                        Utf16::from("executionProfile"),
                        execution_profile.unwrap_or(Value::Null),
                    ));
                }
            }
        }
        let canonical_body = match crate::canonical::canonical_json_admitted(&body, ctx) {
            Ok(value) => value,
            Err(error)
                if !error.is_control_failure() && error.code == "CANONICAL_INVALID_UNICODE" =>
            {
                return Ok(blocked(
                    "TABLE_MIGRATION_INPUT",
                    "",
                    "Invalid Unicode or resource limit",
                ))
            }
            Err(error) => return Err(error),
        };
        if canonical_body.len() > 24_000_000 {
            return Ok(blocked(
                "TABLE_MIGRATION_UNSUPPORTED",
                "",
                "Migration plan exceeds24MB",
            ));
        }
        let plan_digest = digest(&body, ctx)?;
        if let Value::Object(fields) = &mut body {
            fields.push((Utf16::from("digest"), plan_digest));
        }
        Ok(object(vec![
            ("status", s("compiled")),
            ("plan", body),
            ("diagnostics", array(vec![])),
        ]))
    }

    /// Recompile the retained previous/next deployment bundles and the full
    /// migration plan. A changed SQL step or a self-consistently rehashed
    /// plan never constitutes authority.
    pub fn verify_table_migration(
        &self,
        input: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let plan = crate::value::admit_json(input, ctx)?;
        if !matches!(
            get(&plan, "version").and_then(text).as_deref(),
            Some("umf.table-migration/0.1" | "umf.table-migration/0.2")
        ) {
            return Err(error(
                "TABLE_MIGRATION_UNSUPPORTED",
                "",
                "Unknown migration plan",
            ));
        }
        charge_tree(&plan, ctx)?;
        let mut request_members = vec![
            ("id", get(&plan, "id").cloned().unwrap_or(Value::Null)),
            (
                "predecessor",
                get(&plan, "predecessor").cloned().unwrap_or(Value::Null),
            ),
            (
                "previous",
                get(&plan, "previous").cloned().unwrap_or(Value::Null),
            ),
            ("next", get(&plan, "next").cloned().unwrap_or(Value::Null)),
        ];
        if let Some(options) = get(&plan, "options").filter(|value| js_truthy(Some(value))) {
            request_members.push(("options", options.clone()));
        }
        let request = object(request_members);
        let result = self.compile_migration_inner(
            &request,
            ctx,
            get(&plan, "version").and_then(text).as_deref() == Some("umf.table-migration/0.1"),
        )?;
        let Some(expected) = get(&result, "plan") else {
            return Err(error(
                "TABLE_MIGRATION_UNSUPPORTED",
                "",
                "Migration differs from exact source recompilation",
            ));
        };
        if !eq(&plan, expected, ctx)? {
            return Err(error(
                "TABLE_MIGRATION_UNSUPPORTED",
                "",
                "Migration differs from exact source recompilation",
            ));
        }
        Ok(plan)
    }
}

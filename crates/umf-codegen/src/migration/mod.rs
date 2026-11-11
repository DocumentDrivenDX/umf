// SPDX-License-Identifier: MIT OR Apache-2.0
//! Source-recompiled table migration plans.
//!
//! Migration bundles are authority only after native deployment recompilation.
//! Plans are signed by canonical digest and are never validated from their
//! embedded SQL or claimed digest alone.

mod discovery;
mod evolution;
mod g03;
mod g04_compile;
mod g06;
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
fn set_or_insert(value: &mut Value, key: &str, replacement: Value) -> bool {
    if let Value::Object(items) = value {
        if let Some((_, v)) = items.iter_mut().find(|(k, _)| k == &Utf16::from(key)) {
            *v = replacement;
        } else {
            items.push((Utf16::from(key), replacement));
        }
        return true;
    }
    false
}
fn remove_member(value: &mut Value, key: &str) -> bool {
    let Value::Object(fields) = value else {
        return false;
    };
    if let Some(index) = fields
        .iter()
        .position(|(name, _)| name == &Utf16::from(key))
    {
        fields.remove(index);
        true
    } else {
        false
    }
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

fn validate_g02_source_delta(
    previous: &Value,
    next: &Value,
    table_id: &str,
    field_ref: &Value,
    operation_id: &str,
    existing: bool,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut old = source_document(previous, ctx)?;
    let mut fresh = source_document(next, ctx)?;
    let module_id = text(get(next, "module").unwrap_or(&Value::Null)).unwrap_or_default();
    let find_module = |document: &Value| {
        items(get(document, "modules")).iter().position(|module| {
            get(module, "id").and_then(text).as_deref() == Some(module_id.as_str())
        })
    };
    let old_index = find_module(&old).ok_or_else(|| {
        error(
            "TABLE_MIGRATION_OPTIONS",
            "/previous/source",
            "G02 source module is missing",
        )
    })?;
    let new_index = find_module(&fresh).ok_or_else(|| {
        error(
            "TABLE_MIGRATION_OPTIONS",
            "/next/source",
            "G02 source module is missing",
        )
    })?;
    if old_index != new_index {
        return Err(error(
            "TABLE_MIGRATION_OPTIONS",
            "/next/source",
            "G02 preserves module order",
        ));
    }
    let old_module = items(get(&old, "modules"))[old_index].clone();
    let new_modules = member_mut(&mut fresh, "modules").ok_or_else(|| {
        error(
            "TABLE_MIGRATION_OPTIONS",
            "/next/source/modules",
            "G02 modules are malformed",
        )
    })?;
    let Value::Array(new_modules) = new_modules else {
        return Err(error(
            "TABLE_MIGRATION_OPTIONS",
            "/next/source/modules",
            "G02 modules are malformed",
        ));
    };
    let new_module = new_modules.get_mut(new_index).ok_or_else(|| {
        error(
            "TABLE_MIGRATION_OPTIONS",
            "/next/source/modules",
            "G02 module is missing",
        )
    })?;
    let old_payload = get(
        get(&old_module, "extensions").unwrap_or(&Value::Null),
        "umf.tables",
    )
    .unwrap_or(&Value::Null);
    let old_commands = items(get(old_payload, "commands"));
    let new_payload = member_mut(new_module, "extensions")
        .and_then(|ext| member_mut(ext, "umf.tables"))
        .ok_or_else(|| {
            error(
                "TABLE_MIGRATION_OPTIONS",
                "/next/source/modules/extensions/umf.tables",
                "G02 table payload is missing",
            )
        })?;
    let Value::Object(payload) = new_payload else {
        return Err(error(
            "TABLE_MIGRATION_OPTIONS",
            "/next/source",
            "G02 table payload is malformed",
        ));
    };
    let commands = payload
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from("commands"))
        .map(|(_, value)| value);
    let Some(Value::Array(commands)) = commands else {
        return Err(error(
            "TABLE_MIGRATION_OPTIONS",
            "/next/source",
            "G02 command list is missing",
        ));
    };
    if old_commands
        .iter()
        .any(|command| get(command, "id").and_then(text).as_deref() == Some(operation_id))
        || commands
            .iter()
            .filter(|command| get(command, "id").and_then(text).as_deref() == Some(operation_id))
            .count()
            != 1
    {
        return Err(error(
            "TABLE_MIGRATION_OPTIONS",
            "/next/source",
            "G02 operation must be newly appended exactly once",
        ));
    }
    commands.retain(|command| get(command, "id").and_then(text).as_deref() != Some(operation_id));

    let old_elements = items(get(&old_module, "elements"));
    if existing {
        let id = get(field_ref, "element").cloned().unwrap_or(Value::Null);
        let old_field = old_elements
            .iter()
            .find(|element| get(element, "id") == Some(&id))
            .ok_or_else(|| {
                error(
                    "TABLE_MIGRATION_OPTIONS",
                    "/previous/source",
                    "G02 Field is missing",
                )
            })?;
        let new_module = &new_modules[new_index];
        let elements = items(get(new_module, "elements"));
        if !elements
            .iter()
            .any(|element| get(element, "id") == Some(&id))
        {
            return Err(error(
                "TABLE_MIGRATION_OPTIONS",
                "/next/source",
                "G02 Field is missing",
            ));
        }
        let nullability = get(old_field, "nullability").cloned();
        let new_module = &mut new_modules[new_index];
        let Value::Array(elements) = member_mut(new_module, "elements").ok_or_else(|| {
            error(
                "TABLE_MIGRATION_OPTIONS",
                "/next/source",
                "G02 elements are malformed",
            )
        })?
        else {
            return Err(error(
                "TABLE_MIGRATION_OPTIONS",
                "/next/source",
                "G02 elements are malformed",
            ));
        };
        let new_field = elements
            .iter_mut()
            .find(|element| get(element, "id") == Some(&id))
            .unwrap();
        if let Some(nullability) = nullability {
            set(new_field, "nullability", nullability);
        }
    } else {
        let field_id = get(field_ref, "element").cloned().unwrap_or(Value::Null);
        if old_elements
            .iter()
            .any(|element| get(element, "id") == Some(&field_id))
        {
            return Err(error(
                "TABLE_MIGRATION_OPTIONS",
                "/next/source",
                "G02 appended Field already exists",
            ));
        }
        let new_module = &new_modules[new_index];
        let elements = items(get(new_module, "elements"));
        let field_index = elements
            .iter()
            .position(|element| get(element, "id") == Some(&field_id))
            .ok_or_else(|| {
                error(
                    "TABLE_MIGRATION_OPTIONS",
                    "/next/source",
                    "G02 appended Field is missing",
                )
            })?;
        if field_index < old_elements.len() {
            return Err(error(
                "TABLE_MIGRATION_OPTIONS",
                "/next/source",
                "G02 Field must be appended after retained elements",
            ));
        }
        let old_record_id = items(get(old_payload, "tables"))
            .iter()
            .find(|table| get(table, "id").and_then(text).as_deref() == Some(table_id))
            .and_then(|table| get(table, "record"))
            .and_then(|record| get(record, "element"));
        let new_payload_view = get(
            get(new_module, "extensions").unwrap_or(&Value::Null),
            "umf.tables",
        )
        .unwrap_or(&Value::Null);
        let new_table = items(get(new_payload_view, "tables"))
            .iter()
            .find(|table| get(table, "id").and_then(text).as_deref() == Some(table_id))
            .ok_or_else(|| {
                error(
                    "TABLE_MIGRATION_OPTIONS",
                    "/next/source",
                    "G02 table is missing",
                )
            })?;
        let new_record_id = get(new_table, "record").and_then(|record| get(record, "element"));
        if old_record_id != new_record_id {
            return Err(error(
                "TABLE_MIGRATION_OPTIONS",
                "/next/source",
                "G02 preserves target Record identity",
            ));
        }
        let old_member_count = old_record_id
            .and_then(|record_id| {
                old_elements
                    .iter()
                    .find(|element| get(element, "id") == Some(record_id))
            })
            .map(|record| items(get(record, "members")).len())
            .unwrap_or(usize::MAX);
        let new_record = old_record_id
            .and_then(|record_id| {
                elements
                    .iter()
                    .find(|element| get(element, "id") == Some(record_id))
            })
            .ok_or_else(|| {
                error(
                    "TABLE_MIGRATION_OPTIONS",
                    "/next/source",
                    "G02 Record is missing",
                )
            })?;
        let member_index = items(get(new_record, "members"))
            .iter()
            .position(|member| member == field_ref)
            .ok_or_else(|| {
                error(
                    "TABLE_MIGRATION_OPTIONS",
                    "/next/source",
                    "G02 target Record member is missing",
                )
            })?;
        if member_index < old_member_count {
            return Err(error(
                "TABLE_MIGRATION_OPTIONS",
                "/next/source",
                "G02 Record member must be appended",
            ));
        }
        if items(get(new_table, "columns"))
            .last()
            .and_then(|column| get(column, "field"))
            != Some(field_ref)
        {
            return Err(error(
                "TABLE_MIGRATION_OPTIONS",
                "/next/source",
                "G02 mapping must be appended last",
            ));
        }
        let new_module = &mut new_modules[new_index];
        let Value::Array(elements) = member_mut(new_module, "elements").ok_or_else(|| {
            error(
                "TABLE_MIGRATION_OPTIONS",
                "/next/source",
                "G02 elements are malformed",
            )
        })?
        else {
            return Err(error(
                "TABLE_MIGRATION_OPTIONS",
                "/next/source",
                "G02 elements are malformed",
            ));
        };
        let record = elements
            .iter_mut()
            .find(|element| {
                get(element, "id") == old_record_id
                    && get(element, "kind").and_then(text).as_deref() == Some("record")
            })
            .ok_or_else(|| {
                error(
                    "TABLE_MIGRATION_OPTIONS",
                    "/next/source",
                    "G02 Record is missing",
                )
            })?;
        if let Some(Value::Array(members)) = member_mut(record, "members") {
            members.retain(|member| member != field_ref);
        }
        elements.retain(|element| get(element, "id") != Some(&field_id));
        let new_payload = member_mut(new_module, "extensions")
            .and_then(|ext| member_mut(ext, "umf.tables"))
            .unwrap();
        let tables = member_mut(new_payload, "tables")
            .and_then(|value| match value {
                Value::Array(values) => values
                    .iter_mut()
                    .find(|table| get(table, "id").and_then(text).as_deref() == Some(table_id)),
                _ => None,
            })
            .unwrap();
        if let Some(Value::Array(columns)) = member_mut(tables, "columns") {
            columns.retain(|column| get(column, "field") != Some(field_ref));
        }
    }
    if !eq(&old, &fresh, ctx)? {
        return Err(error(
            "TABLE_MIGRATION_OPTIONS",
            "/next/source",
            "G02 source changes exceed the selected operation and requiredness/mapping change",
        ));
    }
    Ok(())
}

fn collect_g02_expression_refs(
    value: &Value,
    out: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    charge(
        ctx,
        1,
        "/options/backfills/0/operation/body/values/0/value/expression",
    )?;
    match value {
        Value::Object(fields) => {
            if get(value, "op").and_then(text).as_deref() == Some("field") {
                if let Some(field) = get(value, "field") {
                    out.try_reserve(1).map_err(|_| {
                        error("LIMIT", "/options/backfills/0", "Allocation refused")
                    })?;
                    out.push(copy_value(field, ctx)?);
                }
            }
            for (_, child) in fields {
                collect_g02_expression_refs(child, out, ctx)?;
            }
        }
        Value::Array(items) => {
            for child in items {
                collect_g02_expression_refs(child, out, ctx)?;
            }
        }
        _ => {}
    }
    Ok(())
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
    domain_aware: bool,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    discovery::discover(previous, next, domain_aware, ctx)
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
    let v3 = version == "umf.table-migration-options/0.3";
    let v4 = version == "umf.table-migration-options/0.4";
    let v6 = version == "umf.table-migration-options/0.6";
    let allowed: &[&str] = if v1 {
        &["version", "backfills", "concurrentIndexes"]
    } else if v2 || v3 || v4 || v6 {
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
        || ((v2 || v3 || v4 || v6)
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
            if v2 || v3 || v4 || v6 {
                "Phased plans require a previous installed source; initial publication is not supported"
            } else {
                "Options require a previous installed source"
            },
            "/options",
        ));
    };
    if v4 || v6 {
        for (bundle, path) in [
            (previous, "/previous/source/format"),
            (next, "/next/source/format"),
        ] {
            if text(
                get(get(bundle, "source").unwrap_or(&Value::Null), "format")
                    .unwrap_or(&Value::Null),
            )
            .as_deref()
                != Some("json")
            {
                return Err(fail(
                    if v6 {
                        "Version 0.6 Field replacement requires exact JSON source"
                    } else {
                        "Version 0.4 derived backfills require exact retained JSON source"
                    },
                    path,
                ));
            }
        }
    }
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
    if v2 || v3 || v4 || v6 {
        if items(get(value, "reviewedChanges")).len() > 512 {
            return Err(fail(
                "reviewedChanges must be an array of at most512 exact markers",
                "/options",
            ));
        }
        // The 0.6 plan reviews the complete 0.3 source discovery. The base
        // discovery alone omits added constraints and operation-context
        // changes, so a valid selected marker would otherwise be rejected.
        let candidates = if v6 {
            let base = discover_verified(previous, next, true, ctx)?;
            let added = discovery::discover_added_constraints(previous, next, ctx)?;
            let mut changes = interleave_g03_added_constraints(
                base,
                added,
                get(next, "expectedCatalog")
                    .and_then(|catalog| get(catalog, "tables"))
                    .and_then(|tables| match tables {
                        Value::Array(tables) => Some(tables.as_slice()),
                        _ => None,
                    })
                    .unwrap_or(&[]),
                ctx,
            )?;
            changes.extend(discovery::discover_default_changes(previous, next, ctx)?);
            changes.extend(discovery::discover_operation_context_changes(
                previous, next, ctx,
            )?);
            changes
        } else {
            discover_verified(previous, next, false, ctx)?
        };
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
        if v6 {
            if !items(get(value, "concurrentIndexes")).is_empty()
                || !items(get(value, "validations")).is_empty()
            {
                return Err(fail(
                    "G11 does not admit concurrent indexes or deferred validations",
                    "/options",
                ));
            }
            if items(get(value, "reviewedChanges"))
                .iter()
                .any(|marker| get(marker, "conversion").is_some())
            {
                return Err(fail(
                    "G11 reviewed markers do not admit conversion qualifiers",
                    "/options/reviewedChanges",
                ));
            }
            g06::validate_mapping_replacement(previous, next, value, ctx)?;
        }
    }
    let mut seen_backfills = Vec::<String>::new();
    let reviewed_changes = items(get(value, "reviewedChanges"));
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
        if fresh_table.is_none()
            || old_table.is_none()
            || fresh_column.is_none()
            || (old_column && !v3 && !v4)
        {
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
            Some("literal" | "currentTimestamp" | "rowExpression")
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
            && (v3 || v4 || v6 || supported_value)
            && text(get(where_clause, "op").unwrap_or(&Value::Null)).as_deref() == Some("isNull")
            && ref_id(get(where_clause, "field").unwrap_or(&Value::Null)) == column_key;
        if v3 {
            let selected_path = get(fresh_column.unwrap(), "sourcePath");
            let candidates = discover_verified(previous, next, false, ctx)?;
            let reviewed = reviewed_changes.iter().any(|marker| {
                text(get(marker, "kind").unwrap_or(&Value::Null)).as_deref()
                    == Some("tighten-not-null")
                    && get(marker, "path") == selected_path
                    && candidates.iter().any(|candidate| {
                        text(get(candidate, "kind").unwrap_or(&Value::Null)).as_deref()
                            == Some("tighten-not-null")
                            && get(candidate, "path") == selected_path
                            && get(candidate, "id") == get(marker, "id")
                            && get(candidate, "oldDigest") == get(marker, "oldDigest")
                            && get(candidate, "newDigest") == get(marker, "newDigest")
                    })
            });
            if old_column && !reviewed {
                return Err(fail(
                    "Existing-field fill requires its exact reviewed NOT NULL change",
                    &path,
                ));
            }
            let max_rows = get(body, "maxRows").and_then(|value| match value {
                Value::Number(number)
                    if number.fract() == 0.0 && *number >= 1.0 && *number <= 10_000.0 =>
                {
                    Some(())
                }
                _ => None,
            });
            let value_domain_valid =
                match text(get(value, "kind").unwrap_or(&Value::Null)).as_deref() {
                    Some("literal") => match crate::deployment::literal_sql_for_migration(
                        get(value, "value").unwrap_or(&Value::Null),
                        ctx,
                    ) {
                        Ok(_) => true,
                        Err(error) if error.is_control_failure() => return Err(error),
                        Err(_) => false,
                    },
                    Some("currentTimestamp") => {
                        text(
                            get(
                                get(fresh_column.unwrap(), "nativeType").unwrap_or(&Value::Null),
                                "kind",
                            )
                            .unwrap_or(&Value::Null),
                        )
                        .as_deref()
                            == Some("timestamptz")
                    }
                    _ => false,
                };
            if command.is_none_or(|item| {
                text(get(item, "version").unwrap_or(&Value::Null)).as_deref()
                    != Some("umf.table-operation/0.1")
            }) || max_rows.is_none()
                || !value_domain_valid
                || (text(get(value, "kind").unwrap_or(&Value::Null)).as_deref() == Some("literal")
                    && get(value, "value") == Some(&Value::Null))
            {
                return Err(fail("Version 0.3 backfills require a bounded parameter-free operation 0.1 NULL-only UPDATE with a compatible non-null literal or timestamp", &path));
            }
        }
        if !valid_command {
            return Err(fail(
                "Backfill requires an original parameter-free bounded UPDATE of only its selected NULL column",
                &path,
            ));
        }
        if v4 || v6 {
            let operation_version = command.and_then(|item| get(item, "version")).and_then(text);
            let is_expression =
                get(value, "kind").and_then(text).as_deref() == Some("rowExpression");
            if operation_version.as_deref() != Some("umf.table-operation/0.2")
                || !is_expression
                || get(body, "maxRows")
                    .and_then(|v| match v {
                        Value::Number(n) if n.fract() == 0.0 && *n >= 1.0 && *n <= 10_000.0 => {
                            Some(())
                        }
                        _ => None,
                    })
                    .is_none()
            {
                return Err(fail(
                    "G02 requires one bounded operation 0.2 derived UPDATE",
                    &path,
                ));
            }
            let expression = get(value, "expression").unwrap_or(&Value::Null);
            let mut expression_refs = Vec::new();
            collect_g02_expression_refs(expression, &mut expression_refs, ctx)?;
            if expression_refs.is_empty() {
                return Err(fail(
                    "G02 requires a derived expression with existing input fields",
                    &path,
                ));
            }
            for input_ref in expression_refs {
                if ref_key(&input_ref) == ref_key(column_ref)
                    || (!v6 && get(&input_ref, "module") != get(column_ref, "module"))
                {
                    return Err(fail("G02 expression inputs must be unchanged same-table fields and cannot read the target", &path));
                }
                let old_input = previous_columns.iter().find(|column| {
                    text(get(column, "table").unwrap_or(&Value::Null)).as_deref()
                        == Some(table_id.as_str())
                        && ref_key(get(column, "field").unwrap_or(&Value::Null))
                            == ref_key(&input_ref)
                });
                let new_input = catalog_columns.iter().find(|column| {
                    text(get(column, "table").unwrap_or(&Value::Null)).as_deref()
                        == Some(table_id.as_str())
                        && ref_key(get(column, "field").unwrap_or(&Value::Null))
                            == ref_key(&input_ref)
                });
                let old_mapping = old_table.and_then(|table| {
                    items(get(table, "columns")).iter().find(|column| {
                        ref_key(get(column, "field").unwrap_or(&Value::Null)) == ref_key(&input_ref)
                    })
                });
                let new_mapping = fresh_table.and_then(|table| {
                    items(get(table, "columns")).iter().find(|column| {
                        ref_key(get(column, "field").unwrap_or(&Value::Null)) == ref_key(&input_ref)
                    })
                });
                if old_input.is_none()
                    || new_input.is_none()
                    || old_mapping.is_none()
                    || new_mapping.is_none()
                    || !(if v6 {
                        eq(
                            &without(old_input.unwrap(), &["sourcePath"]),
                            &without(new_input.unwrap(), &["sourcePath"]),
                            ctx,
                        )?
                    } else {
                        eq(old_input.unwrap(), new_input.unwrap(), ctx)?
                    })
                    || !eq(old_mapping.unwrap(), new_mapping.unwrap(), ctx)?
                {
                    return Err(fail("G02 expression inputs must be unchanged existing columns on the selected table", &path));
                }
            }
            if v4 {
                validate_g02_source_delta(
                    previous,
                    next,
                    &table_id,
                    column_ref,
                    &operation_id,
                    old_column,
                    ctx,
                )?;
            } else {
                let next_document = source_document(next, ctx)?;
                let target_field = logical_field(&next_document, column_ref);
                let mapping = fresh_table.and_then(|table| {
                    items(get(table, "columns")).iter().find(|item| {
                        ref_id(get(item, "field").unwrap_or(&Value::Null)) == column_key
                    })
                });
                if old_column
                    || target_field.is_none_or(|field| {
                        text(get(field, "kind").unwrap_or(&Value::Null)).as_deref() != Some("field")
                            || text(get(field, "nullability").unwrap_or(&Value::Null)).as_deref()
                                != Some("required")
                    })
                    || mapping.is_none_or(|item| {
                        js_truthy(get(item, "generated"))
                            || get(item, "immutable") == Some(&Value::Bool(true))
                    })
                {
                    return Err(fail(
                        "G11 backfill target must be a newly declared ordinary required Field",
                        &path,
                    ));
                }
            }
        }
    }
    if v3 {
        let existing_backfills = items(get(value, "backfills"))
            .iter()
            .filter(|backfill| {
                let table =
                    text(get(backfill, "table").unwrap_or(&Value::Null)).unwrap_or_default();
                let field = get(backfill, "column").unwrap_or(&Value::Null);
                previous_columns.iter().any(|column| {
                    text(get(column, "table").unwrap_or(&Value::Null)).as_deref()
                        == Some(table.as_str())
                        && ref_key(get(column, "field").unwrap_or(&Value::Null)) == ref_key(field)
                })
            })
            .count();
        if existing_backfills > 0 {
            if existing_backfills != 1
                || items(get(value, "backfills")).len() != 1
                || !items(get(value, "concurrentIndexes")).is_empty()
                || !items(get(value, "validations")).is_empty()
                || items(get(value, "reviewedChanges")).len() != 1
            {
                return Err(fail("Existing-field fill and NOT NULL tightening must be the only migration effect in this profile", "/options"));
            }
            let selected = &items(get(value, "backfills"))[0];
            if !g01_source_delta_is_exact(previous, next, selected, ctx)? {
                return Err(fail(
                    "Existing-field fill may change only the selected operation and requiredness",
                    "/next/source",
                ));
            }
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
    matches!(
        options
            .and_then(|value| get(value, "version"))
            .and_then(text)
            .as_deref(),
        Some(
            "umf.table-migration-options/0.2"
                | "umf.table-migration-options/0.3"
                | "umf.table-migration-options/0.4"
        )
    )
}
fn plan_version_is_g01(options: Option<&Value>) -> bool {
    options
        .and_then(|value| get(value, "version"))
        .and_then(text)
        .as_deref()
        == Some("umf.table-migration-options/0.3")
}
fn plan_version_is_g11(options: Option<&Value>) -> bool {
    options
        .and_then(|value| get(value, "version"))
        .and_then(text)
        .as_deref()
        == Some("umf.table-migration-options/0.6")
}

fn annotate_g02_step(step: &mut Value, role: &str, target: &Value) -> Result<(), EngineError> {
    let Value::Object(fields) = step else {
        return Err(error(
            "TABLE_MIGRATION_OPTIONS",
            "/steps",
            "G02 compiler step is malformed",
        ));
    };
    fields.push((Utf16::from("phaseOperation"), s(role)));
    fields.push((Utf16::from("phaseTarget"), target.clone()));
    Ok(())
}

fn g02_steps(
    steps: &mut Vec<Value>,
    previous: &Value,
    next: &Value,
    options: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let backfill = items(get(options, "backfills")).first().ok_or_else(|| {
        error(
            "TABLE_MIGRATION_OPTIONS",
            "/options/backfills",
            "G02 backfill is missing",
        )
    })?;
    let table_id = text(get(backfill, "table").unwrap_or(&Value::Null)).unwrap_or_default();
    let field = get(backfill, "column").unwrap_or(&Value::Null);
    let column = items(get(
        get(next, "expectedCatalog").unwrap_or(&Value::Null),
        "columns",
    ))
    .iter()
    .find(|column| {
        text(get(column, "table").unwrap_or(&Value::Null)).as_deref() == Some(table_id.as_str())
            && ref_key(get(column, "field").unwrap_or(&Value::Null)) == ref_key(field)
    })
    .ok_or_else(|| {
        error(
            "TABLE_MIGRATION_OPTIONS",
            "/options/backfills/0/column",
            "G02 target column is missing",
        )
    })?;
    let source_path = text(get(column, "sourcePath").unwrap_or(&Value::Null)).unwrap_or_default();
    let target = object(vec![
        ("table", copy_value(&s(&table_id), ctx)?),
        ("field", copy_value(field, ctx)?),
    ]);
    let existing = items(get(
        get(previous, "expectedCatalog").unwrap_or(&Value::Null),
        "columns",
    ))
    .iter()
    .any(|old| {
        get(old, "table") == Some(&s(&table_id))
            && ref_key(get(old, "field").unwrap_or(&Value::Null)) == ref_key(field)
    });
    let mut tighten = None;
    if !existing {
        for (index, step) in steps.iter_mut().enumerate() {
            let sql = text(get(step, "sql").unwrap_or(&Value::Null)).unwrap_or_default();
            let kind = text(get(step, "kind").unwrap_or(&Value::Null)).unwrap_or_default();
            if kind == "table"
                && sql.contains(" ADD COLUMN ")
                && sql.contains(&quote_ident(
                    text(get(column, "name").unwrap_or(&Value::Null))
                        .as_deref()
                        .unwrap_or_default(),
                ))
            {
                annotate_g02_step(step, "add-column", &target)?;
            } else if kind == "table"
                && sql.contains(" SET NOT NULL")
                && sql.contains(&quote_ident(
                    text(get(column, "name").unwrap_or(&Value::Null))
                        .as_deref()
                        .unwrap_or_default(),
                ))
            {
                annotate_g02_step(step, "tighten-not-null", &target)?;
                tighten = Some(index);
            } else if kind == "table"
                && sql.contains("CHECK")
                && sql.contains(&quote_ident(
                    text(get(column, "name").unwrap_or(&Value::Null))
                        .as_deref()
                        .unwrap_or_default(),
                ))
            {
                annotate_g02_step(step, "target-check", &target)?;
            } else if kind == "table"
                && sql.contains(" SET DEFAULT")
                && sql.contains(&quote_ident(
                    text(get(column, "name").unwrap_or(&Value::Null))
                        .as_deref()
                        .unwrap_or_default(),
                ))
            {
                annotate_g02_step(step, "install-default", &target)?;
            }
        }
    } else {
        for (index, step) in steps.iter_mut().enumerate() {
            let sql = text(get(step, "sql").unwrap_or(&Value::Null)).unwrap_or_default();
            if sql.contains(" SET NOT NULL")
                && get(step, "sourcePath").and_then(text).as_deref() == Some(source_path.as_str())
            {
                annotate_g02_step(step, "tighten-not-null", &target)?;
                tighten = Some(index);
            }
        }
    }
    let tighten = tighten.ok_or_else(|| {
        error(
            "TABLE_MIGRATION_OPTIONS",
            "/options/backfills/0",
            "G02 requiredness step is missing",
        )
    })?;
    let operation = copy_value(get(backfill, "operation").unwrap_or(&Value::Null), ctx)?;
    let mut fill = object(vec![
        ("id", s("")),
        ("kind", s("backfill")),
        ("sourcePath", s("/options/backfills/0")),
        ("transaction", s("required")),
        ("sql", s("")),
        ("operation", operation),
        ("phaseOperation", s("backfill")),
        ("phaseTarget", target.clone()),
    ]);
    if let Some(index) = steps.iter().position(|step| {
        text(get(step, "kind").unwrap_or(&Value::Null)).as_deref() == Some("backfill")
            && text(get(step, "operation").unwrap_or(&Value::Null)).as_deref()
                == text(get(backfill, "operation").unwrap_or(&Value::Null)).as_deref()
    }) {
        annotate_g02_step(&mut steps[index], "backfill", &target)?;
    } else {
        steps.insert(tighten, fill.clone());
    }
    if existing {
        let fill_index = steps
            .iter()
            .position(|step| {
                get(step, "phaseOperation").and_then(text).as_deref() == Some("backfill")
                    && get(step, "phaseTarget") == Some(&target)
            })
            .unwrap();
        let tighten_index = steps
            .iter()
            .position(|step| {
                get(step, "phaseOperation").and_then(text).as_deref() == Some("tighten-not-null")
                    && get(step, "phaseTarget") == Some(&target)
            })
            .unwrap();
        if fill_index > tighten_index {
            let value = steps.remove(fill_index);
            steps.insert(tighten_index, value);
        }
    } else {
        let mut group = Vec::new();
        let mut rest = Vec::new();
        for step in steps.drain(..) {
            if get(&step, "phaseTarget") == Some(&target) {
                group.push(step);
            } else {
                rest.push(step);
            }
        }
        group.sort_by_key(|step| {
            match text(get(step, "phaseOperation").unwrap_or(&Value::Null)).as_deref() {
                Some("add-column") => 0,
                Some("target-check") => 1,
                Some("backfill") => 2,
                Some("install-default") => 3,
                Some("tighten-not-null") => 4,
                _ => 5,
            }
        });
        let grant_path = source_path
            .split_once("/columns/")
            .map(|(table_path, _)| format!("{table_path}/policy/person/update"));
        let first = rest
            .iter()
            .position(|step| {
                text(get(step, "sourcePath").unwrap_or(&Value::Null)).as_deref()
                    == Some(source_path.as_str())
            })
            .or_else(|| {
                grant_path.as_ref().and_then(|path| {
                    rest.iter().position(|step| {
                        text(get(step, "kind").unwrap_or(&Value::Null)).as_deref() == Some("grant")
                            && text(get(step, "sourcePath").unwrap_or(&Value::Null)).as_deref()
                                == Some(path.as_str())
                            && text(get(step, "sql").unwrap_or(&Value::Null))
                                .is_some_and(|sql| sql.starts_with("GRANT UPDATE "))
                    })
                })
            })
            .unwrap_or(rest.len());
        rest.splice(first..first, group);
        *steps = rest;
    }
    Ok(())
}

fn g01_source_delta_is_exact(
    previous: &Value,
    next: &Value,
    backfill: &Value,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let field = get(backfill, "column").unwrap_or(&Value::Null);
    let module_id = text(get(field, "module").unwrap_or(&Value::Null)).unwrap_or_default();
    let element_id = text(get(field, "element").unwrap_or(&Value::Null)).unwrap_or_default();
    let operation_id = text(get(backfill, "operation").unwrap_or(&Value::Null)).unwrap_or_default();
    let mut old_doc = source_document(previous, ctx)?;
    let mut new_doc = source_document(next, ctx)?;
    let mutate =
        |doc: &mut Value, restore: Option<&Value>, expected_count: Option<usize>| -> bool {
            let Some(Value::Array(modules)) = member_mut(doc, "modules") else {
                return false;
            };
            let Some(module) = modules.iter_mut().find(|module| {
                text(get(module, "id").unwrap_or(&Value::Null)).as_deref()
                    == Some(module_id.as_str())
            }) else {
                return false;
            };
            {
                let Some(Value::Array(elements)) = member_mut(module, "elements") else {
                    return false;
                };
                let Some(element) = elements.iter_mut().find(|element| {
                    text(get(element, "id").unwrap_or(&Value::Null)).as_deref()
                        == Some(element_id.as_str())
                }) else {
                    return false;
                };
                if let Some(restore) = restore {
                    if let Some(nullability) = get(restore, "nullability") {
                        set(element, "nullability", nullability.clone());
                    } else {
                        remove_member(element, "nullability");
                    }
                }
            }
            if let Some(Value::Object(extensions)) = member_mut(module, "extensions") {
                if let Some(Value::Object(payload)) = extensions
                    .iter_mut()
                    .find(|(key, _)| key == &Utf16::from("umf.tables"))
                    .map(|(_, value)| value)
                {
                    if let Some(Value::Array(commands)) = payload
                        .iter_mut()
                        .find(|(key, _)| key == &Utf16::from("commands"))
                        .map(|(_, value)| value)
                    {
                        let count = commands
                            .iter()
                            .filter(|command| {
                                text(get(command, "id").unwrap_or(&Value::Null)).as_deref()
                                    == Some(operation_id.as_str())
                            })
                            .count();
                        if expected_count.is_some_and(|expected| count != expected) {
                            return false;
                        }
                        commands.retain(|command| {
                            text(get(command, "id").unwrap_or(&Value::Null)).as_deref()
                                != Some(operation_id.as_str())
                        });
                    }
                }
            }
            true
        };
    let old_module = items(get(&old_doc, "modules")).iter().find(|module| {
        text(get(module, "id").unwrap_or(&Value::Null)).as_deref() == Some(module_id.as_str())
    });
    let Some(old_module) = old_module else {
        return Ok(false);
    };
    let Some(old_element) = items(get(&old_module, "elements")).iter().find(|element| {
        text(get(element, "id").unwrap_or(&Value::Null)).as_deref() == Some(element_id.as_str())
    }) else {
        return Ok(false);
    };
    let old_element = copy_value(old_element, ctx)?;
    let old_payload = get(
        get(old_module, "extensions").unwrap_or(&Value::Null),
        "umf.tables",
    )
    .unwrap_or(&Value::Null);
    if items(get(old_payload, "commands")).iter().any(|command| {
        text(get(command, "id").unwrap_or(&Value::Null)).as_deref() == Some(operation_id.as_str())
    }) {
        return Ok(false);
    }
    let table_id = text(get(backfill, "table").unwrap_or(&Value::Null)).unwrap_or_default();
    let mapping_for = |bundle: &Value| {
        items(get(
            get(bundle, "expectedCatalog").unwrap_or(&Value::Null),
            "tables",
        ))
        .iter()
        .find(|table| {
            text(get(table, "id").unwrap_or(&Value::Null)).as_deref() == Some(table_id.as_str())
        })
        .and_then(|table| {
            items(get(table, "columns")).iter().find(|column| {
                ref_key(get(column, "field").unwrap_or(&Value::Null)).as_deref()
                    == ref_key(field).as_deref()
            })
        })
        .cloned()
    };
    let old_mapping = mapping_for(previous);
    let new_mapping = mapping_for(next);
    if old_mapping.as_ref().is_none_or(|mapping| {
        get(mapping, "generated").is_some() || get(mapping, "immutable") == Some(&Value::Bool(true))
    }) || new_mapping.as_ref().is_none_or(|mapping| {
        get(mapping, "generated").is_some() || get(mapping, "immutable") == Some(&Value::Bool(true))
    }) {
        return Ok(false);
    }
    let new_module = items(get(&new_doc, "modules")).iter().find(|module| {
        text(get(module, "id").unwrap_or(&Value::Null)).as_deref() == Some(module_id.as_str())
    });
    let new_element = new_module.and_then(|module| {
        items(get(module, "elements")).iter().find(|element| {
            text(get(element, "id").unwrap_or(&Value::Null)).as_deref() == Some(element_id.as_str())
        })
    });
    if text(get(&old_element, "kind").unwrap_or(&Value::Null)).as_deref() != Some("field")
        || text(get(&old_element, "nullability").unwrap_or(&Value::Null)).as_deref()
            != Some("absent-allowed")
        || new_element.is_none_or(|element| {
            text(get(element, "kind").unwrap_or(&Value::Null)).as_deref() != Some("field")
                || text(get(element, "nullability").unwrap_or(&Value::Null)).as_deref()
                    != Some("required")
        })
        || !mutate(&mut old_doc, None, None)
        || !mutate(&mut new_doc, Some(&old_element), Some(1))
    {
        return Ok(false);
    }
    if !eq(&old_doc, &new_doc, ctx)? {
        return Ok(false);
    }
    let mut old_catalog = copy_value(
        get(previous, "expectedCatalog").unwrap_or(&Value::Null),
        ctx,
    )?;
    let mut new_catalog = copy_value(get(next, "expectedCatalog").unwrap_or(&Value::Null), ctx)?;
    let table_id = text(get(backfill, "table").unwrap_or(&Value::Null)).unwrap_or_default();
    let key = ref_key(field).unwrap_or_default();
    let old_col = items(get(&old_catalog, "columns")).iter().find(|column| {
        text(get(column, "table").unwrap_or(&Value::Null)).as_deref() == Some(table_id.as_str())
            && ref_key(get(column, "field").unwrap_or(&Value::Null)).as_deref()
                == Some(key.as_str())
    });
    let new_col = items(get(&new_catalog, "columns")).iter().find(|column| {
        text(get(column, "table").unwrap_or(&Value::Null)).as_deref() == Some(table_id.as_str())
            && ref_key(get(column, "field").unwrap_or(&Value::Null)).as_deref()
                == Some(key.as_str())
    });
    if old_col.is_none_or(|column| get(column, "nullable") != Some(&Value::Bool(true)))
        || new_col.is_none_or(|column| get(column, "nullable") != Some(&Value::Bool(false)))
    {
        return Ok(false);
    }
    for catalog in [&mut old_catalog, &mut new_catalog] {
        let Some(Value::Array(columns)) = member_mut(catalog, "columns") else {
            return Ok(false);
        };
        let Some(column) = columns.iter_mut().find(|column| {
            text(get(column, "table").unwrap_or(&Value::Null)).as_deref() == Some(table_id.as_str())
                && ref_key(get(column, "field").unwrap_or(&Value::Null)).as_deref()
                    == Some(key.as_str())
        }) else {
            return Ok(false);
        };
        for member in ["nullable", "definitionSql", "sourcePath"] {
            remove_member(column, member);
        }
    }
    eq(&old_catalog, &new_catalog, ctx)
}

fn insert_g01_backfill_steps(
    steps: &mut Vec<Value>,
    options: &Value,
    next: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let backfills = items(get(options, "backfills"));
    if backfills.len() != 1 {
        return Err(error(
            "TABLE_MIGRATION_OPTIONS",
            "/options/backfills",
            "Version 0.3 selects exactly one retained-field backfill",
        ));
    }
    let backfill = &backfills[0];
    let table = text(get(backfill, "table").unwrap_or(&Value::Null)).unwrap_or_default();
    let field = get(backfill, "column").unwrap_or(&Value::Null);
    let key = ref_key(field).unwrap_or_default();
    let column = items(get(
        get(next, "expectedCatalog").unwrap_or(&Value::Null),
        "columns",
    ))
    .iter()
    .find(|item| {
        text(get(item, "table").unwrap_or(&Value::Null)).as_deref() == Some(table.as_str())
            && ref_key(get(item, "field").unwrap_or(&Value::Null)).as_deref() == Some(key.as_str())
    })
    .ok_or_else(|| {
        error(
            "TABLE_MIGRATION_OPTIONS",
            "/options/backfills/0/column",
            "Selected field is missing from the verified next catalog",
        )
    })?;
    let source_path = text(get(column, "sourcePath").unwrap_or(&Value::Null)).unwrap_or_default();
    let target = object(vec![
        ("table", s(&table)),
        ("field", copy_value(field, ctx)?),
    ]);
    let tighten = steps.iter_mut().find(|step| {
        text(get(step, "kind").unwrap_or(&Value::Null)).as_deref() == Some("table")
            && text(get(step, "sourcePath").unwrap_or(&Value::Null)).as_deref()
                == Some(source_path.as_str())
            && text(get(step, "sql").unwrap_or(&Value::Null))
                .is_some_and(|sql| sql.contains("SET NOT NULL"))
    });
    let Some(tighten) = tighten else {
        return Err(error(
            "TABLE_MIGRATION_OPTIONS",
            "/options/backfills/0/column",
            "Selected backfill must pair with one NOT NULL tightening step",
        ));
    };
    set_or_insert(tighten, "phaseOperation", s("tighten-not-null"));
    set_or_insert(tighten, "phaseTarget", copy_value(&target, ctx)?);
    let tighten_index = steps
        .iter()
        .position(|step| {
            text(get(step, "sourcePath").unwrap_or(&Value::Null)).as_deref()
                == Some(source_path.as_str())
                && text(get(step, "phaseOperation").unwrap_or(&Value::Null)).as_deref()
                    == Some("tighten-not-null")
        })
        .ok_or_else(|| error("TABLE_MIGRATION_OPTIONS", "/steps", "Missing tighten step"))?;
    // The ordinary evolution compiler already emits the selected backfill.
    // Bind that exact source-derived step to the G01 phase instead of
    // introducing a second backfill before the NOT NULL step.
    let selected_operation = get(backfill, "operation");
    let mut matching_backfill = None;
    for (index, step) in steps.iter().enumerate() {
        charge(ctx, 1, "/options/backfills/0")?;
        if text(get(step, "kind").unwrap_or(&Value::Null)).as_deref() == Some("backfill")
            && text(get(step, "sourcePath").unwrap_or(&Value::Null)).as_deref()
                == Some("/options/backfills/0")
            && get(step, "operation") == selected_operation
        {
            if matching_backfill.replace(index).is_some() {
                return Err(error(
                    "TABLE_MIGRATION_OPTIONS",
                    "/options/backfills/0",
                    "Selected operation produced duplicate backfill steps",
                ));
            }
        }
    }
    let Some(mut backfill_index) = matching_backfill else {
        return Err(error(
            "TABLE_MIGRATION_OPTIONS",
            "/options/backfills/0",
            "Selected operation has no source-derived backfill step",
        ));
    };
    if backfill_index > tighten_index {
        charge(ctx, steps.len().max(1), "/options/backfills/0")?;
        let selected = steps.remove(backfill_index);
        steps.insert(tighten_index, selected);
        backfill_index = tighten_index;
    }
    charge(ctx, 128, "/options/backfills/0")?;
    set_or_insert(&mut steps[backfill_index], "phaseOperation", s("backfill"));
    set_or_insert(
        &mut steps[backfill_index],
        "phaseTarget",
        copy_value(&target, ctx)?,
    );
    Ok(())
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
    /// Compute the JCS SHA-256 used by reviewed migration markers.
    pub fn reviewed_value_digest(
        &self,
        value: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        Ok(object(vec![("digest", digest(value, ctx)?)]))
    }

    /// Discover reviewed changes between two source-recompiled deployment bundles.
    pub fn discover_table_migration_changes(
        &self,
        previous: &Value,
        next: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let previous = self.verify_table_deployment(previous, ctx)?;
        let next = self.verify_table_deployment(next, ctx)?;
        Ok(array(discover_verified(&previous, &next, false, ctx)?))
    }

    /// Versioned selector entry point. A newer profile is never interpreted
    /// by the older unselected discovery path.
    pub fn discover_table_migration_changes_selected(
        &self,
        previous: &Value,
        next: &Value,
        selector: Option<&Value>,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let previous = self.verify_table_deployment(previous, ctx)?;
        let next = self.verify_table_deployment(next, ctx)?;
        let Some(selector) = selector else {
            return Ok(array(discover_verified(&previous, &next, false, ctx)?));
        };
        let profile = get(selector, "version").and_then(text).ok_or_else(|| {
            error(
                "MIGRATION_CHANGES_FAILED",
                "/selector",
                "Unknown table-migration discovery selector",
            )
        })?;
        let valid_shape = match profile.as_str() {
            "umf.table-migration-discovery/0.2" | "umf.table-migration-discovery/0.3" => {
                exact_members(selector, &["version"])
            }
            "umf.table-migration-discovery/0.4" => {
                exact_members(selector, &["version", "conversionIntents"])
                    && valid_g04_discovery_intents(get(selector, "conversionIntents"))
            }
            _ => false,
        };
        if !valid_shape {
            return Err(error(
                "MIGRATION_CHANGES_FAILED",
                "/selector",
                "Unknown selector members or invalid resource bounds",
            ));
        }
        if !matches!(
            get(&previous, "source").and_then(|source| get(source, "format")),
            Some(Value::String(format)) if format == &Utf16::from("json")
        ) || !matches!(
            get(&next, "source").and_then(|source| get(source, "format")),
            Some(Value::String(format)) if format == &Utf16::from("json")
        ) {
            return Err(error(
                "TABLE_MIGRATION_OPTIONS",
                "/previous/source/format",
                "Versioned migration discovery requires exact JSON retained sources",
            ));
        }
        let mut changes = discover_verified(
            &previous,
            &next,
            matches!(
                profile.as_str(),
                "umf.table-migration-discovery/0.3" | "umf.table-migration-discovery/0.4"
            ),
            ctx,
        )?;
        match profile.as_str() {
            "umf.table-migration-discovery/0.2" => {
                changes.extend(discovery::discover_default_changes(&previous, &next, ctx)?);
            }
            "umf.table-migration-discovery/0.3" => {
                let added = discovery::discover_added_constraints(&previous, &next, ctx)?;
                changes = interleave_g03_added_constraints(
                    changes,
                    added,
                    get(&next, "expectedCatalog")
                        .and_then(|catalog| get(catalog, "tables"))
                        .and_then(|tables| match tables {
                            Value::Array(tables) => Some(tables.as_slice()),
                            _ => None,
                        })
                        .unwrap_or(&[]),
                    ctx,
                )?;
                changes.extend(discovery::discover_default_changes(&previous, &next, ctx)?);
                changes.extend(discovery::discover_operation_context_changes(
                    &previous, &next, ctx,
                )?);
            }
            "umf.table-migration-discovery/0.4" => {
                let added = discovery::discover_added_constraints(&previous, &next, ctx)?;
                changes = interleave_g03_added_constraints(
                    changes,
                    added,
                    get(&next, "expectedCatalog")
                        .and_then(|catalog| get(catalog, "tables"))
                        .and_then(|tables| match tables {
                            Value::Array(tables) => Some(tables.as_slice()),
                            _ => None,
                        })
                        .unwrap_or(&[]),
                    ctx,
                )?;
                changes.extend(discovery::discover_default_changes(&previous, &next, ctx)?);
                changes.extend(discovery::discover_operation_context_changes(
                    &previous, &next, ctx,
                )?);
                let intents = get(selector, "conversionIntents")
                    .and_then(|value| match value {
                        Value::Array(values) => Some(values.as_slice()),
                        _ => None,
                    })
                    .unwrap_or(&[]);
                changes.extend(discovery::discover_g04_conversions(
                    &previous, &next, intents, ctx,
                )?);
            }
            _ => unreachable!("selector was validated above"),
        }
        charge(ctx, changes.len().saturating_add(1), "/changes")?;
        Ok(array(changes))
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
        if get(input, "options")
            .and_then(|options| get(options, "version"))
            .and_then(text)
            .as_deref()
            == Some("umf.table-migration-options/0.5")
        {
            let Some(previous) = previous.as_ref() else {
                return Ok(blocked(
                    "TABLE_MIGRATION_OPTIONS",
                    "/options",
                    "Version 0.5 default changes require a previous installed source",
                ));
            };
            return match g03::compile(
                input,
                previous,
                &bundle,
                get(input, "options").unwrap(),
                ctx,
            ) {
                Ok(result) => Ok(result),
                Err(error) if error.is_control_failure() => Err(error),
                Err(error) => Ok(portable_blocked(&error, ctx)?),
            };
        }
        if get(input, "options")
            .and_then(|options| get(options, "version"))
            .and_then(text)
            .as_deref()
            == Some("umf.table-migration-options/0.7")
        {
            return match g04_compile::compile(input, previous.as_ref(), &bundle, ctx) {
                Ok(result) => Ok(result),
                Err(error) if error.is_control_failure() => Err(error),
                Err(error) => Ok(portable_blocked(&error, ctx)?),
            };
        }
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
        if plan_version_is_v2(options.as_ref()) || plan_version_is_g11(options.as_ref()) {
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
        if plan_version_is_g01(options.as_ref()) {
            let selected = items(get(options.as_ref().unwrap(), "backfills"));
            if selected.len() == 1 {
                let target = get(&selected[0], "column").unwrap_or(&Value::Null);
                let table =
                    text(get(&selected[0], "table").unwrap_or(&Value::Null)).unwrap_or_default();
                let exists = items(get(
                    get(previous.as_ref().unwrap(), "expectedCatalog").unwrap_or(&Value::Null),
                    "columns",
                ))
                .iter()
                .any(|column| {
                    text(get(column, "table").unwrap_or(&Value::Null)).as_deref()
                        == Some(table.as_str())
                        && ref_key(get(column, "field").unwrap_or(&Value::Null)) == ref_key(target)
                });
                if exists {
                    insert_g01_backfill_steps(&mut steps, options.as_ref().unwrap(), &bundle, ctx)?;
                }
            }
        }
        if get(options.as_ref().unwrap_or(&Value::Null), "version")
            .and_then(text)
            .as_deref()
            == Some("umf.table-migration-options/0.4")
        {
            g02_steps(
                &mut steps,
                previous.as_ref().unwrap(),
                &bundle,
                options.as_ref().unwrap(),
                ctx,
            )?;
        }
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
        if plan_version_is_g11(options.as_ref()) {
            let Some(previous) = previous.as_ref() else {
                return Ok(blocked(
                    "TABLE_MIGRATION_OPTIONS",
                    "/previous",
                    "G11 requires an installed predecessor",
                ));
            };
            if let Err(error) = g06::order_steps(previous, &bundle, &mut steps, ctx) {
                if error.is_control_failure() {
                    return Err(error);
                }
                return Ok(portable_blocked(&error, ctx)?);
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
            for key in ["phaseOperation", "phaseTarget", "phaseDependency"] {
                if let Some(value) = get(step, key) {
                    if let Value::Object(fields) = &mut planned {
                        fields.push((Utf16::from(key), copy_value(value, ctx)?));
                    }
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
        if plan_version_is_g01(options.as_ref())
            && migration_steps
                .iter()
                .any(|step| get(step, "phaseOperation").is_some())
            && (!seed_sets.is_empty() || migration_steps.len() != 2)
        {
            return Ok(blocked(
                "TABLE_MIGRATION_UNSUPPORTED",
                "/options/backfills",
                "Existing-field fill cannot share a migration with other effects or seeds",
            ));
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
        if plan_version_is_g01(options.as_ref())
            && migration_steps
                .iter()
                .any(|step| get(step, "phaseOperation").is_some())
        {
            let pair = migration_steps.as_slice();
            if pair.len() != 2
                || get(&pair[0], "phaseOperation").and_then(text).as_deref() != Some("backfill")
                || get(&pair[1], "phaseOperation").and_then(text).as_deref()
                    != Some("tighten-not-null")
                || get(&pair[0], "phaseTarget") != get(&pair[1], "phaseTarget")
            {
                return Ok(blocked(
                    "TABLE_MIGRATION_UNSUPPORTED",
                    "/options/backfills",
                    "Existing-field fill requires one ordered backfill and NOT NULL pair",
                ));
            }
            let ids = pair
                .iter()
                .map(|step| get(step, "id").cloned().unwrap_or(Value::Null))
                .collect();
            phases.push(object(vec![
                ("id", s("phase-00001")),
                ("kind", s("backfill-tighten")),
                ("transaction", s("required")),
                ("steps", array(ids)),
            ]));
            execution_profile = Some(object(vec![
                ("version", s("umf.table-migration-execution/0.2")),
                ("progressRelation", s("umf_lifecycle_progress")),
                ("ownerOnly", Value::Bool(true)),
            ]));
        } else if plan_version_is_g11(options.as_ref()) {
            let valid_roles = [
                "drop-column",
                "add-column",
                "target-check",
                "backfill",
                "install-default",
                "tighten-not-null",
                "dependency-drop",
                "dependency-add",
            ];
            if migration_steps.len() < 2
                || seed_execution != s("none")
                || migration_steps.iter().any(|step| {
                    let role = text(get(step, "phaseOperation").unwrap_or(&Value::Null))
                        .unwrap_or_default();
                    let target = get(step, "phaseTarget");
                    let dependency = get(step, "phaseDependency");
                    let is_dependency = role == "dependency-drop" || role == "dependency-add";
                    let dependency_kind = dependency
                        .and_then(|item| get(item, "kind"))
                        .and_then(text)
                        .unwrap_or_default();
                    let expected_kind = match dependency_kind.as_str() {
                        "index" => "index",
                        "foreignKey" => "foreignKey",
                        "policy" => "policy",
                        "grant" => "grant",
                        "check" | "key" => "table",
                        _ => "",
                    };
                    let digest_ok = dependency
                        .and_then(|item| get(item, "meaningDigest"))
                        .and_then(text)
                        .is_some_and(|digest| {
                            digest.len() == 64
                                && digest
                                    .bytes()
                                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
                        });
                    let target_ok = target.is_some_and(|target| {
                        get(target, "table")
                            .and_then(text)
                            .is_some_and(|id| !id.is_empty())
                            && get(target, "field").is_some_and(|field| {
                                get(field, "module")
                                    .and_then(text)
                                    .is_some_and(|id| !id.is_empty())
                                    && get(field, "element")
                                        .and_then(text)
                                        .is_some_and(|id| !id.is_empty())
                            })
                    });
                    let operation =
                        text(get(step, "operation").unwrap_or(&Value::Null)).unwrap_or_default();
                    let subject_ok = if is_dependency {
                        dependency
                            .and_then(|item| get(item, "id"))
                            .and_then(text)
                            .is_some_and(|id| !id.is_empty())
                            && dependency
                                .and_then(|item| get(item, "sourcePath"))
                                .and_then(text)
                                .is_some_and(|path| !path.is_empty())
                            && digest_ok
                            && text(get(step, "kind").unwrap_or(&Value::Null)).as_deref()
                                == Some(expected_kind)
                            && operation == role
                    } else {
                        target_ok
                            && (if role == "backfill" {
                                text(get(step, "kind").unwrap_or(&Value::Null)).as_deref()
                                    == Some("backfill")
                                    && get(step, "sql").and_then(text).as_deref() == Some("")
                                    && !operation.is_empty()
                            } else {
                                text(get(step, "kind").unwrap_or(&Value::Null)).as_deref()
                                    == Some("table")
                                    && operation == role
                            })
                    };
                    !valid_roles.contains(&role.as_str())
                        || get(step, "transaction").and_then(text).as_deref() != Some("required")
                        || target.is_some() == dependency.is_some()
                        || ((role == "dependency-drop" || role == "dependency-add")
                            != dependency.is_some())
                        || !subject_ok
                })
            {
                return Ok(blocked(
                    "TABLE_MIGRATION_OPTIONS",
                    "/steps",
                    "G11 field replacement effects require typed transactional subjects",
                ));
            }
            let ids = migration_steps
                .iter()
                .map(|step| get(step, "id").cloned().unwrap_or(Value::Null))
                .collect();
            phases.push(object(vec![
                ("id", s("phase-00001")),
                ("kind", s("field-replacement")),
                ("transaction", s("required")),
                ("steps", array(ids)),
            ]));
            execution_profile = Some(object(vec![
                ("version", s("umf.table-migration-execution/0.5")),
                ("progressRelation", s("umf_lifecycle_progress")),
                ("ownerOnly", Value::Bool(true)),
                ("ingressProfile", s("umf.table-generation-ingress/0.1")),
            ]));
        } else if plan_version_is_v2(options.as_ref()) {
            let g02 = get(options.as_ref().unwrap_or(&Value::Null), "version")
                .and_then(text)
                .as_deref()
                == Some("umf.table-migration-options/0.4");
            if g02 {
                let selected = migration_steps
                    .iter()
                    .enumerate()
                    .filter(|(_, step)| get(step, "phaseTarget").is_some())
                    .collect::<Vec<_>>();
                if selected.is_empty() {
                    return Ok(blocked(
                        "TABLE_MIGRATION_OPTIONS",
                        "/options/backfills/0",
                        "G02 field-effect group is missing",
                    ));
                }
                let first = selected.first().unwrap().0;
                let last = selected.last().unwrap().0;
                if migration_steps[first..=last]
                    .iter()
                    .any(|step| get(step, "phaseTarget").is_none())
                {
                    return Ok(blocked(
                        "TABLE_MIGRATION_OPTIONS",
                        "/steps",
                        "G02 field-effect steps must be executable in one contiguous group",
                    ));
                }
                let added = selected.iter().any(|(_, step)| {
                    get(step, "phaseOperation").and_then(text).as_deref() == Some("add-column")
                });
                let mut add_phase = |kind: &str, steps: &[Value]| {
                    if steps.is_empty() {
                        return;
                    }
                    let ids = steps
                        .iter()
                        .map(|step| get(step, "id").cloned().unwrap_or(Value::Null))
                        .collect::<Vec<_>>();
                    let id = format!("phase-{:05}", phases.len() + 1);
                    phases.push(object(vec![
                        ("id", s(&id)),
                        ("kind", s(kind)),
                        ("transaction", s("required")),
                        ("steps", array(ids)),
                    ]));
                };
                add_phase("transaction", &migration_steps[..first]);
                add_phase(
                    if added {
                        "backfill-add"
                    } else {
                        "backfill-tighten"
                    },
                    &migration_steps[first..=last],
                );
                add_phase("transaction", &migration_steps[last + 1..]);
                execution_profile = Some(object(vec![
                    ("version", s("umf.table-migration-execution/0.3")),
                    ("progressRelation", s("umf_lifecycle_progress")),
                    ("ownerOnly", Value::Bool(true)),
                ]));
            } else {
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
        }
        let option_version = get(options.as_ref().unwrap_or(&Value::Null), "version")
            .and_then(text)
            .unwrap_or_default();
        let plan_version = match option_version.as_str() {
            "umf.table-migration-options/0.2" => "umf.table-migration/0.2",
            "umf.table-migration-options/0.3" => "umf.table-migration/0.3",
            "umf.table-migration-options/0.4" => "umf.table-migration/0.4",
            "umf.table-migration-options/0.6" => "umf.table-migration/0.6",
            _ => "umf.table-migration/0.1",
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
                if plan_version == "umf.table-migration/0.2"
                    || plan_version == "umf.table-migration/0.3"
                    || plan_version == "umf.table-migration/0.4"
                    || plan_version == "umf.table-migration/0.6"
                {
                    fields.push((Utf16::from("phases"), array(phases)));
                    if plan_version == "umf.table-migration/0.3"
                        || plan_version == "umf.table-migration/0.4"
                        || plan_version == "umf.table-migration/0.6"
                    {
                        fields.push((
                            Utf16::from("approvalProfile"),
                            object(vec![
                                ("version", s("umf.table-migration-approval/0.1")),
                                ("relation", s("umf_lifecycle_approvals")),
                                ("ownerOnly", Value::Bool(true)),
                            ]),
                        ));
                    }
                    fields.push((
                        Utf16::from("executionProfile"),
                        if plan_version == "umf.table-migration/0.3" {
                            object(vec![
                                ("version", s("umf.table-migration-execution/0.2")),
                                ("progressRelation", s("umf_lifecycle_progress")),
                                ("ownerOnly", Value::Bool(true)),
                            ])
                        } else if plan_version == "umf.table-migration/0.4" {
                            object(vec![
                                ("version", s("umf.table-migration-execution/0.3")),
                                ("progressRelation", s("umf_lifecycle_progress")),
                                ("ownerOnly", Value::Bool(true)),
                            ])
                        } else {
                            execution_profile.unwrap_or(Value::Null)
                        },
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
            Some(
                "umf.table-migration/0.1"
                    | "umf.table-migration/0.2"
                    | "umf.table-migration/0.3"
                    | "umf.table-migration/0.4"
                    | "umf.table-migration/0.5"
                    | "umf.table-migration/0.6"
                    | "umf.table-migration/0.7"
            )
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

/// Selector 0.3 emits added constraints inside each table's candidate group,
/// after replaced/removed constraints and before policy changes. The base
/// discovery kernel already emits table-local columns, constraints, and
/// policies in that order; insert the newly added constraints at the policy
/// boundary without disturbing the existing candidate order.
fn interleave_g03_added_constraints(
    base: Vec<Value>,
    added: Vec<Value>,
    tables: &[Value],
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    fn candidate_table(candidate: &Value) -> Option<&Value> {
        for name in ["oldValue", "newValue"] {
            if let Some(value) = get(candidate, name) {
                if let Some(physical) = get(value, "physical") {
                    if let Some(table) = get(physical, "table") {
                        return Some(table);
                    }
                }
            }
        }
        None
    }
    fn policy_for(candidate: &Value, table_index: usize) -> bool {
        if get(candidate, "kind").and_then(text).as_deref() != Some("change-policy") {
            return false;
        }
        let Some(path) = get(candidate, "path").and_then(text) else {
            return false;
        };
        path.starts_with(&format!(
            "/modules/extensions/umf.tables/tables/{table_index}/policy/"
        ))
    }

    ctx.charge_work(
        tables
            .len()
            .saturating_add(base.len())
            .saturating_add(added.len())
            .saturating_add(1),
        Utf16::from("/changes"),
    )?;
    let mut result = Vec::new();
    result
        .try_reserve(base.len().saturating_add(added.len()))
        .map_err(|_| {
            EngineError::new(
                "LIMIT",
                Utf16::from("/changes"),
                "Candidate allocation refused",
            )
        })?;
    let mut used_base = vec![false; base.len()];
    let mut used_added = vec![false; added.len()];
    for (table_index, table) in tables.iter().enumerate() {
        ctx.charge_work(
            base.len().saturating_add(added.len()).saturating_add(1),
            Utf16::from("/expectedCatalog/tables"),
        )?;
        let table_id = get(table, "id").unwrap_or(&Value::Null);
        let base_indexes = base
            .iter()
            .enumerate()
            .filter_map(|(index, candidate)| {
                if candidate_table(candidate) == Some(table_id)
                    || policy_for(candidate, table_index)
                {
                    Some(index)
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();
        let added_indexes = added
            .iter()
            .enumerate()
            .filter_map(|(index, candidate)| {
                (candidate_table(candidate) == Some(table_id)).then_some(index)
            })
            .collect::<Vec<_>>();
        ctx.charge_work(
            base_indexes
                .len()
                .saturating_add(added_indexes.len())
                .saturating_add(1),
            Utf16::from("/expectedCatalog/tables"),
        )?;
        let mut inserted = false;
        for index in base_indexes {
            if !inserted && policy_for(&base[index], table_index) {
                for added_index in &added_indexes {
                    charge_tree(&added[*added_index], ctx)?;
                    result.push(added[*added_index].clone());
                    used_added[*added_index] = true;
                }
                inserted = true;
            }
            charge_tree(&base[index], ctx)?;
            result.push(base[index].clone());
            used_base[index] = true;
        }
        if !inserted {
            for added_index in added_indexes {
                charge_tree(&added[added_index], ctx)?;
                result.push(added[added_index].clone());
                used_added[added_index] = true;
            }
        }
    }
    for (index, candidate) in base.into_iter().enumerate() {
        if !used_base[index] {
            ctx.charge_work(1, Utf16::from("/changes"))?;
            result.push(candidate);
        }
    }
    for (index, candidate) in added.into_iter().enumerate() {
        if !used_added[index] {
            ctx.charge_work(1, Utf16::from("/changes"))?;
            result.push(candidate);
        }
    }
    Ok(result)
}

fn exact_members(value: &Value, names: &[&str]) -> bool {
    let Some(Value::Object(fields)) = Some(value) else {
        return false;
    };
    fields.len() == names.len()
        && names.iter().all(|name| {
            fields
                .iter()
                .filter(|(key, _)| key == &Utf16::from(*name))
                .count()
                == 1
        })
}

fn bounded_text_identity(value: Option<&Value>, max_bytes: usize) -> bool {
    let Some(Value::String(value)) = value else {
        return false;
    };
    if value.is_empty() || value.units().contains(&0) {
        return false;
    }
    value.to_utf8().is_ok_and(|text| text.len() <= max_bytes)
}

fn valid_g04_discovery_intents(value: Option<&Value>) -> bool {
    let Some(Value::Array(items)) = value else {
        return false;
    };
    if items.is_empty() || items.len() > 256 {
        return false;
    }
    items.iter().all(|intent| {
        if !exact_members(intent, &["table", "field", "recipe", "nulls", "invalid", "recovery"])
            || !bounded_text_identity(get(intent, "table"), 256)
            || !matches!(get(intent, "nulls"), Some(Value::String(value)) if value == &Utf16::from("preserve"))
            || !matches!(get(intent, "invalid"), Some(Value::String(value)) if value == &Utf16::from("abort"))
        { return false; }
        let field = get(intent, "field").unwrap();
        if !exact_members(field, &["module", "element"])
            || !bounded_text_identity(get(field, "module"), 256)
            || !bounded_text_identity(get(field, "element"), 256)
        { return false; }
        let recipe = get(intent, "recipe").unwrap();
        let Some(kind) = get(recipe, "kind").and_then(text) else { return false };
        let parameter_names: &[&str] = match kind.as_str() {
            "numeric-exact" | "text-date" | "date-text" | "text-instant" | "instant-text" | "text-uuid" | "uuid-text" => &[],
            "numeric-rescale" => &["rounding"],
            "date-instant" => &["at", "offset"],
            "instant-date" => &["time", "offset"],
            "text-boolean" | "boolean-text" => &["trueToken", "falseToken"],
            _ => return false,
        };
        if !exact_members(recipe, &["version", "kind", "parameters"])
            || !matches!(get(recipe, "version"), Some(Value::String(value)) if value == &Utf16::from("umf.conversion-recipe/0.1"))
            || !exact_members(get(recipe, "parameters").unwrap(), parameter_names)
        { return false; }
        let parameters = get(recipe, "parameters").unwrap();
        let parameters_valid = match kind.as_str() {
            "numeric-rescale" => matches!(get(parameters, "rounding"), Some(Value::String(value)) if value == &Utf16::from("half-even") || value == &Utf16::from("toward-zero")),
            "date-instant" => matches!(get(parameters, "at"), Some(Value::String(value)) if value == &Utf16::from("00:00:00"))
                && matches!(get(parameters, "offset"), Some(Value::String(value)) if value == &Utf16::from("Z")),
            "instant-date" => matches!(get(parameters, "time"), Some(Value::String(value)) if value == &Utf16::from("require-midnight") || value == &Utf16::from("discard"))
                && matches!(get(parameters, "offset"), Some(Value::String(value)) if value == &Utf16::from("Z")),
            "text-boolean" | "boolean-text" => {
                let Some(yes) = get(parameters, "trueToken").and_then(text) else { return false };
                let Some(no) = get(parameters, "falseToken").and_then(text) else { return false };
                bounded_text_identity(get(parameters, "trueToken"), 128)
                    && bounded_text_identity(get(parameters, "falseToken"), 128)
                    && yes != no
            }
            _ => true,
        };
        if !parameters_valid { return false; }
        let recovery = get(intent, "recovery").unwrap();
        match get(recovery, "mode").and_then(text).as_deref() {
            Some("irreversible") => exact_members(recovery, &["mode"]),
            Some("retained-originals") => {
                exact_members(recovery, &["mode", "policy"])
                    && exact_members(get(recovery, "policy").unwrap(), &["id", "revision"])
                    && bounded_text_identity(get(get(recovery, "policy").unwrap(), "id"), 256)
                    && bounded_text_identity(get(get(recovery, "policy").unwrap(), "revision"), 256)
            }
            Some("round-trip") => {
                exact_members(recovery, &["mode", "proofProfile"])
                    && matches!(get(recovery, "proofProfile"), Some(Value::String(value)) if value == &Utf16::from("umf.exact-integer-widening-roundtrip/0.1"))
            }
            _ => false,
        }
    })
}

#[cfg(test)]
mod selector_order_tests {
    use super::*;

    fn object(fields: Vec<(&str, Value)>) -> Value {
        Value::Object(
            fields
                .into_iter()
                .map(|(key, value)| (Utf16::from(key), value))
                .collect(),
        )
    }

    fn candidate(kind: &str, path: &str, table: Option<&str>) -> Value {
        let meaning = table.map_or(Value::Null, |table| {
            object(vec![(
                "physical",
                object(vec![("table", Value::String(Utf16::from(table)))]),
            )])
        });
        object(vec![
            ("kind", Value::String(Utf16::from(kind))),
            ("path", Value::String(Utf16::from(path))),
            ("oldValue", meaning.clone()),
            ("newValue", meaning),
        ])
    }

    #[test]
    fn added_constraints_stay_between_table_changes_and_policy() {
        let base = vec![
            candidate("change-column-type", "/columns/0", Some("orders")),
            candidate(
                "change-policy",
                "/modules/extensions/umf.tables/tables/0/policy/person/select",
                None,
            ),
        ];
        let added = vec![candidate(
            "replace-index",
            "/modules/extensions/umf.tables/tables/0/indexes/1",
            Some("orders"),
        )];
        let tables = vec![object(vec![("id", Value::String(Utf16::from("orders")))])];
        let ordered =
            interleave_g03_added_constraints(base, added, &tables, &mut Context::ordinary())
                .unwrap();
        let kinds = ordered
            .iter()
            .map(|row| text(get(row, "kind").unwrap()).unwrap())
            .collect::<Vec<_>>();
        assert_eq!(
            kinds,
            ["change-column-type", "replace-index", "change-policy"]
        );
    }
}

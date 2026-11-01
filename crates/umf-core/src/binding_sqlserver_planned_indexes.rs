// SPDX-License-Identifier: MIT OR Apache-2.0
//! SQL Server 2022 planned-table index projection over a validated UMF binding.
use crate::{
    binding_index_projection::{project_binding_indexes, BindingIndexProjectionResources},
    context::Context,
    error::EngineError,
    serialization::stringify_compact_metered,
    value::{copy_json, Utf16, Value},
};

fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    if let Value::Object(f) = v {
        f.iter().find(|(x, _)| x == &k(n)).map(|(_, v)| v)
    } else {
        None
    }
}
fn text(v: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(x)) = v {
        Some(x)
    } else {
        None
    }
}
fn utf8(v: Option<&Value>) -> Option<String> {
    text(v).and_then(|x| x.to_utf8().ok())
}
fn array(v: Option<&Value>) -> Option<&[Value]> {
    if let Some(Value::Array(x)) = v {
        Some(x)
    } else {
        None
    }
}
fn object(v: &Value) -> Option<&[(Utf16, Value)]> {
    if let Value::Object(x) = v {
        Some(x)
    } else {
        None
    }
}
fn eq(a: Option<&Value>, b: &str) -> bool {
    utf8(a).as_deref() == Some(b)
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn obj(items: Vec<(&str, Value)>) -> Value {
    Value::Object(items.into_iter().map(|(a, b)| (k(a), b)).collect())
}
fn s(value: &str) -> Value {
    Value::String(Utf16::from(value))
}
fn quote(value: &Value) -> Result<String, EngineError> {
    let name = text(Some(value)).ok_or_else(|| {
        err(
            "SQLSERVER_TABLE_PLAN",
            "Expected SQL Server identifier text",
        )
    })?;
    let scalar = name.to_utf8().map_err(|_| {
        err(
            "SQLSERVER_IDENTIFIER",
            "Invalid or truncated SQL Server identifier",
        )
    })?;
    if scalar.is_empty() || scalar.as_bytes().len() > 128 || scalar.contains('\0') {
        return Err(err(
            "SQLSERVER_IDENTIFIER",
            "Invalid or truncated SQL Server identifier",
        ));
    }
    Ok(format!("[{}]", scalar.replace(']', "]]")))
}
fn same_element(a: &Value, b: &Value) -> bool {
    ["module", "element"]
        .iter()
        .all(|name| match (get(a, name), get(b, name)) {
            (Some(Value::String(x)), Some(Value::String(y))) => x == y,
            _ => false,
        })
}
fn same_field(a: &Value, b: &Value) -> bool {
    ["module", "element", "field"]
        .iter()
        .all(|name| match (get(a, name), get(b, name)) {
            (None, None) => true,
            (Some(Value::String(x)), Some(Value::String(y))) => x == y,
            _ => false,
        })
}
fn result_target(binding: &Value) -> Result<Value, EngineError> {
    get(
        get(
            get(binding, "extensions").unwrap_or(&Value::Null),
            "umf.binding",
        )
        .unwrap_or(&Value::Null),
        "target",
    )
    .cloned()
    .ok_or_else(|| err("BINDING_DOCUMENT", "Binding target is missing"))
}
fn push_residual(
    residuals: &mut Vec<Value>,
    path: String,
    reason: &str,
    choice: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    residuals.push(obj(vec![
        ("path", s(&path)),
        ("reason", s(reason)),
        ("choice", copy_json(choice, ctx)?),
    ]));
    Ok(())
}
fn planned_number(value: Option<&Value>) -> Option<i64> {
    if let Some(Value::Number(n)) = value {
        if n.is_finite() && n.fract() == 0.0 && n.abs() <= 9007199254740991.0 {
            Some(*n as i64)
        } else {
            None
        }
    } else {
        None
    }
}
fn field_for<'a>(payload: &'a Value, reference: &Value) -> Option<&'a Value> {
    array(get(payload, "fields"))?
        .iter()
        .find(|row| same_field(row, reference))
}
fn planned_for<'a>(
    columns: &'a [(String, String, String, i64, Value)],
    schema: &str,
    table: &str,
    column: &str,
) -> Option<&'a Value> {
    columns
        .iter()
        .find(|(s, t, c, _, _)| s == schema && t == table && c == column)
        .map(|(_, _, _, _, v)| v)
}

/// Return the same reviewable SQL proposal and residuals as the current
/// `projectBindingIndexesAgainstSqlServerPlan` TypeScript operation.
pub fn project_binding_indexes_against_sqlserver_plan(
    resources: &BindingIndexProjectionResources,
    logical: &Value,
    binding: &Value,
    planned_columns: &Value,
    loss_policy: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if loss_policy != "strict" && loss_policy != "report" {
        return Err(err(
            "BINDING_LOSS_POLICY",
            "Expected strict or report loss policy",
        ));
    }
    let admitted = project_binding_indexes(resources, binding, logical, "report", ctx)?;
    let source = get(&admitted, "source")
        .ok_or_else(|| err("BINDING_DOCUMENT", "Validated source missing"))?;
    let model = get(&admitted, "logical")
        .ok_or_else(|| err("BINDING_MODEL", "Validated logical document missing"))?;
    let payload = get(
        get(source, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .ok_or_else(|| err("BINDING_DOCUMENT", "Binding extension payload is missing"))?;
    let target = result_target(source)?;
    if !eq(get(&target, "system"), "sqlserver") || !eq(get(&target, "version"), "2022") {
        return Err(err(
            "BINDING_TARGET",
            "Expected pinned SQL Server 2022 binding",
        ));
    }
    let inputs = array(Some(planned_columns))
        .ok_or_else(|| err("SQLSERVER_TABLE_PLAN", "Expected explicit planned columns"))?;
    let mut columns: Vec<(String, String, String, i64, Value)> = Vec::new();
    for row in inputs {
        let members =
            object(row).ok_or_else(|| err("SQLSERVER_TABLE_PLAN", "Invalid planned column"))?;
        if members.iter().any(|(name, _)| {
            !["schema", "table", "column", "maxLength"]
                .iter()
                .any(|x| name == &k(x))
        }) || members.len() != 4
        {
            return Err(err("SQLSERVER_TABLE_PLAN", "Invalid planned column"));
        }
        let schema = quote(
            get(row, "schema")
                .ok_or_else(|| err("SQLSERVER_TABLE_PLAN", "Invalid planned column"))?,
        )?;
        let table = quote(
            get(row, "table")
                .ok_or_else(|| err("SQLSERVER_TABLE_PLAN", "Invalid planned column"))?,
        )?;
        let column = quote(
            get(row, "column")
                .ok_or_else(|| err("SQLSERVER_TABLE_PLAN", "Invalid planned column"))?,
        )?;
        let schema = schema[1..schema.len() - 1].replace("]]", "]");
        let table = table[1..table.len() - 1].replace("]]", "]");
        let column = column[1..column.len() - 1].replace("]]", "]");
        let max = planned_number(get(row, "maxLength"))
            .filter(|n| *n >= -1)
            .ok_or_else(|| err("SQLSERVER_TABLE_PLAN", "Invalid planned column"))?;
        if columns
            .iter()
            .any(|(s, t, c, _, _)| s == &schema && t == &table && c == &column)
        {
            return Err(err("SQLSERVER_TABLE_PLAN", "Duplicate planned column"));
        }
        columns.push((schema, table, column, max, row.clone()));
    }
    let mut residuals = Vec::new();
    let mut statements = Vec::<String>::new();
    let indexes = array(get(payload, "indexes")).unwrap_or(&[]);
    let elements = array(get(payload, "elements")).unwrap_or(&[]);
    for (i, item) in indexes.iter().enumerate() {
        let path = format!("/extensions/umf.binding/indexes/{i}");
        let kind = utf8(get(item, "kind"));
        if !matches!(kind.as_deref(), Some("btree" | "unique" | "partial")) {
            push_residual(
                &mut residuals,
                path,
                "No verified disk-rowstore carrier for this index kind",
                item,
                ctx,
            )?;
            continue;
        }
        let predicate = get(item, "predicate");
        if predicate.is_some()
            && (!eq(get(predicate.unwrap(), "language"), "tsql")
                || !eq(get(predicate.unwrap(), "version"), "2022"))
        {
            push_residual(
                &mut residuals,
                path,
                "Predicate language/version differs from SQL Server 2022 profile",
                item,
                ctx,
            )?;
            continue;
        }
        let targets = array(get(item, "on")).unwrap_or(&[]);
        if targets
            .iter()
            .any(|target| get(target, "documentPath").is_some())
        {
            push_residual(&mut residuals,path,"Document-path expression index needs an explicit computed column outside this profile",item,ctx)?;
            continue;
        }
        let first = targets.first().and_then(|target| get(target, "field"));
        let Some(first) = first else {
            push_residual(&mut residuals, path, "No direct field target", item, ctx)?;
            continue;
        };
        let owner = elements.iter().find(|e| same_element(e, first));
        let Some(table_name) = owner.and_then(|e| utf8(get(e, "table"))) else {
            push_residual(
                &mut residuals,
                path,
                "An exact schema.table override is required",
                item,
                ctx,
            )?;
            continue;
        };
        let parts: Vec<&str> = table_name.split('.').collect();
        if parts.len() != 2 || parts.iter().any(|x| x.is_empty()) {
            push_residual(
                &mut residuals,
                path,
                "An exact schema.table override is required",
                item,
                ctx,
            )?;
            continue;
        }
        let (schema, table) = (parts[0], parts[1]);
        let available: Vec<_> = columns
            .iter()
            .filter(|(s, t, _, _, _)| s == schema && t == table)
            .collect();
        if available.is_empty() {
            push_residual(
                &mut residuals,
                path,
                "Generated table plan has no matching columns",
                item,
                ctx,
            )?;
            continue;
        }
        let mut valid = true;
        let mut terms = Vec::new();
        for target in targets {
            let Some(reference) = get(target, "field") else {
                valid = false;
                continue;
            };
            let Some(field) = field_for(payload, reference) else {
                valid = false;
                continue;
            };
            let Some(column) = utf8(get(field, "column")) else {
                valid = false;
                continue;
            };
            if planned_for(&columns, schema, table, &column).is_none() {
                valid = false;
                continue;
            }
            terms.push(quote(&s(&column))?);
        }
        let mut includes = Vec::new();
        for reference in array(get(item, "include")).unwrap_or(&[]) {
            let Some(field) = field_for(payload, reference) else {
                valid = false;
                continue;
            };
            let Some(column) = utf8(get(field, "column")) else {
                valid = false;
                continue;
            };
            if planned_for(&columns, schema, table, &column).is_none() {
                valid = false;
                continue;
            }
            includes.push(quote(&s(&column))?);
        }
        if !valid {
            push_residual(
                &mut residuals,
                path,
                "Index column or include is absent from generated table plan",
                item,
                ctx,
            )?;
            continue;
        }
        let mut unbounded = false;
        for target in targets {
            if let Some(reference) = get(target, "field") {
                if let Some(field) = field_for(payload, reference) {
                    if let Some(column) = utf8(get(field, "column")) {
                        if planned_for(&columns, schema, table, &column)
                            .is_some_and(|v| planned_number(get(v, "maxLength")) == Some(-1))
                        {
                            unbounded = true;
                        }
                    }
                }
            }
        }
        if unbounded {
            push_residual(
                &mut residuals,
                path,
                "Unbounded planned column cannot be a key in this disk-rowstore profile",
                item,
                ctx,
            )?;
            continue;
        }
        let predicate_text = utf8(get(predicate.unwrap_or(&Value::Null), "expression"));
        if predicate_text
            .as_ref()
            .is_some_and(|p| !simple_predicate(p))
        {
            push_residual(
                &mut residuals,
                path,
                "Filtered predicate is outside the verified simple comparison subset",
                item,
                ctx,
            )?;
            continue;
        }
        if let Some(caps) = predicate_text.as_ref().and_then(|p| predicate_column(p)) {
            if !available.iter().any(|(_, _, column, _, _)| column == &caps) {
                push_residual(
                    &mut residuals,
                    path,
                    "Filtered predicate column is absent from generated table plan",
                    item,
                    ctx,
                )?;
                continue;
            }
        }
        let unique = matches!(get(item, "unique"), Some(Value::Bool(true)));
        let name = quote(
            get(item, "name").ok_or_else(|| err("BINDING_DOCUMENT", "Index name is missing"))?,
        )?;
        let include_sql = if includes.is_empty() {
            String::new()
        } else {
            format!(" INCLUDE ({})", includes.join(", "))
        };
        let predicate_sql = predicate_text
            .map(|p| format!(" WHERE {}", p.trim()))
            .unwrap_or_default();
        statements.push(format!(
            "CREATE {}NONCLUSTERED INDEX {} ON {}.{} ({}){}{};",
            if unique { "UNIQUE " } else { "" },
            name,
            quote(&s(schema))?,
            quote(&s(table))?,
            terms.join(", "),
            include_sql,
            predicate_sql
        ));
    }
    let blocked = !residuals.is_empty() && loss_policy == "strict";
    let status = if blocked {
        "blocked"
    } else if residuals.is_empty() {
        "proposed"
    } else {
        "reported"
    };
    let mut result = vec![
        ("status", s(status)),
        ("logical", copy_json(model, ctx)?),
        ("binding", copy_json(source, ctx)?),
        ("target", target),
        ("residuals", Value::Array(residuals)),
    ];
    if !blocked && !statements.is_empty() {
        let candidate = statements.join("\n") + "\n";
        ctx.charge_text(candidate.encode_utf16().count(), Utf16::default())?;
        result.push(("candidate", s(&candidate)));
    }
    let _ = stringify_compact_metered(&obj(result.clone()), ctx)?;
    Ok(obj(result))
}
fn simple_predicate(input: &str) -> bool {
    static RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| {
        regex::Regex::new(
            r"(?i)^\[([A-Za-z_][A-Za-z0-9_]*)\]\s*(?:=|<>|<=|>=|<|>)\s*(?:-?\d+|N?'(?:[^']|'')*')$",
        )
        .expect("static predicate regex")
    })
    .is_match(input.trim())
}
fn predicate_column(input: &str) -> Option<String> {
    static RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| {
        regex::Regex::new(
            r"(?i)^\[([A-Za-z_][A-Za-z0-9_]*)\]\s*(?:=|<>|<=|>=|<|>)\s*(?:-?\d+|N?'(?:[^']|'')*')$",
        )
        .expect("static predicate regex")
    })
    .captures(input.trim())
    .and_then(|c| c.get(1).map(|m| m.as_str().to_owned()))
}

/// Preserve Parquet physical choices as target-specific residuals. This API
/// proposes no file-schema mutation; native capture admission remains a wire
/// call into the existing Rust Parquet owner.
pub fn project_binding_to_parquet(
    resources: &BindingIndexProjectionResources,
    logical: &Value,
    binding: &Value,
    loss_policy: &str,
    native_archive: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if loss_policy != "strict" && loss_policy != "report" {
        return Err(err(
            "BINDING_LOSS_POLICY",
            "Expected strict or report loss policy",
        ));
    }
    let admitted = project_binding_indexes(resources, binding, logical, "report", ctx)?;
    let source = get(&admitted, "source")
        .ok_or_else(|| err("BINDING_DOCUMENT", "Validated source missing"))?;
    let model = get(&admitted, "logical")
        .ok_or_else(|| err("BINDING_MODEL", "Validated logical document missing"))?;
    let payload = get(
        get(source, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .ok_or_else(|| err("BINDING_DOCUMENT", "Binding extension payload is missing"))?;
    let target = result_target(source)?;
    let version = utf8(get(&target, "version"));
    if !eq(get(&target, "system"), "parquet") {
        return Err(err("BINDING_TARGET", "Expected Parquet target binding"));
    }
    if !version
        .as_deref()
        .is_some_and(|v| v == "2" || v.starts_with("2."))
    {
        return Err(err("BINDING_TARGET", "Unsupported Parquet profile version"));
    }
    let mut residuals = Vec::new();
    for (index, row) in array(get(payload, "elements"))
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        let path = format!("/extensions/umf.binding/elements/{index}");
        if get(row, "partition").is_some() {
            push_residual(
                &mut residuals,
                format!("{path}/partition"),
                "Parquet file schema does not declare partition family",
                get(row, "partition").unwrap(),
                ctx,
            )?;
        }
        if let Some(table) = get(row, "table") {
            push_residual(
                &mut residuals,
                format!("{path}/table"),
                "Parquet file schema does not declare table name",
                table,
                ctx,
            )?;
        }
    }
    for (index, row) in array(get(payload, "fields"))
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        push_residual(
            &mut residuals,
            format!("/extensions/umf.binding/fields/{index}"),
            "Parquet file schema does not enforce this storage placement",
            row,
            ctx,
        )?;
    }
    for (index, row) in array(get(payload, "relationships"))
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        push_residual(
            &mut residuals,
            format!("/extensions/umf.binding/relationships/{index}"),
            "Parquet file schema does not enforce relationship storage",
            row,
            ctx,
        )?;
    }
    for (index, row) in array(get(payload, "indexes"))
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        push_residual(
            &mut residuals,
            format!("/extensions/umf.binding/indexes/{index}"),
            "Parquet file schema does not enforce indexes",
            row,
            ctx,
        )?;
    }
    let blocked = !residuals.is_empty() && loss_policy == "strict";
    let status = if residuals.is_empty() {
        "preserved"
    } else if blocked {
        "blocked"
    } else {
        "reported"
    };
    let mut result = vec![
        ("status", s(status)),
        ("logical", copy_json(model, ctx)?),
        ("binding", copy_json(source, ctx)?),
        ("target", target),
        ("residuals", Value::Array(residuals)),
    ];
    if let Some(archive) = native_archive {
        result.push(("nativeArchive", copy_json(archive, ctx)?));
    }
    let output = obj(result);
    let _ = stringify_compact_metered(&output, ctx)?;
    Ok(output)
}

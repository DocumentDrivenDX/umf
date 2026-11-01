// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned PostgreSQL 17 index target selection over explicit DDL syntax.
use crate::{
    binding_index_projection::{self, BindingIndexProjectionResources},
    context::Context,
    error::EngineError,
    native_json::{NativeJsonNode, NativeJsonTree},
    postgresql_sql_runtime,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    if let Value::Object(fields) = v {
        fields
            .iter()
            .find(|(name, _)| name == &k(n))
            .map(|(_, value)| value)
    } else {
        None
    }
}
fn arr(v: Option<&Value>) -> &[Value] {
    match v {
        Some(Value::Array(items)) => items,
        _ => &[],
    }
}
fn txt(v: Option<&Value>) -> Option<String> {
    match v {
        Some(Value::String(s)) => s.to_utf8().ok(),
        _ => None,
    }
}
fn eq(v: Option<&Value>, expected: &str) -> bool {
    txt(v).as_deref() == Some(expected)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(n, v)| (k(n), v)).collect())
}
fn s(v: impl Into<Utf16>) -> Value {
    Value::String(v.into())
}
fn err(code: &str, path: &str, message: &str) -> EngineError {
    EngineError::new(code, k(path), message)
}
fn one_index_statement(archive: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    let root = postgresql_sql_runtime::get_postgresql_node(archive, &Utf16::default(), ctx)?;
    let tree = NativeJsonTree::from_tagged_value(&root, ctx)?;
    let NativeJsonNode::Object(root) = tree.root() else {
        return Ok(false);
    };
    let Some((_, NativeJsonNode::Array(stmts))) =
        root.iter().find(|(name, _)| name == &Utf16::from("stmts"))
    else {
        return Ok(false);
    };
    let [NativeJsonNode::Object(row)] = stmts.as_slice() else {
        return Ok(false);
    };
    let Some((_, NativeJsonNode::Object(stmt))) =
        row.iter().find(|(name, _)| name == &Utf16::from("stmt"))
    else {
        return Ok(false);
    };
    Ok(stmt.iter().any(|(key, _)| key == &Utf16::from("IndexStmt")))
}
fn same_ref(a: &Value, b: &Value) -> bool {
    ["module", "element", "field"]
        .iter()
        .all(|n| match (get(a, n), get(b, n)) {
            (Some(Value::String(x)), Some(Value::String(y))) => x == y,
            (None, None) => true,
            _ => false,
        })
}
fn quote(value: Option<&Value>, max: usize) -> Result<String, EngineError> {
    let value = match value {
        Some(Value::String(v)) => v,
        _ => {
            return Err(err(
                "POSTGRESQL_IDENTIFIER",
                "",
                "Expected PostgreSQL identifier",
            ))
        }
    };
    let text = value.to_utf8().map_err(|_| {
        err(
            "POSTGRESQL_IDENTIFIER",
            "",
            "Identifier contains malformed UTF-16",
        )
    })?;
    if text.is_empty() || text.as_bytes().len() > max || text.contains('\0') {
        return Err(err(
            "POSTGRESQL_IDENTIFIER",
            "",
            "Identifier is empty, exceeds PostgreSQL's byte limit or contains NUL",
        ));
    }
    Ok(format!("\"{}\"", text.replace('"', "\"\"")))
}
fn literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}
fn residual(
    out: &mut Vec<Value>,
    path: String,
    reason: &str,
    choice: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    out.push(obj(vec![
        ("path", s(path)),
        ("reason", s(reason)),
        ("choice", copy_json(choice, ctx)?),
    ]));
    Ok(())
}
fn declarations_tables(
    declarations: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<(String, Vec<(String, String)>, Vec<String>)>, EngineError> {
    let mut tables = Vec::new();
    fn visit(
        node: &Value,
        schema_context: Option<&str>,
        path: &str,
        tables: &mut Vec<(String, Vec<(String, String)>, Vec<String>)>,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        ctx.charge_work(1, Utf16::from(path))?;
        if let Some(create_schema) = get(node, "CreateSchemaStmt") {
            let schema = txt(get(create_schema, "schemaname"));
            for (i, child) in arr(get(create_schema, "schemaElts")).iter().enumerate() {
                visit(
                    child,
                    schema.as_deref(),
                    &format!("{path}/schemaElts/{i}"),
                    tables,
                    ctx,
                )?;
            }
            return Ok(());
        }
        let Some(create) = get(node, "CreateStmt") else {
            return Ok(());
        };
        let relation = get(create, "relation").unwrap_or(&Value::Null);
        let Some(name) = txt(get(relation, "relname")) else {
            return Ok(());
        };
        let schema = txt(get(relation, "schemaname")).or_else(|| schema_context.map(str::to_owned));
        let table = match schema {
            Some(schema) => format!("{schema}.{name}"),
            None => name,
        };
        let mut columns = Vec::new();
        for (column_index, column) in arr(get(create, "tableElts")).iter().enumerate() {
            ctx.charge_work(1, Utf16::from(format!("{path}/tableElts/{column_index}")))?;
            let Some(definition) = get(column, "ColumnDef") else {
                continue;
            };
            let Some(colname) = txt(get(definition, "colname")) else {
                continue;
            };
            let typ = get(definition, "typeName").and_then(|t| get(t, "names"));
            let typename = arr(typ)
                .iter()
                .filter_map(|n| {
                    get(get(n, "String")?, "sval").and_then(|v| match v {
                        Value::String(s) => s.to_utf8().ok(),
                        _ => None,
                    })
                })
                .collect::<Vec<_>>()
                .join(".");
            if !typename.is_empty() {
                columns.push((colname, typename));
            }
        }
        let mut partition_keys = Vec::new();
        for (i, param) in arr(get(
            get(create, "partspec").unwrap_or(&Value::Null),
            "partParams",
        ))
        .iter()
        .enumerate()
        {
            ctx.charge_work(1, Utf16::from(format!("{path}/partspec/{i}")))?;
            if let Some(value) = get(get(param, "PartitionElem").unwrap_or(&Value::Null), "name")
                .and_then(|v| match v {
                    Value::String(s) => s.to_utf8().ok(),
                    _ => None,
                })
            {
                partition_keys.push(value);
            }
        }
        tables.push((table, columns, partition_keys));
        Ok(())
    }
    let ast = get(declarations, "ast").unwrap_or(&Value::Null);
    for (i, stmt) in arr(get(ast, "stmts")).iter().enumerate() {
        if let Some(statement) = get(stmt, "stmt") {
            visit(
                statement,
                None,
                &format!("/stmts/{i}/stmt"),
                &mut tables,
                ctx,
            )?;
        }
    }
    Ok(tables)
}

/// Prepare SQL candidates and residuals. Parsing/deparsing remains an explicit
/// host backend operation; callers return its per-index result to `complete`.
pub fn prepare(
    resources: &BindingIndexProjectionResources,
    logical: &Value,
    binding: &Value,
    native_archive: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let inspection = postgresql_sql_runtime::inspect_postgresql_sql(native_archive, ctx)?;
    let unsupported = arr(get(&inspection, "diagnostics"))
        .iter()
        .any(|diagnostic| {
            eq(get(diagnostic, "code"), "POSTGRESQL_VERSION")
                || eq(get(diagnostic, "code"), "POSTGRESQL_REPRESENTATION")
        });
    if !matches!(get(&inspection, "valid"), Some(Value::Bool(true))) || unsupported {
        return Err(err(
            "POSTGRESQL_INDEX_SOURCE",
            "",
            "Native PostgreSQL source is invalid or outside the qualified index profile",
        ));
    }
    let tagged =
        postgresql_sql_runtime::get_postgresql_node(native_archive, &Utf16::default(), ctx)?;
    let tree = NativeJsonTree::from_tagged_value(&tagged, ctx)?;
    let compact = tree.render_compact(ctx)?;
    let ast = serialization::read_json_value(compact.units(), Format::Json, ctx)?;
    let validation = postgresql_sql_runtime::validate_postgresql_ast(&ast, ctx)?;
    if !matches!(get(&validation, "valid"), Some(Value::Bool(true))) {
        return Err(err(
            "POSTGRESQL_INDEX_SOURCE",
            "",
            "Native PostgreSQL AST is invalid",
        ));
    }
    let declarations = obj(vec![("ast", ast)]);
    let admitted = binding_index_projection::project_binding_indexes(
        resources, binding, logical, "report", ctx,
    )?;
    let source = get(&admitted, "source")
        .ok_or_else(|| err("BINDING_DOCUMENT", "", "Validated binding missing"))?;
    let payload = get(
        get(source, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .ok_or_else(|| {
        err(
            "BINDING_DOCUMENT",
            "/extensions/umf.binding",
            "Binding extension payload missing",
        )
    })?;
    let target = get(payload, "target").ok_or_else(|| {
        err(
            "BINDING_DOCUMENT",
            "/extensions/umf.binding/target",
            "Binding target missing",
        )
    })?;
    if !eq(get(target, "system"), "postgresql")
        || !txt(get(target, "version")).is_some_and(|v| {
            v.starts_with("17") && (v.len() == 2 || v.as_bytes().get(2) == Some(&b'.'))
        })
    {
        return Err(err(
            "BINDING_TARGET",
            "/extensions/umf.binding/target",
            "Expected pinned PostgreSQL 17 binding",
        ));
    }
    let tables = declarations_tables(&declarations, ctx)?;
    let mut residuals = Vec::new();
    let mut candidates = Vec::new();
    for (i, item) in arr(get(payload, "indexes")).iter().enumerate() {
        let path = format!("/extensions/umf.binding/indexes/{i}");
        ctx.charge_work(1, Utf16::from(path.clone()))?;
        let kind = txt(get(item, "kind")).unwrap_or_default();
        if kind == "clustering" {
            residual(
                &mut residuals,
                path,
                "PostgreSQL physical clustering is not this declared index kind",
                item,
                ctx,
            )?;
            continue;
        }
        let pred = get(item, "predicate");
        if pred.is_some()
            && (!eq(get(pred.unwrap(), "language"), "postgresql")
                || !txt(get(pred.unwrap(), "version")).is_some_and(|v| {
                    v.starts_with("17") && (v.len() == 2 || v.as_bytes().get(2) == Some(&b'.'))
                }))
        {
            residual(
                &mut residuals,
                path,
                "Predicate language/version differs from PostgreSQL 17 profile",
                item,
                ctx,
            )?;
            continue;
        }
        let unique = matches!(get(item, "unique"), Some(Value::Bool(true)));
        if unique && !matches!(kind.as_str(), "btree" | "unique" | "expression" | "partial") {
            residual(
                &mut residuals,
                path,
                "Unique enforcement for this access method is outside the verified profile",
                item,
                ctx,
            )?;
            continue;
        }
        let include = arr(get(item, "include"));
        if !include.is_empty() && matches!(kind.as_str(), "gin" | "hash") {
            residual(
                &mut residuals,
                path,
                "Included columns are outside this access-method profile",
                item,
                ctx,
            )?;
            continue;
        }
        let on = arr(get(item, "on"));
        let first = on.first().ok_or_else(|| {
            err(
                "BINDING_DOCUMENT",
                "/extensions/umf.binding/indexes",
                "Index target is missing",
            )
        })?;
        let owner = get(first, "field")
            .or_else(|| get(first, "documentPath").and_then(|p| get(p, "field")))
            .and_then(|f| {
                get(f, "module")
                    .and_then(|m| txt(Some(m)))
                    .zip(get(f, "element").and_then(|e| txt(Some(e))))
            });
        let element = owner.as_ref().and_then(|(module, id)| {
            arr(get(payload, "elements"))
                .iter()
                .find(|e| eq(get(e, "module"), module) && eq(get(e, "element"), id))
        });
        let Some(table) = element.and_then(|e| txt(get(e, "table"))) else {
            residual(
                &mut residuals,
                path,
                "Index owner needs an exact table override in native source",
                item,
                ctx,
            )?;
            continue;
        };
        let Some((_, columns, partition_keys)) = tables.iter().find(|(name, _, _)| name == &table)
        else {
            residual(
                &mut residuals,
                path,
                "Index owner needs an exact table override in native source",
                item,
                ctx,
            )?;
            continue;
        };
        let mut valid = true;
        let mut terms = Vec::new();
        let mut indexed_columns = Vec::new();
        for target in on {
            let ref_value = get(target, "field")
                .or_else(|| get(target, "documentPath").and_then(|p| get(p, "field")));
            let Some(reference) = ref_value else {
                valid = false;
                terms.push(String::new());
                continue;
            };
            let field = arr(get(payload, "fields"))
                .iter()
                .find(|f| same_ref(f, reference));
            let Some(field) = field else {
                valid = false;
                terms.push(String::new());
                continue;
            };
            if get(target, "field").is_some() {
                let Some(column) = txt(get(field, "column")) else {
                    valid = false;
                    terms.push(String::new());
                    continue;
                };
                if !columns.iter().any(|(n, _)| n == &column) {
                    valid = false;
                    terms.push(String::new());
                    continue;
                }
                match quote(get(field, "column"), 63) {
                    Ok(q) => terms.push(q),
                    Err(_) => {
                        valid = false;
                        terms.push(String::new());
                    }
                }
                indexed_columns.push(column);
            } else {
                let dp = get(target, "documentPath").unwrap_or(&Value::Null);
                let path = arr(get(dp, "path"));
                let field_path = arr(get(field, "path"));
                if !eq(get(field, "storage"), "embedded") || path != field_path {
                    valid = false;
                    terms.push(String::new());
                    continue;
                }
                let Some(doc_column) = txt(get(field, "documentColumn")) else {
                    valid = false;
                    terms.push(String::new());
                    continue;
                };
                if !columns
                    .iter()
                    .any(|(n, t)| n == &doc_column && t.split('.').last() == Some("jsonb"))
                {
                    valid = false;
                    terms.push(String::new());
                    continue;
                }
                let segments = path
                    .iter()
                    .map(|v| txt(Some(v)).map(|x| literal(&x)).ok_or(()))
                    .collect::<Result<Vec<_>, _>>();
                let Ok(segments) = segments else {
                    valid = false;
                    terms.push(String::new());
                    continue;
                };
                match quote(get(field, "documentColumn"), 63) {
                    Ok(q) => terms.push(format!("({q} #>> ARRAY[{}]::text[])", segments.join(","))),
                    Err(_) => {
                        valid = false;
                        terms.push(String::new());
                    }
                }
            }
        }
        let mut includes = Vec::new();
        for reference in include {
            let field = arr(get(payload, "fields"))
                .iter()
                .find(|f| same_ref(f, reference));
            let column = field.and_then(|f| txt(get(f, "column")));
            if let Some(column) = column.filter(|n| columns.iter().any(|(c, _)| c == n)) {
                match quote(Some(get(field.unwrap(), "column").unwrap()), 63) {
                    Ok(q) => includes.push(q),
                    Err(_) => valid = false,
                }
            } else {
                valid = false;
            }
        }
        if !valid {
            residual(
                &mut residuals,
                path,
                "Index field or JSONB document column is absent from native table",
                item,
                ctx,
            )?;
            continue;
        }
        if unique
            && partition_keys
                .iter()
                .any(|column| !indexed_columns.contains(column))
        {
            residual(
                &mut residuals,
                path,
                "Unique index on a partitioned table must include every partition key",
                item,
                ctx,
            )?;
            continue;
        }
        if matches!(kind.as_str(), "gin" | "gist") {
            let supported = on.iter().all(|target| {
                if get(target, "field").is_none() {
                    return false;
                }
                let f = arr(get(payload, "fields"))
                    .iter()
                    .find(|f| same_ref(f, get(target, "field").unwrap()));
                let col = f.and_then(|f| txt(get(f, "column")));
                let ty = col
                    .as_ref()
                    .and_then(|c| columns.iter().find(|(n, _)| n == c))
                    .map(|(_, t)| t.split('.').last().unwrap_or(""));
                if kind == "gin" {
                    ty == Some("jsonb")
                } else {
                    ty == Some("point")
                }
            });
            if !supported {
                residual(
                    &mut residuals,
                    path,
                    "No verified default operator class for this index method and column type",
                    item,
                    ctx,
                )?;
                continue;
            }
        }
        let method = if matches!(kind.as_str(), "btree" | "hash" | "gin" | "gist") {
            kind.as_str()
        } else {
            "btree"
        };
        let predicate = txt(get(
            get(item, "predicate").unwrap_or(&Value::Null),
            "expression",
        ));
        if predicate.as_ref().is_some_and(|p| {
            p.contains(';') || p.contains("--") || p.contains("/*") || p.trim().is_empty()
        }) {
            residual(
                &mut residuals,
                path,
                "Predicate is outside the single-expression SQL subset",
                item,
                ctx,
            )?;
            continue;
        }
        let table_sql = table
            .split('.')
            .map(|part| quote(Some(&Value::string_utf8(part)), 63))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| {
                err(
                    "POSTGRESQL_IDENTIFIER",
                    "",
                    "Invalid PostgreSQL table identifier",
                )
            })?
            .join(".");
        let name = quote(get(item, "name"), 63)?;
        let sql = format!(
            "CREATE {}INDEX {} ON {} USING {} ({}){}{};",
            if unique { "UNIQUE " } else { "" },
            name,
            table_sql,
            method,
            terms.join(", "),
            if includes.is_empty() {
                String::new()
            } else {
                format!(" INCLUDE ({})", includes.join(", "))
            },
            predicate
                .map(|p| format!(" WHERE ({p})"))
                .unwrap_or_default()
        );
        candidates.push(obj(vec![
            ("path", s(path)),
            ("choice", copy_json(item, ctx)?),
            ("statement", s(sql)),
        ]));
    }
    Ok(obj(vec![
        ("status", s("prepared")),
        ("logical", copy_json(logical, ctx)?),
        ("binding", copy_json(source, ctx)?),
        ("nativeArchive", copy_json(native_archive, ctx)?),
        ("target", copy_json(target, ctx)?),
        ("residuals", Value::Array(residuals)),
        ("candidates", Value::Array(candidates)),
    ]))
}

/// Complete the staged projection with explicit parser/deparser outcomes.
pub fn complete(
    prepared: &Value,
    parser_archives: &Value,
    loss_policy: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if loss_policy != "strict" && loss_policy != "report" {
        return Err(err(
            "BINDING_LOSS_POLICY",
            "",
            "Expected strict or report loss policy",
        ));
    }
    let candidates = arr(get(prepared, "candidates"));
    let archives = arr(Some(parser_archives));
    if candidates.len() != archives.len() {
        return Err(err(
            "POSTGRESQL_INDEX_BACKEND",
            "",
            "Parser results do not match prepared candidates",
        ));
    }
    let mut residuals = arr(get(prepared, "residuals"))
        .iter()
        .map(|v| copy_json(v, ctx))
        .collect::<Result<Vec<_>, _>>()?;
    let mut statements = Vec::new();
    for (candidate, archive) in candidates.iter().zip(archives) {
        let path = txt(get(candidate, "path")).unwrap_or_default();
        let choice = get(candidate, "choice").unwrap_or(&Value::Null);
        if matches!(archive, Value::Null) {
            residual(
                &mut residuals,
                path,
                "Index DDL fails pinned PostgreSQL parser/deparser/codec",
                choice,
                ctx,
            )?;
            continue;
        }
        let statement = txt(get(candidate, "statement")).ok_or_else(|| {
            err(
                "POSTGRESQL_INDEX_RECEIPT",
                &path,
                "Generated index statement is missing",
            )
        })?;
        let source = postgresql_sql_runtime::get_postgresql_source(archive, ctx)?;
        if txt(Some(&source)).as_deref() != Some(statement.as_str()) {
            return Err(err(
                "POSTGRESQL_INDEX_RECEIPT",
                &path,
                "Index parser receipt differs from selected SQL",
            ));
        }
        let shape = one_index_statement(archive, ctx)?;
        let inspection = postgresql_sql_runtime::inspect_postgresql_sql(archive, ctx)?;
        if !shape || !matches!(get(&inspection, "valid"), Some(Value::Bool(true))) {
            residual(
                &mut residuals,
                path,
                "Index DDL fails pinned PostgreSQL parser/deparser/codec",
                choice,
                ctx,
            )?;
            continue;
        }
        statements.push(statement);
    }
    let status = if residuals.is_empty() {
        "proposed"
    } else if loss_policy == "strict" {
        "blocked"
    } else {
        "reported"
    };
    let mut output = vec![
        ("status", s(status)),
        (
            "logical",
            copy_json(get(prepared, "logical").unwrap_or(&Value::Null), ctx)?,
        ),
        (
            "binding",
            copy_json(get(prepared, "binding").unwrap_or(&Value::Null), ctx)?,
        ),
        (
            "nativeArchive",
            copy_json(get(prepared, "nativeArchive").unwrap_or(&Value::Null), ctx)?,
        ),
        (
            "target",
            copy_json(get(prepared, "target").unwrap_or(&Value::Null), ctx)?,
        ),
        ("residuals", Value::Array(residuals)),
    ];
    if status != "blocked" && !statements.is_empty() {
        output.push(("candidate", s(format!("{}\n", statements.join("\n")))));
    }
    Ok(obj(output))
}

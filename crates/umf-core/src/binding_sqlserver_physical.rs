// SPDX-License-Identifier: MIT OR Apache-2.0
//! Source-retaining composition of SQL Server table, key, relationship and
//! index proposals. This creates a DDL candidate; it never executes it.
use crate::{
    binding_index_projection::BindingIndexProjectionResources,
    binding_inspection::BindingInspectionResources,
    binding_sqlserver_planned_indexes, binding_sqlserver_tables,
    context::Context,
    error::EngineError,
    schema::{CompiledSchema, SchemaResources},
    serialization::{read_json_value, Format},
    sqlserver_relationship_layout,
    value::{copy_json, Utf16, Value},
};
use std::collections::{HashMap, HashSet};

const RESULT_SCHEMA: &str =
    include_str!("../../../spec/projections/sqlserver-physical-binding.schema.json");
const CORE_SCHEMA: &str = include_str!("../../../spec/core/schema.json");
const LAYOUT_SCHEMA: &str =
    include_str!("../../../spec/projections/sqlserver-relationship-layout.schema.json");

fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn get<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    if let Value::Object(fields) = v {
        fields.iter().find(|(n, _)| n == &k(name)).map(|(_, v)| v)
    } else {
        None
    }
}
fn arr(v: Option<&Value>) -> Option<&[Value]> {
    if let Some(Value::Array(xs)) = v {
        Some(xs)
    } else {
        None
    }
}
fn text(v: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(s)) = v {
        Some(s)
    } else {
        None
    }
}
fn utf8(v: Option<&Value>) -> Option<String> {
    text(v).and_then(|s| s.to_utf8().ok())
}
fn eq(v: Option<&Value>, expected: &str) -> bool {
    utf8(v).as_deref() == Some(expected)
}
fn s(x: &str) -> Value {
    Value::string_utf8(x)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(a, b)| (k(a), b)).collect())
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn array(v: &[Value]) -> Value {
    Value::Array(v.to_vec())
}
fn quote(s: &str) -> Result<String, EngineError> {
    if s.is_empty()
        || s.encode_utf16().count() > 128
        || s.trim() != s
        || s.starts_with('#')
        || s.contains('\0')
    {
        return Err(err(
            "SQLSERVER_IDENTIFIER",
            "Expected a permanent, nonempty identifier of at most 128 UTF-16 units without edge whitespace",
        ));
    }
    Ok(format!("[{}]", s.replace(']', "]]")))
}
fn qualified(s: &str) -> Result<String, EngineError> {
    let mut parts = s.split('.');
    let a = parts.next().unwrap_or_default();
    let b = parts.next().unwrap_or_default();
    if a.is_empty() || b.is_empty() || parts.next().is_some() {
        return Err(err(
            "SQLSERVER_PHYSICAL_TABLE",
            "Exact schema.table required",
        ));
    }
    Ok(format!("{}.{}", quote(a)?, quote(b)?))
}
fn literal(s: &str) -> Result<String, EngineError> {
    if s.contains('\0') {
        return Err(err("SQLSERVER_TEXT", "Expected valid Unicode without NUL"));
    }
    Ok(format!("N'{}'", s.replace('\'', "''")))
}
fn same_ref(a: &Value, b: &Value, names: &[&str]) -> bool {
    names.iter().all(|n| get(a, n) == get(b, n))
}
fn id(v: &Value) -> String {
    ["module", "element"]
        .iter()
        .map(|n| {
            text(get(v, n))
                .map(|v| v.units().iter().map(|u| format!("{u:04x}")).collect())
                .unwrap_or_else(|| "<missing>".into())
        })
        .collect::<Vec<String>>()
        .join("\u{1f}")
}
fn bound_id(v: &Value) -> String {
    ["module", "element", "field"]
        .iter()
        .map(|n| {
            text(get(v, n))
                .map(|v| v.units().iter().map(|u| format!("{u:04x}")).collect())
                .unwrap_or_else(|| "<missing>".into())
        })
        .collect::<Vec<String>>()
        .join("\u{1f}")
}
fn key_id(v: &Value) -> String {
    ["module", "element", "key"]
        .iter()
        .map(|n| {
            text(get(v, n))
                .map(|v| v.units().iter().map(|u| format!("{u:04x}")).collect())
                .unwrap_or_else(|| "<missing>".into())
        })
        .collect::<Vec<String>>()
        .join("\u{1f}")
}
fn replace_member(value: &mut Value, name: &str, replacement: Value) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(err("SQLSERVER_PHYSICAL_REQUEST", "Expected object"));
    };
    let key = k(name);
    if let Some((_, v)) = fields.iter_mut().find(|(n, _)| *n == key) {
        *v = replacement;
    } else {
        fields.push((key, replacement));
    }
    Ok(())
}

fn find_logical_record<'a>(logical: &'a Value, identity: &Value) -> Option<&'a Value> {
    arr(get(logical, "modules"))?.iter().find_map(|module| {
        arr(get(module, "elements"))?
            .iter()
            .find(|record| id(record) == id(identity))
    })
}
fn logical_record_path(logical: &Value, identity: &Value) -> Result<String, EngineError> {
    for (module_index, module) in arr(get(logical, "modules"))
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        for (element_index, record) in arr(get(module, "elements"))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            if id(record) == id(identity) {
                return Ok(format!("/modules/{module_index}/elements/{element_index}"));
            }
        }
    }
    Err(err(
        "SQLSERVER_PHYSICAL_RECEIPT",
        "Logical record for table residual is missing",
    ))
}
fn pointer_escape(value: &str) -> String {
    value.replace('~', "~0").replace('/', "~1")
}

fn json_equal(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Null, Value::Null) => true,
        (Value::Bool(a), Value::Bool(b)) => a == b,
        (Value::Number(a), Value::Number(b)) => a == b,
        (Value::String(a), Value::String(b)) => a == b,
        (Value::Array(a), Value::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(x, y)| json_equal(x, y))
        }
        (Value::Object(a), Value::Object(b)) => {
            a.len() == b.len()
                && a.iter().all(|(k, v)| {
                    b.iter()
                        .find(|(n, _)| n == k)
                        .is_some_and(|(_, w)| json_equal(v, w))
                })
        }
        _ => false,
    }
}
fn maximum_bytes(sql: &str) -> f64 {
    match sql {
        "bit" | "tinyint" => 1.0,
        "smallint" => 2.0,
        "int" => 4.0,
        "bigint" => 8.0,
        "date" => 3.0,
        _ => {
            for (prefix, mul) in [("nvarchar(", 2.0), ("varbinary(", 1.0)] {
                if let Some(x) = sql.strip_prefix(prefix).and_then(|x| x.strip_suffix(')')) {
                    if x == "max" {
                        return f64::INFINITY;
                    }
                    if let Ok(n) = x.parse::<f64>() {
                        return n * mul;
                    }
                }
            }
            if let Some(p) = sql
                .strip_prefix("decimal(")
                .and_then(|x| x.split(',').next())
                .and_then(|x| x.parse::<u8>().ok())
            {
                return if p <= 9 {
                    5.0
                } else if p <= 19 {
                    9.0
                } else if p <= 28 {
                    13.0
                } else {
                    17.0
                };
            }
            if sql.starts_with("datetimeoffset") {
                10.0
            } else {
                8.0
            }
        }
    }
}
fn sql_type(row: &Value) -> Result<String, EngineError> {
    let mut out = utf8(get(row, "sqlType"))
        .ok_or_else(|| err("SQLSERVER_PHYSICAL_POLICY", "SQL type must be UTF-8"))?;
    if let Some(c) = utf8(get(row, "collation")) {
        out.push_str(" COLLATE ");
        out.push_str(&c);
    }
    out.push_str(if matches!(get(row, "nullable"), Some(Value::Bool(true))) {
        " NULL"
    } else {
        " NOT NULL"
    });
    Ok(out)
}
fn load_schema(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}
fn schemas(ctx: &mut Context<'_>) -> Result<(CompiledSchema, CompiledSchema), EngineError> {
    let root = load_schema(RESULT_SCHEMA, ctx)?;
    let policy = get(get(&root, "properties").unwrap_or(&Value::Null), "policy")
        .cloned()
        .ok_or_else(|| err("SQLSERVER_PHYSICAL_SCHEMA", "Policy schema is missing"))?;
    let mut resources = SchemaResources::default();
    resources
        .entries
        .push((k("urn:umf:core:0.10.0"), load_schema(CORE_SCHEMA, ctx)?));
    resources.entries.push((
        k("urn:umf:sqlserver:relationship-layout:1.0.0"),
        load_schema(LAYOUT_SCHEMA, ctx)?,
    ));
    Ok((
        CompiledSchema::compile(&root, &resources, ctx)?,
        CompiledSchema::compile(&policy, &resources, ctx)?,
    ))
}
fn result(
    logical: Value,
    binding: Value,
    policy: Value,
    loss: &str,
    native: Option<(Value, Value)>,
    residuals: Vec<Value>,
    mappings: Vec<Value>,
    diagnostics: Vec<Value>,
    status: &str,
    candidate: Option<Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut out = vec![
        ("operation", s("project-binding-sqlserver")),
        ("version", s("1.0.0")),
        ("status", s(status)),
        ("logical", logical),
        ("binding", binding),
        ("policy", policy),
        ("lossPolicy", s(loss)),
        ("residuals", Value::Array(residuals.clone())),
        ("mappings", Value::Array(mappings)),
        ("diagnostics", Value::Array(diagnostics)),
    ];
    if let Some((archive, source)) = native {
        out.push(("nativeArchive", archive));
        out.push(("nativeSource", source));
    }
    if let Some(c) = candidate {
        out.push(("candidate", c));
    }
    let _ = crate::serialization::stringify_compact_metered(
        &Value::Object(out.iter().map(|(n, v)| (k(n), v.clone())).collect()),
        ctx,
    )?;
    Ok(Value::Object(
        out.into_iter().map(|(n, v)| (k(n), v)).collect(),
    ))
}

/// Compose the existing Rust table/index kernels with the Rust relationship layout rules.
pub fn project_binding_to_sqlserver(
    index_resources: &BindingIndexProjectionResources,
    binding_resources: &BindingInspectionResources,
    logical_input: &Value,
    binding_input: &Value,
    policy_input: &Value,
    loss: &str,
    native_source: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if loss != "strict" && loss != "report" {
        return Err(err(
            "SQLSERVER_PHYSICAL_REQUEST",
            "Malformed explicit policy or loss mode",
        ));
    }
    let logical = copy_json(logical_input, ctx)?;
    let binding = copy_json(binding_input, ctx)?;
    let policy = copy_json(policy_input, ctx)?;
    let (result_schema, policy_schema) = schemas(ctx)?;
    if !policy_schema.validate(&policy, ctx)?.is_empty() {
        return Err(err(
            "SQLSERVER_PHYSICAL_REQUEST",
            "Malformed explicit SQL Server policy",
        ));
    }
    let native = if let Some(source) = native_source {
        let Some(source_text) = text(Some(source)) else {
            return Err(err(
                "SQLSERVER_PHYSICAL_REQUEST",
                "nativeSource must be text",
            ));
        };
        let catalog = crate::sqlserver_adapter::SqlServerCatalog::import(source_text, ctx)?;
        let archive = crate::sqlserver_adapter::document_value(
            &k("sqlserver-physical-native-archive"),
            &catalog,
            ctx,
        )?;
        Some((archive, Value::String(source_text.clone())))
    } else {
        None
    };
    let mut residuals = vec![
        obj(vec![
            ("source", s("logical")),
            ("path", s("/")),
            ("reason", s("Complete original logical content remains retained; generated SQL is a qualified approximation, never authored intent recovery from native-only input")),
            ("value", copy_json(&logical, ctx)?),
        ]),
        obj(vec![
            ("source", s("binding")),
            ("path", s("/")),
            ("reason", s("All binding content remains independently recoverable from the receipt")),
            ("value", copy_json(&binding, ctx)?),
        ]),
    ];
    if let Some((_, source)) = &native {
        residuals.push(obj(vec![("source",s("native")),("path",s("/")),("reason",s("Original permission-limited catalog text is preserved, not treated as an authenticated existing database to mutate")),("value",source.clone())]));
    }
    let mut diagnostics = Vec::<Value>::new();
    let mut mappings = Vec::<Value>::new();
    let layout = sqlserver_relationship_layout::validate_sqlserver_relationship_layout(
        index_resources,
        binding_resources,
        &logical,
        &binding,
        get(&policy, "layout").unwrap_or(&Value::Null),
        "report",
        ctx,
    )?;
    residuals.extend(
        arr(get(&layout, "residuals"))
            .unwrap_or(&[])
            .iter()
            .map(|r| {
                let source = utf8(get(r, "source")).unwrap_or_default();
                let old = utf8(get(r, "path")).unwrap_or_default();
                let path = if source == "policy" {
                    format!("/layout{old}")
                } else {
                    old
                };
                obj(vec![
                    ("source", s(&source)),
                    ("path", s(&path)),
                    ("reason", get(r, "reason").cloned().unwrap_or(Value::Null)),
                    ("value", get(r, "value").cloned().unwrap_or(Value::Null)),
                ])
            }),
    );
    diagnostics.extend(
        arr(get(&layout, "diagnostics"))
            .unwrap_or(&[])
            .iter()
            .cloned(),
    );
    let payload = get(
        get(&binding, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .ok_or_else(|| err("BINDING_DOCUMENT", "Binding extension payload is missing"))?;
    let target = get(payload, "target")
        .ok_or_else(|| err("BINDING_DOCUMENT", "Binding target is missing"))?;
    if !eq(get(target, "system"), "sqlserver")
        || !eq(get(target, "version"), "2022")
        || !eq(
            get(target, "subset"),
            "ordinary-tables-json-text-relationships-indexes",
        )
    {
        return Err(err(
            "SQLSERVER_PHYSICAL_TARGET",
            "Expected SQL Server 2022 full physical binding subset",
        ));
    }
    let finish = |status: &str,
                  candidate: Option<Value>,
                  residuals: Vec<Value>,
                  mappings: Vec<Value>,
                  mut diagnostics: Vec<Value>,
                  ctx: &mut Context<'_>|
     -> Result<Value, EngineError> {
        for r in &residuals {
            diagnostics.push(obj(vec![
                ("code", s("SQLSERVER_PHYSICAL_RESIDUAL")),
                (
                    "path",
                    s(&format!(
                        "/{}{}",
                        utf8(get(r, "source")).unwrap_or_default(),
                        utf8(get(r, "path")).unwrap_or_default()
                    )),
                ),
                ("message", get(r, "reason").cloned().unwrap_or(Value::Null)),
                (
                    "severity",
                    s(if status == "blocked" {
                        "error"
                    } else {
                        "warning"
                    }),
                ),
            ]));
        }
        let report = result(
            logical.clone(),
            binding.clone(),
            policy.clone(),
            loss,
            native.clone(),
            residuals,
            mappings,
            diagnostics,
            status,
            candidate,
            ctx,
        )?;
        if !result_schema.validate(&report, ctx)?.is_empty() {
            return Err(err(
                "SQLSERVER_PHYSICAL_RESULT",
                "Generated receipt failed its pinned schema",
            ));
        }
        Ok(report)
    };
    let Some(p) = get(&layout, "candidate") else {
        return finish("blocked", None, residuals, mappings, diagnostics, ctx);
    };
    let fields = arr(get(payload, "fields")).unwrap_or(&[]);
    let elements = arr(get(payload, "elements")).unwrap_or(&[]);
    let indexes = arr(get(payload, "indexes")).unwrap_or(&[]);
    let mut physical = HashMap::<String, String>::new();
    for f in fields {
        let Some(owner) = elements.iter().find(|e| id(e) == id(f)) else {
            continue;
        };
        let Some(table) = utf8(get(owner, "table")) else {
            continue;
        };
        let col = if eq(get(f, "storage"), "column") {
            utf8(get(f, "column"))
        } else {
            utf8(get(f, "documentColumn"))
        };
        if let Some(col) = col {
            let key = format!("{}.{}", table.to_lowercase(), col.to_lowercase());
            if physical
                .insert(key, col.clone())
                .is_some_and(|previous| previous != col)
            {
                return Err(err(
                    "SQLSERVER_PHYSICAL_COLUMN",
                    "Column names collide under the case-insensitive profile",
                ));
            }
        }
    }
    for index in indexes {
        if let Some(predicate) = get(index, "predicate") {
            let expression = text(get(predicate, "expression"))
                .ok_or_else(|| err("SQLSERVER_TEXT", "Expected valid Unicode without NUL"))?;
            let expr = expression
                .to_utf8()
                .map_err(|_| err("SQLSERVER_TEXT", "Expected valid Unicode without NUL"))?;
            let _ = literal(&expr)?;
            if expr.trim() != expr
                || expr
                    .chars()
                    .any(|c| matches!(c, '\r' | '\n' | '\u{2028}' | '\u{2029}'))
            {
                return Err(err(
                    "SQLSERVER_PHYSICAL_PREDICATE",
                    "Predicate whitespace must be explicit canonical single-line text",
                ));
            }
        }
    }
    let staged = copy_json(&binding, ctx)?;
    let mut staged = staged;
    let Value::Object(ref mut ext) = staged else {
        return Err(err(
            "BINDING_DOCUMENT",
            "Binding document must be an object",
        ));
    };
    let Some((_, binding_ext)) = ext.iter_mut().find(|(n, _)| n == &k("extensions")) else {
        return Err(err(
            "BINDING_DOCUMENT",
            "Binding extension payload is missing",
        ));
    };
    let Some((_, payload_mut)) = (if let Value::Object(ref mut fields) = binding_ext {
        fields.iter_mut().find(|(n, _)| n == &k("umf.binding"))
    } else {
        None
    }) else {
        return Err(err(
            "BINDING_DOCUMENT",
            "Binding extension payload is missing",
        ));
    };
    let target_mut = if let Value::Object(ref mut fields) = payload_mut {
        fields
            .iter_mut()
            .find(|(n, _)| n == &k("target"))
            .map(|(_, v)| v)
    } else {
        None
    }
    .ok_or_else(|| err("BINDING_DOCUMENT", "Binding target is missing"))?;
    replace_member(
        target_mut,
        "subset",
        s("ordinary-tables-json-text-partition-scheme"),
    )?;
    let mut table_types = Vec::new();
    for f in arr(get(p, "fieldLayouts")).unwrap_or(&[]) {
        let mut row = get(f, "boundField").cloned().unwrap_or(Value::Null);
        replace_member(
            &mut row,
            "sqlType",
            get(f, "sqlType").cloned().unwrap_or(Value::Null),
        )?;
        table_types.push(row);
    }
    let table_policy = obj(vec![
        ("fieldTypes", Value::Array(table_types)),
        (
            "partitionFamilies",
            get(&policy, "partitionFamilies")
                .cloned()
                .unwrap_or(Value::Array(vec![])),
        ),
    ]);
    let tables = binding_sqlserver_tables::project_binding_tables_to_sqlserver(
        index_resources,
        &logical,
        &staged,
        &table_policy,
        "report",
        native_source,
        ctx,
    )?;
    let table_sql = utf8(get(&tables, "candidate"));
    for r in arr(get(&tables, "residuals")).unwrap_or(&[]) {
        let path = utf8(get(r, "path")).ok_or_else(|| {
            err(
                "SQLSERVER_PHYSICAL_RECEIPT",
                "Table projection returned a non-UTF-8 path",
            )
        })?;
        if path.starts_with("/extensions/umf.binding/relationships/")
            || path.starts_with("/extensions/umf.binding/indexes/")
        {
            continue;
        }
        let choice = get(r, "choice").cloned().unwrap_or(Value::Null);
        let element_index = path
            .strip_prefix("/extensions/umf.binding/elements/")
            .and_then(|index| index.parse::<usize>().ok());
        let owner = element_index.and_then(|index| elements.get(index));
        if let Some(owner) = owner.filter(|_| {
            utf8(get(r, "reason")).is_some_and(|reason| reason.contains("does not emit a primary"))
        }) {
            let record_path = logical_record_path(&logical, owner)?;
            residuals.push(obj(vec![
                ("source", s("logical")),
                (
                    "path",
                    s(&format!("{record_path}/extensions/umf.ddd/identity")),
                ),
                (
                    "reason",
                    s("DDD identity and scope remain distinct from emitted core Key constraints"),
                ),
                ("value", choice),
            ]));
        } else if let Some(owner) = owner.filter(|_| {
            utf8(get(r, "reason")).is_some_and(|reason| reason.starts_with("DDD aggregate"))
        }) {
            let record_path = logical_record_path(&logical, owner)?;
            residuals.push(obj(vec![
                ("source", s("logical")),
                (
                    "path",
                    s(&format!("{record_path}/extensions/umf.ddd/aggregate")),
                ),
                ("reason", get(r, "reason").cloned().unwrap_or(Value::Null)),
                ("value", choice),
            ]));
        } else if let Some(owner) = owner.filter(|_| {
            utf8(get(r, "reason")).as_deref() == Some("DDD field has no physical binding")
        }) {
            let field_name = utf8(get(&choice, "field")).ok_or_else(|| {
                err(
                    "SQLSERVER_PHYSICAL_RECEIPT",
                    "DDD field residual lacks a UTF-8 field identity",
                )
            })?;
            let record_path = logical_record_path(&logical, owner)?;
            let record = find_logical_record(&logical, owner).ok_or_else(|| {
                err(
                    "SQLSERVER_PHYSICAL_RECEIPT",
                    "DDD record for field residual is missing",
                )
            })?;
            let ddd_fields = get(
                get(get(record, "extensions").unwrap_or(&Value::Null), "umf.ddd")
                    .unwrap_or(&Value::Null),
                "fields",
            )
            .unwrap_or(&Value::Null);
            let value = get(ddd_fields, &field_name).ok_or_else(|| {
                err(
                    "SQLSERVER_PHYSICAL_RECEIPT",
                    "DDD field for residual is missing",
                )
            })?;
            residuals.push(obj(vec![
                ("source", s("logical")),
                (
                    "path",
                    s(&format!(
                        "{record_path}/extensions/umf.ddd/fields/{}",
                        pointer_escape(&field_name)
                    )),
                ),
                ("reason", get(r, "reason").cloned().unwrap_or(Value::Null)),
                ("value", copy_json(value, ctx)?),
            ]));
        } else {
            let source = if path.starts_with("/modules/") {
                "logical"
            } else {
                "binding"
            };
            residuals.push(obj(vec![
                ("source", s(source)),
                ("path", s(&path)),
                ("reason", get(r, "reason").cloned().unwrap_or(Value::Null)),
                ("value", choice),
            ]));
        }
    }
    let Some(table_sql) = table_sql else {
        return finish("blocked", None, residuals, mappings, diagnostics, ctx);
    };
    // Every explicitly declared direct column must have been consumed by the table kernel.
    for (i, field) in fields.iter().enumerate() {
        if !eq(get(field, "storage"), "column") {
            continue;
        }
        let expected = format!("/extensions/umf.binding/fields/{i}");
        if !arr(get(&tables, "mappings"))
            .unwrap_or(&[])
            .iter()
            .any(|m| utf8(get(m, "sourcePath")).as_deref() == Some(expected.as_str()))
        {
            return Err(err(
                "SQLSERVER_PHYSICAL_COLUMN",
                "A declared direct column was not emitted by the table plan",
            ));
        }
    }
    for mapping in arr(get(&tables, "mappings")).unwrap_or(&[]) {
        let source_path = utf8(get(mapping, "sourcePath")).ok_or_else(|| {
            err(
                "SQLSERVER_PHYSICAL_RECEIPT",
                "Table mapping source path is not UTF-8",
            )
        })?;
        let kind = if source_path.contains("/fields/") {
            "column"
        } else {
            "table"
        };
        let mut translated = copy_json(mapping, ctx)?;
        replace_member(
            &mut translated,
            "sourcePath",
            s(&format!("/binding{source_path}")),
        )?;
        replace_member(&mut translated, "kind", s(kind))?;
        replace_member(&mut translated, "outcome", s("approximated"))?;
        mappings.push(translated);
    }
    let mut statements = vec![table_sql];
    // Remaining DDL is emitted from the exact layout receipt in authored order.
    let mut reserved = HashSet::<String>::new();
    let mut index_names = HashSet::<String>::new();
    let reserve =
        |set: &mut HashSet<String>, namespace: &str, name: &str| -> Result<(), EngineError> {
            quote(name)?;
            let key = format!("{}.{}", namespace.to_lowercase(), name.to_lowercase());
            if !set.insert(key.clone()) {
                return Err(err(
                    "SQLSERVER_PHYSICAL_COLLISION",
                    &format!("Generated name collides: {key}"),
                ));
            }
            Ok(())
        };
    for e in elements {
        if let Some(table) = utf8(get(e, "table")) {
            if let Some(name) = table.split('.').nth(1) {
                reserve(
                    &mut reserved,
                    table.split('.').next().unwrap_or_default(),
                    name,
                )?;
            }
        }
    }
    for index in indexes {
        let name = utf8(get(index, "name")).unwrap_or_default();
        if let Some(target) = arr(get(index, "on")).and_then(|x| x.first()) {
            let reference = get(target, "field")
                .or_else(|| get(get(target, "documentPath").unwrap_or(&Value::Null), "field"));
            if let Some(reference) = reference {
                if let Some(owner) = elements.iter().find(|e| id(e) == id(reference)) {
                    if let Some(table) = utf8(get(owner, "table")) {
                        reserve(&mut index_names, &table, &name)?;
                    }
                }
            }
        }
    }
    let layouts = arr(get(p, "fieldLayouts")).unwrap_or(&[]);
    let key_layouts = arr(get(p, "keyLayouts")).unwrap_or(&[]);
    let relationship_layouts = arr(get(p, "relationshipLayouts")).unwrap_or(&[]);
    // Reserve the implicit JSON CHECK names emitted by the table kernel before
    // authored Key/relationship names are admitted into the same table namespace.
    let mut json_checks = HashSet::<String>::new();
    for field in fields
        .iter()
        .filter(|field| eq(get(field, "storage"), "embedded"))
    {
        let Some(owner) = elements.iter().find(|element| id(element) == id(field)) else {
            continue;
        };
        let table = utf8(get(owner, "table")).unwrap_or_default();
        let column = utf8(get(field, "documentColumn")).unwrap_or_default();
        let check_name = format!(
            "CK_{}_{}_json",
            table.split('.').nth(1).unwrap_or_default(),
            column
        );
        let location = format!("{table}.{check_name}");
        if json_checks.insert(location) {
            reserve(
                &mut reserved,
                table.split('.').next().unwrap_or_default(),
                &check_name,
            )?;
        }
    }
    for field in layouts {
        if text(get(field, "collation")).is_some_and(|c| !c.units().is_empty()) {
            let table = utf8(get(field, "table")).unwrap_or_default();
            let column = utf8(get(field, "column")).unwrap_or_default();
            statements.push(format!(
                "ALTER TABLE {} ALTER COLUMN {} {};",
                qualified(&table)?,
                quote(&column)?,
                sql_type(field)?
            ));
        }
    }
    let mut key_map = HashMap::<String, &Value>::new();
    for (i, key) in key_layouts.iter().enumerate() {
        let identity = key_id(key);
        key_map.insert(identity, key);
        let table = utf8(get(key, "table")).unwrap_or_default();
        let constraint = utf8(get(key, "constraint")).unwrap_or_default();
        let schema = table.split('.').next().unwrap_or_default();
        reserve(&mut reserved, schema, &constraint)?;
        reserve(&mut index_names, &table, &constraint)?;
        let components = arr(get(key, "components")).unwrap_or(&[]);
        let mut bytes = 0.0;
        let mut cols = Vec::new();
        for c in components {
            let sql = utf8(get(c, "sqlType")).unwrap_or_default();
            bytes += maximum_bytes(&sql);
            cols.push(quote(&utf8(get(c, "column")).unwrap_or_default())?);
        }
        if components.len() > 16 || bytes > 900.0 {
            return Err(err(
                "SQLSERVER_PHYSICAL_KEY_WIDTH",
                "This conservative Key profile limits tuples to 16 columns and 900 declared bytes",
            ));
        }
        let primary = arr(get(
            get(&logical, "modules").unwrap_or(&Value::Null),
            "elements",
        ))
        .is_some();
        let _ = primary;
        let authored = arr(get(
            get(&logical, "modules").unwrap_or(&Value::Null),
            "elements",
        ))
        .unwrap_or(&[]);
        let _ = authored;
        let primary = resolve_key_primary(&logical, key);
        statements.push(format!(
            "ALTER TABLE {} ADD CONSTRAINT {} {} NONCLUSTERED ({});",
            qualified(&table)?,
            quote(&constraint)?,
            if primary { "PRIMARY KEY" } else { "UNIQUE" },
            cols.join(", ")
        ));
        mappings.push(obj(vec![
            ("sourcePath", s(&format!("/policy/layout/keyLayouts/{i}"))),
            ("target", s(&format!("{table}.{constraint}"))),
            ("kind", s("key")),
            ("outcome", s("approximated")),
        ]));
    }
    // Anonymous junction and edge carrier tables are emitted before their constraints,
    // matching the authored relationship-layout order and preserving shared edge grouping.
    let mut anonymous: Vec<(String, Vec<&Value>)> = Vec::new();
    for layout in relationship_layouts {
        if eq(get(layout, "storage"), "foreign_key") || get(layout, "associationRecord").is_some() {
            continue;
        }
        let carrier = utf8(get(layout, "carrierTable"))
            .ok_or_else(|| err("SQLSERVER_PHYSICAL_LAYOUT", "Carrier table must be UTF-8"))?;
        if let Some((_, layouts)) = anonymous.iter_mut().find(|(table, _)| table == &carrier) {
            layouts.push(layout);
        } else {
            anonymous.push((carrier, vec![layout]));
        }
    }
    for (table, grouped) in &anonymous {
        let layout = grouped.first().ok_or_else(|| {
            err(
                "SQLSERVER_PHYSICAL_LAYOUT",
                "Anonymous carrier layout is missing",
            )
        })?;
        let source = arr(get(layout, "sourceComponents")).unwrap_or(&[]);
        let target = arr(get(layout, "targetComponents")).unwrap_or(&[]);
        let components = source.iter().chain(target.iter()).collect::<Vec<_>>();
        let discriminator = get(layout, "discriminator");
        let mut bytes = if discriminator.is_some() { 256.0 } else { 0.0 };
        for component in &components {
            bytes += maximum_bytes(&utf8(get(component, "sqlType")).unwrap_or_default());
        }
        if components.len() > 16 || bytes > 900.0 {
            return Err(err(
                "SQLSERVER_PHYSICAL_KEY_WIDTH",
                "Anonymous pair tuple exceeds the qualified Key size",
            ));
        }
        if components
            .iter()
            .any(|c| matches!(get(c, "nullable"), Some(Value::Bool(true))))
        {
            return Err(err(
                "SQLSERVER_PHYSICAL_NULL",
                "Anonymous pair identity requires non-null endpoint components",
            ));
        }
        let mut parts = table.split('.');
        let schema = parts.next().unwrap_or_default();
        let table_name = parts.next().unwrap_or_default();
        reserve(&mut reserved, schema, table_name)?;
        statements.push(format!(
            "IF SCHEMA_ID({}) IS NULL EXEC({});",
            literal(schema)?,
            literal(&format!("CREATE SCHEMA {}", quote(schema)?))?
        ));
        let mut defs = Vec::<String>::new();
        let mut pair = Vec::<String>::new();
        for component in &components {
            let column = utf8(get(component, "carrierColumn"))
                .ok_or_else(|| err("SQLSERVER_PHYSICAL_LAYOUT", "Carrier column must be UTF-8"))?;
            defs.push(format!("{} {}", quote(&column)?, sql_type(component)?));
            pair.push(quote(&column)?);
        }
        if let Some(discriminator) = discriminator {
            let column = utf8(get(discriminator, "column")).ok_or_else(|| {
                err(
                    "SQLSERVER_PHYSICAL_LAYOUT",
                    "Discriminator column must be UTF-8",
                )
            })?;
            defs.push(format!("{} {}", quote(&column)?, sql_type(discriminator)?));
            let values = grouped
                .iter()
                .filter_map(|x| get(x, "discriminator"))
                .map(|d| {
                    let value = utf8(get(d, "value")).ok_or_else(|| {
                        err(
                            "SQLSERVER_PHYSICAL_LAYOUT",
                            "Discriminator value must be UTF-8",
                        )
                    })?;
                    literal(&value)
                })
                .collect::<Result<Vec<_>, _>>()?;
            let check_name = format!("CK_{}_kind", table_name);
            reserve(&mut reserved, schema, &check_name)?;
            defs.push(format!(
                "CHECK ({} IN ({}))",
                quote(&column)?,
                values.join(", ")
            ));
            pair.insert(0, quote(&column)?);
        }
        let pk = format!("PK_{}_pair", table_name);
        reserve(&mut reserved, schema, &pk)?;
        reserve(&mut index_names, table, &pk)?;
        defs.push(format!(
            "CONSTRAINT {} PRIMARY KEY NONCLUSTERED ({})",
            quote(&pk)?,
            pair.join(", ")
        ));
        statements.push(format!(
            "CREATE TABLE {} (\n  {}\n);",
            qualified(table)?,
            defs.join(",\n  ")
        ));
    }

    // Emit endpoint foreign keys and multiplicity indexes from the exact validated layout.
    for (i, layout) in relationship_layouts.iter().enumerate() {
        let rel_ref = get(layout, "relationship").unwrap_or(&Value::Null);
        let relationship = arr(get(&logical, "modules"))
            .unwrap_or(&[])
            .iter()
            .find_map(|module| {
                if get(module, "id") != get(rel_ref, "module") {
                    return None;
                }
                arr(get(module, "relationships"))?
                    .iter()
                    .find(|r| get(r, "id") == get(rel_ref, "id"))
            })
            .ok_or_else(|| {
                err(
                    "SQLSERVER_PHYSICAL_LAYOUT",
                    "Authored relationship for validated layout is missing",
                )
            })?;
        let carrier = utf8(get(layout, "carrierTable"))
            .ok_or_else(|| err("SQLSERVER_PHYSICAL_LAYOUT", "Carrier table must be UTF-8"))?;
        if get(layout, "associationRecord").is_some() && get(layout, "discriminator").is_some() {
            return Err(err("SQLSERVER_PHYSICAL_ASSOCIATION", "Edge discriminator for a bound association Record needs an explicit bound Field policy"));
        }
        let emit_fk = |key_ref: &Value,
                       components: &[Value],
                       constraint: &Value,
                       statements: &mut Vec<String>,
                       reserved: &mut HashSet<String>|
         -> Result<(), EngineError> {
            let key = key_map.get(&key_id(key_ref)).copied().ok_or_else(|| {
                err(
                    "SQLSERVER_PHYSICAL_LAYOUT",
                    "Relationship endpoint Key layout is missing",
                )
            })?;
            let name = utf8(Some(constraint))
                .ok_or_else(|| err("SQLSERVER_PHYSICAL_LAYOUT", "Constraint name must be UTF-8"))?;
            reserve(
                reserved,
                carrier.split('.').next().unwrap_or_default(),
                &name,
            )?;
            let from = components
                .iter()
                .map(|c| {
                    utf8(get(c, "carrierColumn"))
                        .ok_or_else(|| {
                            err("SQLSERVER_PHYSICAL_LAYOUT", "Carrier column must be UTF-8")
                        })
                        .and_then(|x| quote(&x))
                })
                .collect::<Result<Vec<_>, _>>()?;
            let to = arr(get(key, "components"))
                .unwrap_or(&[])
                .iter()
                .map(|c| {
                    utf8(get(c, "column"))
                        .ok_or_else(|| err("SQLSERVER_PHYSICAL_LAYOUT", "Key column must be UTF-8"))
                        .and_then(|x| quote(&x))
                })
                .collect::<Result<Vec<_>, _>>()?;
            let target_table = utf8(get(key, "table"))
                .ok_or_else(|| err("SQLSERVER_PHYSICAL_LAYOUT", "Key table must be UTF-8"))?;
            statements.push(format!("ALTER TABLE {} WITH CHECK ADD CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {} ({}) ON DELETE NO ACTION ON UPDATE NO ACTION;", qualified(&carrier)?, quote(&name)?, from.join(", "), qualified(&target_table)?, to.join(", ")));
            Ok(())
        };
        let target_components = arr(get(layout, "targetComponents")).unwrap_or(&[]);
        emit_fk(
            get(layout, "targetKey").unwrap_or(&Value::Null),
            target_components,
            get(layout, "targetConstraint").unwrap_or(&Value::Null),
            &mut statements,
            &mut reserved,
        )?;
        if !eq(get(layout, "storage"), "foreign_key") {
            emit_fk(
                get(layout, "sourceKey")
                    .ok_or_else(|| err("SQLSERVER_PHYSICAL_LAYOUT", "Source Key is missing"))?,
                arr(get(layout, "sourceComponents")).unwrap_or(&[]),
                get(layout, "sourceConstraint").ok_or_else(|| {
                    err("SQLSERVER_PHYSICAL_LAYOUT", "Source constraint is missing")
                })?,
                &mut statements,
                &mut reserved,
            )?;
        }
        let emit_unique = |components: &[Value],
                           suffix: &str,
                           statements: &mut Vec<String>,
                           index_names: &mut HashSet<String>|
         -> Result<(), EngineError> {
            let base = utf8(get(layout, "targetConstraint"))
                .ok_or_else(|| err("SQLSERVER_PHYSICAL_LAYOUT", "Target constraint is missing"))?;
            let name = format!("{base}{suffix}");
            reserve(index_names, &carrier, &name)?;
            let cols = components
                .iter()
                .map(|c| {
                    utf8(get(c, "carrierColumn"))
                        .ok_or_else(|| {
                            err("SQLSERVER_PHYSICAL_LAYOUT", "Carrier column must be UTF-8")
                        })
                        .and_then(|x| quote(&x))
                })
                .collect::<Result<Vec<_>, _>>()?;
            let mut filters = components
                .iter()
                .filter(|c| matches!(get(c, "nullable"), Some(Value::Bool(true))))
                .map(|c| {
                    utf8(get(c, "carrierColumn"))
                        .ok_or_else(|| {
                            err("SQLSERVER_PHYSICAL_LAYOUT", "Carrier column must be UTF-8")
                        })
                        .and_then(|x| quote(&x).map(|q| format!("{q} IS NOT NULL")))
                })
                .collect::<Result<Vec<_>, _>>()?;
            if let Some(d) = get(layout, "discriminator") {
                let column = utf8(get(d, "column")).ok_or_else(|| {
                    err(
                        "SQLSERVER_PHYSICAL_LAYOUT",
                        "Discriminator column must be UTF-8",
                    )
                })?;
                let value = utf8(get(d, "value")).ok_or_else(|| {
                    err(
                        "SQLSERVER_PHYSICAL_LAYOUT",
                        "Discriminator value must be UTF-8",
                    )
                })?;
                filters.push(format!("{} = {}", quote(&column)?, literal(&value)?));
            }
            statements.push(format!(
                "CREATE UNIQUE NONCLUSTERED INDEX {} ON {} ({}){};",
                quote(&name)?,
                qualified(&carrier)?,
                cols.join(", "),
                if filters.is_empty() {
                    String::new()
                } else {
                    format!(" WHERE {}", filters.join(" AND "))
                }
            ));
            Ok(())
        };
        let source_max_one = matches!(get(get(relationship, "sourceMultiplicity").unwrap_or(&Value::Null), "max"), Some(Value::Number(n)) if *n == 1.0);
        let target_max_one = matches!(get(get(relationship, "targetMultiplicity").unwrap_or(&Value::Null), "max"), Some(Value::Number(n)) if *n == 1.0);
        if source_max_one {
            emit_unique(
                target_components,
                "_reverse",
                &mut statements,
                &mut index_names,
            )?;
        }
        if !eq(get(layout, "storage"), "foreign_key") && target_max_one {
            emit_unique(
                arr(get(layout, "sourceComponents")).unwrap_or(&[]),
                "_forward",
                &mut statements,
                &mut index_names,
            )?;
        }
        mappings.push(obj(vec![
            (
                "sourcePath",
                s(&format!("/policy/layout/relationshipLayouts/{i}")),
            ),
            (
                "target",
                s(&format!(
                    "{carrier}.{}",
                    utf8(get(layout, "targetConstraint")).unwrap_or_default()
                )),
            ),
            ("kind", s("relationship")),
            ("outcome", s("approximated")),
        ]));
        let module_index = arr(get(&logical, "modules"))
            .unwrap_or(&[])
            .iter()
            .position(|m| get(m, "id") == get(rel_ref, "module"))
            .ok_or_else(|| {
                err(
                    "SQLSERVER_PHYSICAL_LAYOUT",
                    "Relationship module is missing",
                )
            })?;
        let relationship_index = arr(get(
            &arr(get(&logical, "modules")).unwrap_or(&[])[module_index],
            "relationships",
        ))
        .unwrap_or(&[])
        .iter()
        .position(|r| get(r, "id") == get(rel_ref, "id"))
        .ok_or_else(|| err("SQLSERVER_PHYSICAL_LAYOUT", "Relationship is missing"))?;
        residuals.push(obj(vec![
            ("source", s("logical")),
            ("path", s(&format!("/modules/{module_index}/relationships/{relationship_index}"))),
            ("reason", s("NO ACTION is a physical choice, not ownership. Native nullable tuples, existing-data snapshots, participation minima and bounds greater than one remain qualified residuals. Keyed association identity and attributes survive without imposing endpoint-pair uniqueness.")),
            ("value", copy_json(relationship, ctx)?),
        ]));
    }

    let mut planned = Vec::<Value>::new();
    for (i, f) in fields.iter().enumerate() {
        let owner = elements.iter().find(|e| id(e) == id(f));
        let Some(owner) = owner else { continue };
        let Some(table) = utf8(get(owner, "table")) else {
            continue;
        };
        let mut parts = table.split('.');
        let schema = parts.next().unwrap_or_default();
        let table_name = parts.next().unwrap_or_default();
        let column = if eq(get(f, "storage"), "embedded") {
            utf8(get(f, "documentColumn"))
        } else {
            utf8(get(f, "column"))
        }
        .unwrap_or_default();
        let field_path = format!("/extensions/umf.binding/fields/{i}");
        let mapping_target = format!("{schema}.{table_name}.{column}");
        let emitted = arr(get(&tables, "mappings"))
            .unwrap_or(&[])
            .iter()
            .any(|m| {
                utf8(get(m, "sourcePath")).as_deref() == Some(field_path.as_str())
                    && utf8(get(m, "target")).as_deref() == Some(mapping_target.as_str())
            });
        if !emitted {
            continue;
        }
        let length = if eq(get(f, "storage"), "embedded") {
            -1.0
        } else {
            let sql = layouts
                .iter()
                .find(|x| {
                    same_ref(
                        get(x, "boundField").unwrap_or(&Value::Null),
                        f,
                        &["module", "element", "field"],
                    )
                })
                .and_then(|x| utf8(get(x, "sqlType")))
                .unwrap_or_default();
            if sql.starts_with("nvarchar(") {
                if sql.ends_with("max)") {
                    -1.0
                } else {
                    sql.trim_start_matches("nvarchar(")
                        .trim_end_matches(')')
                        .parse::<f64>()
                        .unwrap_or(0.0)
                        * 2.0
                }
            } else if sql.starts_with("varbinary(") {
                if sql.ends_with("max)") {
                    -1.0
                } else {
                    sql.trim_start_matches("varbinary(")
                        .trim_end_matches(')')
                        .parse::<f64>()
                        .unwrap_or(0.0)
                }
            } else {
                16.0
            }
        };
        planned.push(obj(vec![
            ("schema", s(schema)),
            ("table", s(table_name)),
            ("column", s(&column)),
            ("maxLength", Value::Number(length)),
        ]));
    }
    // Retain the current SQL Server declared-index key-size guard even when the
    // planned-index kernel can express the columns individually.
    for index in indexes.iter().filter(|index| {
        ["btree", "unique", "partial"]
            .iter()
            .any(|kind| eq(get(index, "kind"), kind))
    }) {
        let targets = arr(get(index, "on")).unwrap_or(&[]);
        if targets.iter().any(|target| get(target, "field").is_none()) {
            continue;
        }
        if targets.len() > 16 {
            return Err(err(
                "SQLSERVER_PHYSICAL_INDEX_WIDTH",
                "Declared index exceeds this profile: 16 columns / 900 key bytes",
            ));
        }
        let field_layouts = targets
            .iter()
            .map(|target| {
                let reference = get(target, "field").unwrap_or(&Value::Null);
                layouts.iter().find(|layout| {
                    same_ref(
                        get(layout, "boundField").unwrap_or(&Value::Null),
                        reference,
                        &["module", "element", "field"],
                    )
                })
            })
            .collect::<Vec<_>>();
        if field_layouts.iter().all(|field| field.is_some()) {
            let max_width = field_layouts
                .iter()
                .flatten()
                .map(|field| maximum_bytes(&utf8(get(field, "sqlType")).unwrap_or_default()))
                .sum::<f64>();
            let has_max = field_layouts
                .iter()
                .flatten()
                .any(|field| utf8(get(field, "sqlType")).is_some_and(|sql| sql.contains("(max)")));
            if max_width > 900.0 && !has_max {
                return Err(err(
                    "SQLSERVER_PHYSICAL_INDEX_WIDTH",
                    "Declared index exceeds this profile: 16 columns / 900 key bytes",
                ));
            }
        }
    }
    let index_report =
        binding_sqlserver_planned_indexes::project_binding_indexes_against_sqlserver_plan(
            index_resources,
            &logical,
            &binding,
            &Value::Array(planned),
            "report",
            ctx,
        )?;
    for r in arr(get(&index_report, "residuals")).unwrap_or(&[]) {
        residuals.push(obj(vec![
            ("source", s("binding")),
            ("path", get(r, "path").cloned().unwrap_or(Value::Null)),
            ("reason", get(r, "reason").cloned().unwrap_or(Value::Null)),
            ("value", get(r, "choice").cloned().unwrap_or(Value::Null)),
        ]));
    }
    if let Some(sql) = utf8(get(&index_report, "candidate")) {
        statements.push(sql);
    }
    // The existing Rust table and planned-index kernels produce the portable SQL body;
    // relationship DDL above is generated from exact endpoint Key mappings.
    let result_status = if loss == "strict" {
        "blocked"
    } else {
        "reported"
    };
    let candidate = if loss == "strict" {
        None
    } else {
        Some(s(&(statements.join("\n") + "\n")))
    };
    finish(
        result_status,
        candidate,
        residuals,
        mappings,
        diagnostics,
        ctx,
    )
}

fn resolve_key_primary(logical: &Value, key: &Value) -> bool {
    let module = text(get(key, "module"));
    let element = text(get(key, "element"));
    let key_id = text(get(key, "key"));
    arr(get(&logical, "modules"))
        .unwrap_or(&[])
        .iter()
        .find(|m| text(get(m, "id")) == module)
        .and_then(|m| {
            arr(get(m, "elements"))
                .unwrap_or(&[])
                .iter()
                .find(|e| text(get(e, "id")) == element)
        })
        .and_then(|e| {
            arr(get(e, "keys"))
                .unwrap_or(&[])
                .iter()
                .find(|k| text(get(k, "id")) == key_id)
        })
        .is_some_and(|k| matches!(get(k, "primary"), Some(Value::Bool(true))))
}

/// Verify a retained SQL Server physical projection by recomputing its exact receipt.
pub fn verify_binding_sqlserver_projection(
    index_resources: &BindingIndexProjectionResources,
    binding_resources: &BindingInspectionResources,
    receipt: &Value,
    current_sql: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (result_schema, _) = schemas(ctx)?;
    if !result_schema.validate(receipt, ctx)?.is_empty() || !eq(get(receipt, "status"), "reported")
    {
        return Err(err(
            "SQLSERVER_PHYSICAL_RECEIPT",
            "Inconsistent retained physical projection",
        ));
    }
    let get_required = |name: &str| {
        get(receipt, name).ok_or_else(|| {
            err(
                "SQLSERVER_PHYSICAL_RECEIPT",
                "Inconsistent retained physical projection",
            )
        })
    };
    let logical = get_required("logical")?;
    let binding = get_required("binding")?;
    let policy = get_required("policy")?;
    let loss = utf8(Some(get_required("lossPolicy")?)).ok_or_else(|| {
        err(
            "SQLSERVER_PHYSICAL_RECEIPT",
            "Inconsistent retained physical projection",
        )
    })?;
    let native = get(receipt, "nativeSource");
    let recomputed = project_binding_to_sqlserver(
        index_resources,
        binding_resources,
        logical,
        binding,
        policy,
        &loss,
        native,
        ctx,
    )?;
    if !eq(get(receipt, "status"), "reported") || !json_equal(receipt, &recomputed) {
        return Err(err(
            "SQLSERVER_PHYSICAL_RECEIPT",
            "Inconsistent retained physical projection",
        ));
    }
    let actual = text(Some(current_sql))
        .ok_or_else(|| err("SQLSERVER_PHYSICAL_STALE", "Generated SQL changed"))?;
    if get(&recomputed, "candidate") != Some(&Value::String(actual.clone())) {
        return Err(err("SQLSERVER_PHYSICAL_STALE", "Generated SQL changed"));
    }
    copy_json(receipt, ctx)
}

pub fn recover_binding_sqlserver_sources(
    index_resources: &BindingIndexProjectionResources,
    binding_resources: &BindingInspectionResources,
    receipt: &Value,
    current_sql: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let verified = verify_binding_sqlserver_projection(
        index_resources,
        binding_resources,
        receipt,
        current_sql,
        ctx,
    )?;
    Ok(obj(vec![
        (
            "logical",
            copy_json(get(&verified, "logical").unwrap_or(&Value::Null), ctx)?,
        ),
        (
            "binding",
            copy_json(get(&verified, "binding").unwrap_or(&Value::Null), ctx)?,
        ),
        (
            "policy",
            copy_json(get(&verified, "policy").unwrap_or(&Value::Null), ctx)?,
        ),
    ]))
}

pub fn recover_binding_sqlserver_native(
    index_resources: &BindingIndexProjectionResources,
    binding_resources: &BindingInspectionResources,
    receipt: &Value,
    current_sql: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let verified = verify_binding_sqlserver_projection(
        index_resources,
        binding_resources,
        receipt,
        current_sql,
        ctx,
    )?;
    let mut out = vec![(
        "sql",
        copy_json(get(&verified, "candidate").unwrap_or(&Value::Null), ctx)?,
    )];
    if let Some(catalog) = get(&verified, "nativeSource") {
        out.push(("catalog", copy_json(catalog, ctx)?));
    }
    Ok(obj(out))
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned retained DDD to PostgreSQL projection composition.
//!
//! The parser/deparser is an explicit host capability. This module decides the
//! DDL, source mappings, losses and receipt admission; callers may only parse
//! the returned SQL and submit the retained archive for completion.
use crate::{
    binding_inspection::{self, BindingInspectionResources},
    context::Context,
    ddd_json_schema_projection,
    error::EngineError,
    postgresql_relationship_layout,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::collections::{HashMap, HashSet};

const POLICY_SCHEMA: &str =
    include_str!("../../../spec/projections/ddd-postgresql-policy.schema.json");
const RESULT_SCHEMA: &str =
    include_str!("../../../spec/projections/ddd-postgresql-projection.schema.json");
const LAYOUT_SCHEMA: &str =
    include_str!("../../../spec/projections/postgresql-relationship-layout.schema.json");
const CORE_SCHEMA: &str = include_str!("../../../spec/core/schema.json");
const SEMANTIC_TYPE_REFERENCE_SCHEMA: &str =
    include_str!("../../../spec/core/semantic-type-reference.schema.json");

fn parse_schema(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let units = source.encode_utf16().collect::<Vec<_>>();
    ctx.charge_text(units.len(), Utf16::default())?;
    serialization::read_json_value(&units, Format::Json, ctx)
}

fn policy_validator(ctx: &mut Context<'_>) -> Result<CompiledSchema, EngineError> {
    let mut resources = SchemaResources::default();
    resources
        .entries
        .push((k("urn:umf:core:0.10.0"), parse_schema(CORE_SCHEMA, ctx)?));
    resources.entries.push((
        k("urn:umf:core:semantic-type-reference:1.0.0"),
        parse_schema(SEMANTIC_TYPE_REFERENCE_SCHEMA, ctx)?,
    ));
    resources.entries.push((
        k("urn:umf:postgresql:relationship-layout:1.0.0"),
        parse_schema(LAYOUT_SCHEMA, ctx)?,
    ));
    CompiledSchema::compile(&parse_schema(POLICY_SCHEMA, ctx)?, &resources, ctx)
}

fn result_validator(ctx: &mut Context<'_>) -> Result<CompiledSchema, EngineError> {
    let mut resources = SchemaResources::default();
    resources
        .entries
        .push((k("urn:umf:core:0.10.0"), parse_schema(CORE_SCHEMA, ctx)?));
    resources.entries.push((
        k("urn:umf:core:semantic-type-reference:1.0.0"),
        parse_schema(SEMANTIC_TYPE_REFERENCE_SCHEMA, ctx)?,
    ));
    resources.entries.push((
        k("urn:umf:ddd-postgresql-policy:1.0.0"),
        parse_schema(POLICY_SCHEMA, ctx)?,
    ));
    resources.entries.push((
        k("urn:umf:postgresql:relationship-layout:1.0.0"),
        parse_schema(LAYOUT_SCHEMA, ctx)?,
    ));
    CompiledSchema::compile(&parse_schema(RESULT_SCHEMA, ctx)?, &resources, ctx)
}

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
fn txt(v: Option<&Value>) -> Result<String, EngineError> {
    text(v)
        .ok_or_else(|| fail("DDD_POSTGRESQL_POLICY", "Expected text"))?
        .to_utf8()
        .map_err(|_| fail("DDD_POSTGRESQL_IDENTIFIER", "Invalid UTF-16 identifier"))
}
fn eq(v: Option<&Value>, s: &str) -> bool {
    text(v).is_some_and(|t| t.units().iter().copied().eq(s.encode_utf16()))
}
fn string(s: &str) -> Value {
    Value::string_utf8(s)
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(a, b)| (k(a), b)).collect())
}
fn fail(code: &str, msg: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), msg)
}
fn quote(name: &str) -> Result<String, EngineError> {
    if name.is_empty() || name.len() > 63 || name.contains('\0') {
        return Err(fail(
            "DDD_POSTGRESQL_IDENTIFIER",
            "Identifier is empty, over 63 UTF-16 units, or contains NUL",
        ));
    }
    Ok(format!("\"{}\"", name.replace('"', "\"\"")))
}
fn literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}
fn qtable(name: &str) -> Result<String, EngineError> {
    let Some((a, b)) = name.split_once('.') else {
        return Err(fail(
            "DDD_POSTGRESQL_IDENTIFIER",
            "Expected explicit schema.table",
        ));
    };
    if b.contains('.') || a.is_empty() || b.is_empty() {
        return Err(fail(
            "DDD_POSTGRESQL_IDENTIFIER",
            "Expected explicit schema.table",
        ));
    }
    Ok(format!("{}.{}", quote(a)?, quote(b)?))
}
fn ptr(s: &str) -> String {
    s.replace('~', "~0").replace('/', "~1")
}
fn path_get<'a>(doc: &'a Value, module: &Utf16, element: &Utf16) -> Option<(&'a Value, String)> {
    for (mi, m) in arr(get(doc, "modules"))?.iter().enumerate() {
        if text(get(m, "id")) != Some(module) {
            continue;
        }
        for (ei, e) in arr(get(m, "elements"))?.iter().enumerate() {
            if text(get(e, "id")) == Some(element) {
                return Some((e, format!("/modules/{mi}/elements/{ei}")));
            }
        }
    }
    None
}
fn units_id(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(value)) => value
            .units()
            .iter()
            .map(|unit| format!("{unit:04x}"))
            .collect::<String>(),
        None => "<missing>".into(),
        Some(_) => "<non-string>".into(),
    }
}
fn pair_id(module: Option<&Value>, element: Option<&Value>) -> String {
    format!("{}\u{1f}{}", units_id(module), units_id(element))
}
fn pair_id_units(module: Option<&Utf16>, element: Option<&Utf16>) -> String {
    let encode = |value: Option<&Utf16>| match value {
        Some(value) => value
            .units()
            .iter()
            .map(|unit| format!("{unit:04x}"))
            .collect(),
        None => "<missing>".to_owned(),
    };
    format!("{}\u{1f}{}", encode(module), encode(element))
}
fn field_ref_id(v: &Value) -> String {
    format!(
        "{}\u{1f}{}\u{1f}{}",
        units_id(get(v, "module")),
        units_id(get(v, "element")),
        units_id(get(v, "field"))
    )
}
fn field_policy_id(v: &Value) -> String {
    field_ref_id(v)
}
fn canonical_sql_type(name: &str) -> Option<(String, &'static str)> {
    let normalized = name
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>()
        .to_ascii_lowercase();
    if normalized == "boolean" {
        return Some((normalized, "boolean"));
    }
    if ["smallint", "integer", "bigint"].contains(&normalized.as_str()) {
        return Some((normalized, "integer"));
    }
    if normalized == "text" {
        return Some((normalized, "string"));
    }
    if normalized == "bytea" {
        return Some((normalized, "bytes"));
    }
    if let Some(inner) = normalized
        .strip_prefix("varchar(")
        .and_then(|s| s.strip_suffix(')'))
    {
        if inner.starts_with('0') || inner.is_empty() || !inner.bytes().all(|b| b.is_ascii_digit())
        {
            return None;
        }
        let width = inner.parse::<u32>().ok()?;
        if (1..=10_485_760).contains(&width) {
            return Some((format!("varchar({width})"), "string"));
        }
        return None;
    }
    if let Some(inner) = normalized
        .strip_prefix("numeric(")
        .and_then(|s| s.strip_suffix(')'))
    {
        let (precision, scale) = inner.split_once(',')?;
        if precision.is_empty()
            || precision.starts_with('0')
            || !precision.bytes().all(|b| b.is_ascii_digit())
            || scale.is_empty()
            || (scale.len() > 1 && scale.starts_with('0'))
            || !scale.bytes().all(|b| b.is_ascii_digit())
        {
            return None;
        }
        let precision = precision.parse::<u16>().ok()?;
        let scale = scale.parse::<u16>().ok()?;
        if (1..=999).contains(&precision) && scale <= precision && scale <= 999 {
            return Some((format!("numeric({precision},{scale})"), "decimal"));
        }
        return None;
    }
    let (base, suffix) = if let Some(s) = normalized
        .strip_prefix("timestamp(")
        .and_then(|s| s.strip_suffix(')'))
    {
        ("timestamp", s)
    } else if let Some(s) = normalized
        .strip_prefix("timestamptz(")
        .and_then(|s| s.strip_suffix(')'))
    {
        ("timestamptz", s)
    } else {
        return None;
    };
    if suffix.len() == 1 && matches!(suffix.as_bytes()[0], b'0'..=b'6') {
        Some((format!("{base}({suffix})"), "date-time"))
    } else {
        None
    }
}
fn set(v: &mut Value, name: &str, value: Value) -> bool {
    if let Value::Object(fields) = v {
        if let Some((_, current)) = fields.iter_mut().find(|(n, _)| n == &k(name)) {
            *current = value;
            return true;
        }
    }
    false
}

fn remove(v: &mut Value, name: &str) {
    if let Value::Object(fields) = v {
        fields.retain(|(key, _)| key != &k(name));
    }
}

fn residual(
    origin: &str,
    path: &str,
    value: &Value,
    reason: &str,
    out: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    residual_with_outcome(origin, path, value, "not-expressible", reason, out, ctx)
}
fn residual_with_outcome(
    origin: &str,
    path: &str,
    value: &Value,
    outcome: &str,
    reason: &str,
    out: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    out.push(object(vec![
        ("source", string(origin)),
        ("path", string(path)),
        ("value", copy_json(value, ctx)?),
        ("outcome", string(outcome)),
        ("reason", string(reason)),
    ]));
    Ok(())
}
fn mapping(
    origin: &str,
    path: &str,
    statement: usize,
    kind: &str,
    target: &str,
    out: &mut Vec<Value>,
) {
    out.push(object(vec![
        ("source", string(origin)),
        ("path", string(path)),
        ("statement", Value::Number(statement as f64)),
        ("kind", string(kind)),
        ("target", string(target)),
        ("outcome", string("approximated")),
    ]));
}

fn get_mut_path<'a>(mut value: &'a mut Value, names: &[&str]) -> Option<&'a mut Value> {
    for name in names {
        let Value::Object(fields) = value else {
            return None;
        };
        let (_, child) = fields.iter_mut().find(|(key, _)| key == &k(name))?;
        value = child;
    }
    Some(value)
}

/// Produce the complete SQL source and semantic receipt fields. SQL parsing is a
/// separate explicit capability and is completed by `complete` below.
pub fn prepare(
    logical: &Value,
    binding: &Value,
    policy: &Value,
    resources: &BindingInspectionResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(logical, ctx)?;
    let bind = copy_json(binding, ctx)?;
    let pol = copy_json(policy, ctx)?;
    if let Some(problem) = policy_validator(ctx)?.validate(policy, ctx)?.first() {
        return Err(EngineError::new(
            "DDD_POSTGRESQL_POLICY",
            problem.instance_path.clone(),
            problem.message.clone(),
        ));
    }
    if !eq(get(policy, "profile"), "ddd-postgresql-1")
        || !eq(get(policy, "version"), "1.0.0")
        || !eq(get(policy, "targetVersion"), "17.4")
        || !matches!(get(policy,"mode"),Some(Value::String(s)) if s==&k("strict")||s==&k("report"))
        || !eq(
            get(policy, "objectCheckNaming"),
            "ck-table-column-object-v1",
        )
    {
        return Err(fail(
            "DDD_POSTGRESQL_POLICY",
            "Expected the exact DDD PostgreSQL 17.4 policy profile",
        ));
    }
    let checked_binding = binding_inspection::inspect_binding(resources, binding, logical, ctx)?;
    if !checked_binding.valid
        || checked_binding
            .diagnostics
            .iter()
            .any(|d| d.code == Utf16::from("BINDING_UNKNOWN"))
    {
        return Ok(blocked(
            source,
            bind,
            pol,
            "/binding",
            "Invalid binding document",
            ctx,
        )?);
    }
    let ddd = ddd_json_schema_projection::inspect_ddd_document(logical, ctx)?;
    if !ddd.valid
        || ddd
            .diagnostics
            .iter()
            .any(|d| d.code == Utf16::from("DDD_UNKNOWN"))
    {
        return Ok(blocked(
            source,
            bind,
            pol,
            "/logical",
            "Invalid or uninterpreted DDD content",
            ctx,
        )?);
    }
    if !eq(
        get(
            get(binding, "extensions").unwrap_or(&Value::Null),
            "umf.binding",
        )
        .and_then(|p| get(p, "profile")),
        "umf-binding-2",
    ) {
        return Ok(blocked(
            source,
            bind,
            pol,
            "/binding",
            "Stable-ID binding profile is required",
            ctx,
        )?);
    }
    let payload = get(
        get(binding, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .ok_or_else(|| fail("BINDING_DOCUMENT", "Binding payload is missing"))?;
    let target = get(payload, "target")
        .ok_or_else(|| fail("BINDING_DOCUMENT", "Binding target is missing"))?;
    if !eq(get(target, "system"), "postgresql")
        || !eq(get(target, "version"), "17.4")
        || !eq(get(target, "subset"), "ddd-tables-jsonb-list-partition")
    {
        return Ok(blocked(
            source,
            bind,
            pol,
            "/binding",
            "Expected the PostgreSQL 17.4 DDD binding subset",
            ctx,
        )?);
    }
    let table_policy = get(policy, "tablePolicy")
        .ok_or_else(|| fail("DDD_POSTGRESQL_POLICY", "tablePolicy is required"))?;
    let layout_policy = get(policy, "layoutPolicy")
        .ok_or_else(|| fail("DDD_POSTGRESQL_POLICY", "layoutPolicy is required"))?;
    let mut layout_binding = copy_json(binding, ctx)?;
    if let Some(Value::Array(elements)) = get_mut_path(
        &mut layout_binding,
        &["extensions", "umf.binding", "elements"],
    ) {
        for element in elements {
            let _ = set(element, "partition", Value::Null);
        }
    }
    let layout = postgresql_relationship_layout::validate_postgresql_relationship_layout(
        resources,
        logical,
        &layout_binding,
        layout_policy,
        "report",
        ctx,
    )?;
    if eq(get(&layout, "status"), "blocked") {
        return Ok(blocked(
            source,
            bind,
            pol,
            "/policy/layoutPolicy",
            "PostgreSQL relationship layout is invalid",
            ctx,
        )?);
    }
    let elements = arr(get(payload, "elements")).unwrap_or(&[]);
    let bound_fields = arr(get(payload, "fields")).unwrap_or(&[]);
    let field_types = arr(get(table_policy, "fieldTypes")).unwrap_or(&[]);
    let partitions = arr(get(table_policy, "partitionFamilies")).unwrap_or(&[]);
    let field_layouts = arr(get(layout_policy, "fieldLayouts")).unwrap_or(&[]);
    for t in field_types {
        let id = field_policy_id(t);
        let layout_field = field_layouts
            .iter()
            .find(|f| field_ref_id(get(f, "boundField").unwrap_or(&Value::Null)) == id);
        if layout_field.is_none()
            || text(get(t, "sqlType")) != layout_field.and_then(|f| text(get(f, "sqlType")))
        {
            return Ok(blocked(
                source,
                bind,
                pol,
                "/policy/tablePolicy/fieldTypes",
                "Scalar table policy differs from exact layout field inventory",
                ctx,
            )?);
        }
    }
    for f in field_layouts {
        if !field_types.iter().any(|t| {
            field_policy_id(t) == field_ref_id(get(f, "boundField").unwrap_or(&Value::Null))
                && text(get(t, "sqlType")) == text(get(f, "sqlType"))
        }) {
            return Ok(blocked(
                source,
                bind,
                pol,
                "/policy/tablePolicy/fieldTypes",
                "A layout field has no matching scalar type policy",
                ctx,
            )?);
        }
    }
    let mut types = HashMap::<String, String>::new();
    for (i, t) in field_types.iter().enumerate() {
        let id = field_policy_id(t);
        if types.insert(id, txt(get(t, "sqlType"))?).is_some() {
            return Err(fail(
                "DDD_POSTGRESQL_POLICY",
                "Duplicate scalar type policy",
            ));
        }
        let _ = i;
    }
    let mut residuals = Vec::new();
    let mut mappings = Vec::new();
    let mut statements = Vec::<String>::new();
    let mut names = HashSet::<String>::new();
    let mut emitted = HashSet::<String>::new();
    let mut tables = HashMap::<String, String>::new();
    let mut relations = HashSet::<String>::new();
    let mut native_columns = HashMap::<String, HashMap<String, String>>::new();
    let mut partition_keys = HashMap::<String, String>::new();
    let mut field_layout_by_ref = HashMap::<String, &Value>::new();
    for field_layout in field_layouts {
        field_layout_by_ref.insert(
            field_ref_id(get(field_layout, "boundField").unwrap_or(&Value::Null)),
            field_layout,
        );
    }
    for (i, e) in elements.iter().enumerate() {
        let module = text(get(e, "module"))
            .ok_or_else(|| fail("BINDING_DOCUMENT", "Element module is missing"))?;
        let element = text(get(e, "element"))
            .ok_or_else(|| fail("BINDING_DOCUMENT", "Element id is missing"))?;
        let (definition, path) = path_get(logical, module, element)
            .ok_or_else(|| fail("BINDING_REFERENCE", "Bound element does not resolve"))?;
        let ddddef = get(
            get(definition, "extensions").unwrap_or(&Value::Null),
            "umf.ddd",
        )
        .ok_or_else(|| fail("DDD_POSTGRESQL_SOURCE", "Bound Record has no DDD entity"))?;
        if !eq(get(ddddef, "kind"), "entity") {
            return Ok(blocked(
                source,
                bind,
                pol,
                &format!("/extensions/umf.binding/elements/{i}"),
                "Every bound table must be a DDD entity Record",
                ctx,
            )?);
        }
        let table = txt(get(e, "table"))?;
        let Some((schema_name, table_name)) = table.split_once('.') else {
            return Ok(blocked(
                source,
                bind,
                pol,
                &format!("/extensions/umf.binding/elements/{i}"),
                "Explicit schema.table is required",
                ctx,
            )?);
        };
        if table_name.contains('.')
            || schema_name.is_empty()
            || table_name.is_empty()
            || schema_name.starts_with("pg_")
            || schema_name == "information_schema"
        {
            return Ok(blocked(
                source,
                bind,
                pol,
                &format!("/extensions/umf.binding/elements/{i}"),
                "Explicit user schema.table required",
                ctx,
            )?);
        }
        let relation = qtable(&table)?;
        if !relations.insert(table.clone()) {
            return Ok(blocked(
                source,
                bind,
                pol,
                &format!("/extensions/umf.binding/elements/{i}"),
                "Two entities target one table",
                ctx,
            )?);
        }
        let _ = emitted.insert(table.clone());
        tables.insert(pair_id_units(Some(module), Some(element)), table.clone());
        let (schema, _) = table.split_once('.').unwrap();
        if !names.contains(schema) {
            let statement = statements.len();
            statements.push(format!("CREATE SCHEMA IF NOT EXISTS {};", quote(schema)?));
            mapping(
                "binding",
                &format!("/extensions/umf.binding/elements/{i}"),
                statement,
                "schema",
                schema,
                &mut mappings,
            );
            names.insert(schema.into());
        }
        let mut columns = Vec::<String>::new();
        let mut occupied = HashSet::new();
        for (fi, f) in bound_fields.iter().enumerate().filter(|(_, f)| {
            text(get(f, "module")) == Some(module) && text(get(f, "element")) == Some(element)
        }) {
            let fpath = format!("/extensions/umf.binding/fields/{fi}");
            let authored = txt(get(f, "field"))?;
            let dfields = get(ddddef, "fields")
                .ok_or_else(|| fail("DDD_POSTGRESQL_SOURCE", "DDD entity fields are required"))?;
            let df = get(dfields, &authored)
                .ok_or_else(|| fail("BINDING_REFERENCE", "Bound DDD field is missing"))?;
            if eq(get(f, "storage"), "embedded") {
                let column = txt(get(f, "documentColumn"))?;
                quote(&column)?;
                if occupied.insert(column.clone()) {
                    native_columns
                        .entry(table.clone())
                        .or_default()
                        .insert(column.clone(), "jsonb".into());
                    columns.push(format!("{} jsonb", quote(&column)?));
                    columns.push(format!(
                        "CONSTRAINT {} CHECK ({} IS NULL OR jsonb_typeof({}) = 'object')",
                        quote(&format!(
                            "ck_{}_{}_object",
                            table.split('.').nth(1).unwrap(),
                            column
                        ))?,
                        quote(&column)?,
                        quote(&column)?
                    ));
                }
                residual_with_outcome("binding", &fpath, f, "approximated", "JSONB normalizes document representation and does not enforce embedded path presence or value type", &mut residuals, ctx)?;
                mapping(
                    "binding",
                    &fpath,
                    statements.len(),
                    "column",
                    &format!("{table}.{column}"),
                    &mut mappings,
                );
                continue;
            }
            if !eq(get(f, "storage"), "column") {
                return Ok(blocked(
                    source,
                    bind,
                    pol,
                    &fpath,
                    "Only explicit column/embedded storage is supported",
                    ctx,
                )?);
            }
            let col = txt(get(f, "column"))?;
            quote(&col)?;
            if !occupied.insert(col.clone()) {
                return Ok(blocked(
                    source,
                    bind,
                    pol,
                    &fpath,
                    "Duplicate table column",
                    ctx,
                )?);
            }
            if eq(get(df, "cardinality"), "many") {
                residual(
                    "binding",
                    &fpath,
                    f,
                    "A many-valued DDD field needs a separately declared table or JSONB carrier",
                    &mut residuals,
                    ctx,
                )?;
                continue;
            }
            if !eq(
                get(get(df, "type").unwrap_or(&Value::Null), "kind"),
                "scalar",
            ) {
                residual(
                    "binding",
                    &fpath,
                    f,
                    "Concept-valued field needs an explicit relationship or serialization profile",
                    &mut residuals,
                    ctx,
                )?;
                continue;
            }
            let typ_value = field_types
                .iter()
                .find(|row| field_policy_id(row) == field_policy_id(f))
                .ok_or_else(|| fail("DDD_POSTGRESQL_POLICY", "Missing scalar SQL type policy"))?;
            let typ = types
                .get(&field_policy_id(f))
                .ok_or_else(|| fail("DDD_POSTGRESQL_POLICY", "Missing scalar SQL type policy"))?;
            let Some((canonical_type, dddtype)) = canonical_sql_type(typ) else {
                residual(
                    "policy",
                    "/tablePolicy/fieldTypes",
                    typ_value,
                    "No safe explicit PostgreSQL scalar type mapping for this DDD field",
                    &mut residuals,
                    ctx,
                )?;
                continue;
            };
            if !eq(
                get(get(df, "type").unwrap_or(&Value::Null), "name"),
                dddtype,
            ) {
                residual(
                    "binding",
                    &fpath,
                    f,
                    "No safe explicit PostgreSQL scalar type mapping for this DDD field",
                    &mut residuals,
                    ctx,
                )?;
                continue;
            }
            let optional = eq(get(df, "cardinality"), "optional");
            let bound_id = field_ref_id(f);
            let layout_field = field_layout_by_ref.get(&bound_id).copied();
            let selected = layout_field.is_some_and(|lf| {
                let table_name = text(get(lf, "table"));
                let col_name = text(get(lf, "column"));
                let key_selected = arr(get(layout_policy, "keyLayouts"))
                    .unwrap_or(&[])
                    .iter()
                    .any(|key| {
                        text(get(key, "table")) == table_name
                            && arr(get(key, "components"))
                                .unwrap_or(&[])
                                .iter()
                                .any(|c| text(get(c, "column")) == col_name)
                    });
                let relationship_selected = arr(get(layout_policy, "relationshipLayouts"))
                    .unwrap_or(&[])
                    .iter()
                    .any(|relationship| {
                        text(get(relationship, "carrierTable")) == table_name
                            && ["sourceComponents", "targetComponents"].iter().any(|side| {
                                arr(get(relationship, side))
                                    .unwrap_or(&[])
                                    .iter()
                                    .any(|c| text(get(c, "carrierColumn")) == col_name)
                            })
                    });
                key_selected || relationship_selected
            });
            let collation =
                if selected && layout_field.is_some_and(|lf| eq(get(lf, "collation"), "C")) {
                    " COLLATE pg_catalog.\"C\""
                } else {
                    ""
                };
            native_columns
                .entry(table.clone())
                .or_default()
                .insert(col.clone(), canonical_type.clone());
            columns.push(format!(
                "{} {}{}{}",
                quote(&col)?,
                canonical_type,
                collation,
                if optional { "" } else { " NOT NULL" }
            ));
            let reason = match typ.as_str() {
                "integer" => Some("PostgreSQL finite integer domain narrows unbounded DDD integer"),
                "string" => Some("PostgreSQL text/varchar storage and collation do not establish unrestricted DDD string semantics"),
                "decimal" => Some("PostgreSQL numeric precision and scale narrow unqualified DDD decimal"),
                "bytes" => Some("PostgreSQL bytea storage has a finite size bound outside DDD bytes meaning"),
                "date-time" => Some("DDD date-time does not declare instant/civil, precision or offset semantics"),
                _ => None,
            };
            if let Some(reason) = reason {
                residual("binding", &fpath, f, reason, &mut residuals, ctx)?;
            }
            if optional {
                residual("binding", &fpath, f, "SQL NULL is the selected absence carrier, not an implication of DDD optionality", &mut residuals, ctx)?;
            }
            mapping(
                "binding",
                &fpath,
                statements.len(),
                "column",
                &format!("{table}.{col}"),
                &mut mappings,
            );
        }
        if columns.is_empty() {
            return Ok(blocked(
                source,
                bind,
                pol,
                &path,
                "Cannot emit a table without columns",
                ctx,
            )?);
        }
        let partition = text(get(e, "partition"));
        let mut suffix = String::new();
        let mut partition_child = None::<String>;
        if let Some(p) = partition {
            let family = partitions
                .iter()
                .find(|row| text(get(row, "name")) == Some(p));
            if let Some(family) = family {
                let col = txt(get(family, "column"))?;
                if !occupied.contains(&col) {
                    return Ok(blocked(
                        source,
                        bind,
                        pol,
                        &format!("/extensions/umf.binding/elements/{i}/partition"),
                        "Partition column is absent",
                        ctx,
                    )?);
                }
                suffix = format!(" PARTITION BY LIST ({})", quote(&col)?);
                let child = txt(get(family, "defaultTable"))?;
                let child_relation = format!("{schema}.{child}");
                if !relations.insert(child_relation.clone()) {
                    return Ok(blocked(
                        source,
                        bind,
                        pol,
                        &format!("/extensions/umf.binding/elements/{i}/partition"),
                        "Default partition relation collides",
                        ctx,
                    )?);
                }
                partition_keys.insert(table.clone(), col.clone());
                partition_child = Some(format!(
                    "CREATE TABLE {}.{} PARTITION OF {} DEFAULT;",
                    quote(schema)?,
                    quote(&child)?,
                    relation
                ));
            } else {
                return Ok(blocked(
                    source,
                    bind,
                    pol,
                    &format!("/extensions/umf.binding/elements/{i}/partition"),
                    "Partition family is not declared",
                    ctx,
                )?);
            }
        }
        statements.push(format!(
            "CREATE TABLE {} (\n  {}\n){};",
            relation,
            columns.join(",\n  "),
            suffix
        ));
        mapping(
            "binding",
            &format!("/extensions/umf.binding/elements/{i}"),
            statements.len() - 1,
            "table",
            &table,
            &mut mappings,
        );
        if let Some(child) = partition_child {
            let child_statement = statements.len();
            let family_index = partitions
                .iter()
                .position(|family| text(get(family, "name")) == partition)
                .ok_or_else(|| fail("DDD_POSTGRESQL_POLICY", "Partition family disappeared"))?;
            let family = partitions
                .get(family_index)
                .ok_or_else(|| fail("DDD_POSTGRESQL_POLICY", "Partition family disappeared"))?;
            let default_table = txt(get(family, "defaultTable"))?;
            if format!("{schema}.{default_table}") == table {
                return Err(fail(
                    "DDD_POSTGRESQL_POLICY",
                    "Partition child collides with its parent",
                ));
            }
            statements.push(child);
            mapping(
                "policy",
                &format!("/tablePolicy/partitionFamilies/{family_index}"),
                child_statement,
                "partition",
                &format!("{schema}.{default_table}"),
                &mut mappings,
            );
        }
        let bound_names = bound_fields
            .iter()
            .filter(|f| {
                text(get(f, "module")) == Some(module) && text(get(f, "element")) == Some(element)
            })
            .filter_map(|f| text(get(f, "field")).cloned())
            .collect::<HashSet<_>>();
        if let Some(Value::Object(fields)) = get(ddddef, "fields") {
            for (name, _) in fields {
                if !bound_names.contains(name) {
                    residual(
                        "binding",
                        &format!("/extensions/umf.binding/elements/{i}"),
                        e,
                        "DDD field has no physical binding",
                        &mut residuals,
                        ctx,
                    )?;
                }
            }
        }
        let ddd_path = format!("{path}/extensions/umf.ddd");
        residual("logical", &ddd_path, ddddef, "DDD identity/equality and aggregate/repository/lifecycle semantics are not SQL table semantics", &mut residuals, ctx)?;
        if let Some(aggregate) = get(ddddef, "aggregate") {
            residual(
                "logical",
                &format!("{ddd_path}/aggregate"),
                aggregate,
                "DDD aggregate membership and lifecycle are not SQL table semantics",
                &mut residuals,
                ctx,
            )?;
        }
        if let Some(invariants) = arr(get(ddddef, "invariants")) {
            for (ii, invariant) in invariants.iter().enumerate() {
                residual(
                    "logical",
                    &format!("{ddd_path}/invariants/{ii}"),
                    invariant,
                    "DDD invariant is retained but not interpreted or enforced",
                    &mut residuals,
                    ctx,
                )?;
            }
        }
    }
    // Relationship DDL is driven only by the exact admitted relationship layout.
    let layouts = arr(get(layout_policy, "relationshipLayouts")).unwrap_or(&[]);
    let key_layouts = arr(get(layout_policy, "keyLayouts")).unwrap_or(&[]);
    for (i, l) in layouts.iter().enumerate() {
        let storage = txt(get(l, "storage"))?;
        let carrier = txt(get(l, "carrierTable"))?;
        let carrier_sql = qtable(&carrier)?;
        if storage == "edge" && get(l, "associationRecord").is_some() {
            return Ok(blocked(
                source,
                bind,
                pol,
                "/policy/layoutPolicy/relationshipLayouts",
                "Edge association Record discriminator mapping is outside this profile",
                ctx,
            )?);
        }
        if (storage == "junction" || storage == "edge") && get(l, "associationRecord").is_none() {
            let mut cols = Vec::new();
            if storage == "edge" {
                let d = get(l, "discriminator").ok_or_else(|| {
                    fail("DDD_POSTGRESQL_LAYOUT", "Edge discriminator is required")
                })?;
                cols.push(format!(
                    "{} {} NOT NULL",
                    quote(&txt(get(d, "column"))?)?,
                    txt(get(d, "sqlType"))?
                ));
            }
            for side in ["sourceComponents", "targetComponents"] {
                for c in arr(get(l, side)).unwrap_or(&[]) {
                    let col = txt(get(c, "carrierColumn"))?;
                    let ty = txt(get(c, "sqlType"))?;
                    cols.push(format!(
                        "{} {}{}",
                        quote(&col)?,
                        ty,
                        if matches!(get(c, "nullable"), Some(Value::Bool(true))) {
                            ""
                        } else {
                            " NOT NULL"
                        }
                    ));
                }
            }
            if storage == "edge" {
                let d = get(l, "discriminator").unwrap();
                let check = format!(
                    "ck_{}_{}_values",
                    carrier.split('.').nth(1).unwrap(),
                    txt(get(d, "column"))?
                );
                let vals = layouts
                    .iter()
                    .filter(|x| text(get(x, "carrierTable")) == text(get(l, "carrierTable")))
                    .filter_map(|x| get(x, "discriminator"))
                    .map(|d| txt(get(d, "value")).map(|v| format!("'{}'", v.replace('\'', "''"))))
                    .collect::<Result<Vec<_>, _>>()?;
                cols.push(format!(
                    "CONSTRAINT {} CHECK ({} IN ({}))",
                    quote(&check)?,
                    quote(&txt(get(d, "column"))?)?,
                    vals.join(", ")
                ));
            }
            let (schema, _) = carrier
                .split_once('.')
                .ok_or_else(|| fail("DDD_POSTGRESQL_IDENTIFIER", "Carrier must be schema.table"))?;
            if !names.contains(schema) {
                statements.push(format!("CREATE SCHEMA IF NOT EXISTS {};", quote(schema)?));
                names.insert(schema.into());
            }
            statements.push(format!(
                "CREATE TABLE {} (\n  {}\n);",
                carrier_sql,
                cols.join(",\n  ")
            ));
            mapping(
                "policy",
                &format!("/layoutPolicy/relationshipLayouts/{i}"),
                statements.len() - 1,
                "table",
                &carrier,
                &mut mappings,
            );
        }
    }
    for (i, key) in key_layouts.iter().enumerate() {
        let table = txt(get(key, "table"))?;
        let constraint = txt(get(key, "constraint"))?;
        let comps = arr(get(key, "components")).unwrap_or(&[]);
        let cols = comps
            .iter()
            .map(|c| txt(get(c, "column")).and_then(|n| quote(&n)))
            .collect::<Result<Vec<_>, _>>()?;
        let key_record = get(key, "record")
            .ok_or_else(|| fail("BINDING_REFERENCE", "Key Record identity missing"))?;
        let (record, record_path) = path_get(
            logical,
            text(get(key_record, "module"))
                .ok_or_else(|| fail("BINDING_REFERENCE", "Key module missing"))?,
            text(get(key_record, "element"))
                .ok_or_else(|| fail("BINDING_REFERENCE", "Key record missing"))?,
        )
        .ok_or_else(|| fail("BINDING_REFERENCE", "Key Record missing"))?;
        let authored = arr(get(record, "keys"))
            .unwrap_or(&[])
            .iter()
            .find(|x| text(get(x, "id")) == text(get(key, "key")))
            .ok_or_else(|| fail("BINDING_REFERENCE", "Exact Key ID missing"))?;
        let kind = if matches!(get(authored, "primary"), Some(Value::Bool(true))) {
            "PRIMARY KEY"
        } else {
            "UNIQUE"
        };
        let key_index = arr(get(record, "keys"))
            .unwrap_or(&[])
            .iter()
            .position(|candidate| candidate == authored)
            .unwrap_or(0);
        statements.push(format!(
            "ALTER TABLE {} ADD CONSTRAINT {} {} ({});",
            qtable(&table)?,
            quote(&constraint)?,
            kind,
            cols.join(", ")
        ));
        mapping(
            "logical",
            &format!("{record_path}/keys/{key_index}"),
            statements.len() - 1,
            "key",
            &format!("{table}.{constraint}"),
            &mut mappings,
        );
        let _ = i;
    }
    // Foreign keys for endpoint and carrier tables, preserving each authored Relationship ID.
    for (i, l) in layouts.iter().enumerate() {
        let storage = txt(get(l, "storage"))?;
        let carrier = txt(get(l, "carrierTable"))?;
        let relationship = get(l, "relationship")
            .ok_or_else(|| fail("DDD_POSTGRESQL_LAYOUT", "Relationship identity missing"))?;
        let relationship_module = text(get(relationship, "module"))
            .ok_or_else(|| fail("DDD_POSTGRESQL_LAYOUT", "Relationship module is missing"))?;
        let relationship_id = text(get(relationship, "id"))
            .ok_or_else(|| fail("DDD_POSTGRESQL_LAYOUT", "Relationship id is missing"))?;
        let modules = arr(get(logical, "modules")).unwrap_or(&[]);
        let module_index = modules
            .iter()
            .position(|module| text(get(module, "id")) == Some(relationship_module))
            .ok_or_else(|| fail("DDD_POSTGRESQL_LAYOUT", "Relationship module is unresolved"))?;
        let relationships =
            arr(get(modules.get(module_index).unwrap(), "relationships")).unwrap_or(&[]);
        let relationship_index = relationships
            .iter()
            .position(|row| text(get(row, "id")) == Some(relationship_id))
            .ok_or_else(|| fail("DDD_POSTGRESQL_LAYOUT", "Relationship is unresolved"))?;
        let relationship_path =
            format!("/modules/{module_index}/relationships/{relationship_index}");
        for (side, constraint_name) in [
            ("sourceComponents", "sourceConstraint"),
            ("targetComponents", "targetConstraint"),
        ] {
            if side == "sourceComponents" && storage == "foreign_key" {
                continue;
            }
            let name = if side == "sourceComponents" {
                get(l, constraint_name)
                    .map(|value| txt(Some(value)))
                    .transpose()?
            } else {
                Some(txt(get(l, constraint_name))?)
            };
            let Some(name) = name else {
                continue;
            };
            let keyref = get(
                l,
                if side == "sourceComponents" {
                    "sourceKey"
                } else {
                    "targetKey"
                },
            )
            .ok_or_else(|| fail("DDD_POSTGRESQL_LAYOUT", "Endpoint Key identity missing"))?;
            let key = key_layouts
                .iter()
                .find(|k| {
                    let record = get(k, "record").unwrap_or(&Value::Null);
                    text(get(record, "module")) == text(get(keyref, "module"))
                        && text(get(record, "element")) == text(get(keyref, "element"))
                        && text(get(k, "key")) == text(get(keyref, "key"))
                })
                .ok_or_else(|| fail("DDD_POSTGRESQL_LAYOUT", "Endpoint Key layout missing"))?;
            let columns = arr(get(l, side)).unwrap_or(&[]);
            let carrier_cols = columns
                .iter()
                .map(|c| txt(get(c, "carrierColumn")).and_then(|v| quote(&v)))
                .collect::<Result<Vec<_>, _>>()?;
            let target_cols = arr(get(key, "components"))
                .unwrap_or(&[])
                .iter()
                .map(|c| txt(get(c, "column")).and_then(|v| quote(&v)))
                .collect::<Result<Vec<_>, _>>()?;
            statements.push(format!(
                "ALTER TABLE {} ADD CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {} ({});",
                qtable(&carrier)?,
                quote(&name)?,
                carrier_cols.join(", "),
                qtable(&txt(get(key, "table"))?)?,
                target_cols.join(", ")
            ));
            mapping(
                "logical",
                &relationship_path,
                statements.len() - 1,
                "relationship",
                &format!("{carrier}.{name}"),
                &mut mappings,
            );
        }
        let _ = i;
    }
    for (i, index) in arr(get(payload, "indexes"))
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        if let Some(predicate) = get(index, "predicate") {
            let expression = txt(get(predicate, "expression"))?;
            let version = txt(get(predicate, "version"))?;
            let version_ok = version == "17"
                || version.starts_with("17.")
                    && version[3..]
                        .split('.')
                        .all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()));
            if expression.trim().is_empty()
                || expression.contains(';')
                || expression.contains("--")
                || expression.contains("/*")
                || !eq(get(predicate, "language"), "postgresql")
                || !version_ok
            {
                return Ok(blocked(
                    source,
                    bind,
                    pol,
                    &format!("/extensions/umf.binding/indexes/{i}"),
                    "Unsafe or mismatched predicate syntax blocks both loss modes",
                    ctx,
                )?);
            }
        }
    }
    // Index DDL is selected from the exact binding inventory and the generated columns.
    let indexes = arr(get(payload, "indexes")).unwrap_or(&[]);
    for index in indexes {
        if let Some(first) = arr(get(index, "on")).and_then(|rows| rows.first()) {
            let reference = if let Some(field) = get(first, "field") {
                field
            } else {
                get(get(first, "documentPath").unwrap_or(&Value::Null), "field")
                    .unwrap_or(&Value::Null)
            };
            let table = tables.get(&pair_id(
                get(reference, "module"),
                get(reference, "element"),
            ));
            if let Some(table) = table {
                let (schema, _) = table.split_once('.').ok_or_else(|| {
                    fail(
                        "DDD_POSTGRESQL_IDENTIFIER",
                        "Bound table must be schema.table",
                    )
                })?;
                let physical = format!("{schema}.{}", txt(get(index, "name"))?);
                if relations.contains(&physical) {
                    return Ok(blocked(
                        source,
                        bind,
                        pol,
                        "/binding/extensions/umf.binding/indexes",
                        "Index collides with a table or partition relation",
                        ctx,
                    )?);
                }
                relations.insert(physical);
            }
        }
    }
    for (i, index) in indexes.iter().enumerate() {
        let path = format!("/extensions/umf.binding/indexes/{i}");
        let kind = txt(get(index, "kind"))?;
        if kind == "clustering" {
            residual(
                "binding",
                &path,
                index,
                "PostgreSQL physical clustering is not this declared index kind",
                &mut residuals,
                ctx,
            )?;
            continue;
        }
        if let Some(predicate) = get(index, "predicate") {
            let language_ok = eq(get(predicate, "language"), "postgresql");
            let version = txt(get(predicate, "version"))?;
            let version_ok = version == "17"
                || version.starts_with("17.")
                    && version[3..]
                        .split('.')
                        .all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()));
            if !language_ok || !version_ok {
                residual(
                    "binding",
                    &path,
                    index,
                    "Predicate language/version differs from PostgreSQL 17 profile",
                    &mut residuals,
                    ctx,
                )?;
                continue;
            }
        }
        if matches!(get(index, "unique"), Some(Value::Bool(true)))
            && !["btree", "unique", "expression", "partial"].contains(&kind.as_str())
        {
            residual(
                "binding",
                &path,
                index,
                "Unique enforcement for this access method is outside the verified profile",
                &mut residuals,
                ctx,
            )?;
            continue;
        }
        let include_refs = arr(get(index, "include")).unwrap_or(&[]);
        if !include_refs.is_empty() && ["gin", "hash"].contains(&kind.as_str()) {
            residual(
                "binding",
                &path,
                index,
                "Included columns are outside this access-method profile",
                &mut residuals,
                ctx,
            )?;
            continue;
        }
        let targets = arr(get(index, "on")).unwrap_or(&[]);
        let mut owner = None::<String>;
        let mut terms = Vec::new();
        let mut indexed_columns = Vec::new();
        let mut valid = !targets.is_empty();
        for target in targets {
            let is_field = get(target, "field").is_some();
            let reference = if is_field {
                get(target, "field").unwrap()
            } else {
                get(get(target, "documentPath").unwrap_or(&Value::Null), "field")
                    .unwrap_or(&Value::Null)
            };
            let identity = field_ref_id(reference);
            let Some(field) = bound_fields.iter().find(|f| field_ref_id(f) == identity) else {
                valid = false;
                break;
            };
            let table = tables
                .get(&pair_id(get(field, "module"), get(field, "element")))
                .cloned();
            if owner.is_none() {
                owner = table.clone();
            } else if owner != table {
                valid = false;
                break;
            }
            let Some(table) = table else {
                valid = false;
                break;
            };
            if is_field {
                let column = txt(get(field, "column"))?;
                if !native_columns
                    .get(&table)
                    .is_some_and(|cols| cols.contains_key(&column))
                {
                    valid = false;
                    break;
                }
                terms.push(quote(&column)?);
                indexed_columns.push(column);
            } else {
                let document_path = get(target, "documentPath").unwrap();
                let column = txt(get(field, "documentColumn"))?;
                let paths = arr(get(document_path, "path")).unwrap_or(&[]);
                let field_path = arr(get(field, "path")).unwrap_or(&[]);
                if !eq(get(field, "storage"), "embedded")
                    || paths != field_path
                    || !native_columns
                        .get(&table)
                        .is_some_and(|cols| cols.get(&column).is_some_and(|ty| ty == "jsonb"))
                {
                    valid = false;
                    break;
                }
                let path_terms = paths
                    .iter()
                    .map(|segment| txt(Some(segment)).map(|s| literal(&s)))
                    .collect::<Result<Vec<_>, _>>()?;
                terms.push(format!(
                    "({} #>> ARRAY[{}]::text[])",
                    quote(&column)?,
                    path_terms.join(", ")
                ));
            }
        }
        let table = owner;
        let Some(table) = table.filter(|table| native_columns.contains_key(table)) else {
            residual(
                "binding",
                &path,
                index,
                "Index owner needs an exact table override in native source",
                &mut residuals,
                ctx,
            )?;
            continue;
        };
        let mut includes = Vec::new();
        for reference in include_refs {
            let id = field_ref_id(reference);
            let Some(field) = bound_fields.iter().find(|f| field_ref_id(f) == id) else {
                valid = false;
                break;
            };
            let column = txt(get(field, "column"))?;
            if !native_columns
                .get(&table)
                .is_some_and(|cols| cols.contains_key(&column))
            {
                valid = false;
                break;
            }
            includes.push(quote(&column)?);
        }
        if !valid {
            residual(
                "binding",
                &path,
                index,
                "Index field or JSONB document column is absent from native table",
                &mut residuals,
                ctx,
            )?;
            continue;
        }
        if matches!(get(index, "unique"), Some(Value::Bool(true)))
            && partition_keys
                .get(&table)
                .is_some_and(|partition| !indexed_columns.contains(partition))
        {
            residual(
                "binding",
                &path,
                index,
                "Unique index on a partitioned table must include every partition key",
                &mut residuals,
                ctx,
            )?;
            continue;
        }
        if ["gin", "gist"].contains(&kind.as_str()) {
            let supported = targets.iter().all(|target| {
                let reference = if get(target, "field").is_some() {
                    get(target, "field").unwrap()
                } else {
                    &Value::Null
                };
                let id = field_ref_id(reference);
                let field = bound_fields.iter().find(|f| field_ref_id(f) == id);
                let column = field
                    .and_then(|f| text(get(f, "column")))
                    .and_then(|v| v.to_utf8().ok());
                let ty = column
                    .as_ref()
                    .and_then(|c| native_columns.get(&table).and_then(|m| m.get(c)))
                    .map(String::as_str);
                if kind == "gin" {
                    ty == Some("jsonb")
                } else {
                    ty == Some("point")
                }
            });
            if !supported {
                residual(
                    "binding",
                    &path,
                    index,
                    "No verified default operator class for this index method and column type",
                    &mut residuals,
                    ctx,
                )?;
                continue;
            }
        }
        let method = if ["btree", "hash", "gin", "gist"].contains(&kind.as_str()) {
            kind.as_str()
        } else {
            "btree"
        };
        let predicate = get(index, "predicate")
            .map(|value| txt(get(value, "expression")))
            .transpose()?;
        if predicate.as_ref().is_some_and(|predicate| {
            predicate.contains(';')
                || predicate.contains("--")
                || predicate.contains("/*")
                || predicate.trim().is_empty()
        }) {
            residual(
                "binding",
                &path,
                index,
                "Predicate is outside the single-expression SQL subset",
                &mut residuals,
                ctx,
            )?;
            continue;
        }
        let table_name = qtable(&table)?;
        let index_name = quote(&txt(get(index, "name"))?)?;
        let sql = format!(
            "CREATE {}INDEX {} ON {} USING {} ({}){}{};",
            if matches!(get(index, "unique"), Some(Value::Bool(true))) {
                "UNIQUE "
            } else {
                ""
            },
            index_name,
            table_name,
            method,
            terms.join(", "),
            if includes.is_empty() {
                String::new()
            } else {
                format!(" INCLUDE ({})", includes.join(", "))
            },
            if let Some(predicate) = predicate.as_ref() {
                format!(" WHERE ({predicate})")
            } else {
                String::new()
            }
        );
        statements.push(sql);
        mapping(
            "binding",
            &path,
            statements.len() - 1,
            "index",
            &txt(get(index, "name"))?,
            &mut mappings,
        );
    }
    // Preserve unsupported relationship choices explicitly; the SQL profile does not have inline carriers.
    for (i, choice) in arr(get(payload, "relationships"))
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        if eq(get(choice, "storage"), "inline") {
            residual(
                "binding",
                &format!("/extensions/umf.binding/relationships/{i}"),
                choice,
                "PostgreSQL 17 inline relationship storage has no supported carrier",
                &mut residuals,
                ctx,
            )?;
        }
    }
    // Carry layout diagnostics/residuals verbatim; unknown logical meaning is retained.
    for item in arr(get(&layout, "residuals")).unwrap_or(&[]) {
        let origin = txt(get(item, "source"))?;
        let path = txt(get(item, "path"))?;
        let reason = txt(get(item, "reason"))?;
        let value = get(item, "value").unwrap_or(&Value::Null);
        let outer_path = if origin == "policy" {
            format!("/layoutPolicy{path}")
        } else {
            path
        };
        residual_with_outcome(
            &origin,
            &outer_path,
            value,
            "unknown",
            &reason,
            &mut residuals,
            ctx,
        )?;
    }
    if let Some(Value::Array(modules)) = get(logical, "modules") {
        for (mi, module) in modules.iter().enumerate() {
            if let Some(Value::Array(elements)) = get(module, "elements") {
                for (ei, element) in elements.iter().enumerate() {
                    let path = format!("/modules/{mi}/elements/{ei}");
                    if let Some(ddd) = get(
                        get(element, "extensions").unwrap_or(&Value::Null),
                        "umf.ddd",
                    ) {
                        residual_with_outcome("logical", &format!("{path}/extensions/umf.ddd"), ddd, "unknown", "DDD identity/equality, aggregate/repository/lifecycle and opaque invariants are not established by SQL structure", &mut residuals, ctx)?;
                    }
                    if eq(get(element, "kind"), "field") {
                        residual_with_outcome("logical", &path, element, "unknown", "Native column widths, input coercion, NULL/domain differences, facets and unknown qualifiers remain qualified rather than exact ideal equivalence", &mut residuals, ctx)?;
                    }
                }
            }
        }
    }
    residual(
        "logical",
        "",
        &source,
        "The complete authored logical graph and competing meanings remain in the receipt",
        &mut residuals,
        ctx,
    )?;
    let mut native = statements.join("\n") + "\n";
    if native.is_empty() {
        native = "".into();
    }
    if statements.is_empty() {
        return Ok(blocked(
            source,
            bind,
            pol,
            "/binding/extensions/umf.binding/elements",
            "No complete PostgreSQL table or relationship DDL can be emitted",
            ctx,
        )?);
    }
    let blocked_by_loss = eq(get(policy, "mode"), "strict") && !residuals.is_empty();
    let mut diagnostics = arr(get(&layout, "diagnostics"))
        .unwrap_or(&[])
        .iter()
        .map(|d| copy_json(d, ctx))
        .collect::<Result<Vec<_>, _>>()?;
    for item in &residuals {
        diagnostics.push(object(vec![
            ("code", string("DDD_POSTGRESQL_LOSS")),
            (
                "path",
                copy_json(get(item, "path").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                "message",
                copy_json(get(item, "reason").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                "severity",
                string(if blocked_by_loss { "error" } else { "warning" }),
            ),
        ]));
    }
    let mut fields = vec![
        ("operation", string("project-ddd-postgresql")),
        ("version", string("1.0.0")),
        (
            "status",
            string(if blocked_by_loss {
                "blocked"
            } else {
                "projected"
            }),
        ),
        ("source", source),
        ("binding", bind),
        ("policy", pol),
        ("nativeVersion", string("17.4")),
        (
            "mappings",
            Value::Array(if blocked_by_loss {
                Vec::new()
            } else {
                mappings
            }),
        ),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ];
    if !blocked_by_loss {
        fields.push(("nativeSource", Value::String(Utf16::from(native))));
    }
    Ok(Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (k(name), value))
            .collect(),
    ))
}
fn blocked(
    source: Value,
    binding: Value,
    policy: Value,
    path: &str,
    message: &str,
    _ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(object(vec![
        ("operation", string("project-ddd-postgresql")),
        ("version", string("1.0.0")),
        ("status", string("blocked")),
        ("source", source),
        ("binding", binding),
        ("policy", policy),
        ("nativeVersion", string("17.4")),
        ("mappings", Value::Array(Vec::new())),
        ("residuals", Value::Array(Vec::new())),
        (
            "diagnostics",
            Value::Array(vec![object(vec![
                ("code", string("DDD_POSTGRESQL_BLOCK")),
                ("path", string(path)),
                ("message", string(message)),
                ("severity", string("error")),
            ])]),
        ),
    ]))
}

/// Turn an ordinary host parser/deparser failure into the same complete blocked
/// report shape as the TypeScript projection, retaining Rust-computed losses.
pub fn block_host_failure(
    logical: &Value,
    binding: &Value,
    policy: &Value,
    path: &Utf16,
    message: &Utf16,
    resources: &BindingInspectionResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut report = prepare(logical, binding, policy, resources, ctx)?;
    if let Some((_, status)) = match &mut report {
        Value::Object(fields) => fields.iter_mut().find(|(name, _)| name == &k("status")),
        _ => None,
    } {
        *status = string("blocked");
    }
    remove(&mut report, "nativeSource");
    remove(&mut report, "targetArchive");
    if let Some((_, diagnostics)) = match &mut report {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(name, _)| name == &k("diagnostics")),
        _ => None,
    } {
        if let Value::Array(items) = diagnostics {
            for item in items.iter_mut() {
                if eq(get(item, "code"), "DDD_POSTGRESQL_LOSS") {
                    let _ = set(item, "severity", string("error"));
                }
            }
            items.push(object(vec![
                ("code", string("DDD_POSTGRESQL_BLOCK")),
                ("path", Value::String(path.clone())),
                ("message", Value::String(message.clone())),
                ("severity", string("error")),
            ]));
        }
    }
    if let Some(problem) = result_validator(ctx)?.validate(&report, ctx)?.first() {
        return Err(EngineError::new(
            "DDD_POSTGRESQL_RESULT",
            problem.instance_path.clone(),
            problem.message.clone(),
        ));
    }
    Ok(report)
}

/// Admit the host-parsed archive only when its retained source is exactly the
/// Rust-generated source. The parser result itself is never asked to choose DDL.
pub fn complete(
    logical: &Value,
    binding: &Value,
    policy: &Value,
    candidate_source: &Utf16,
    candidate_archive: &Value,
    native_source: &Utf16,
    target_archive: &Value,
    resources: &BindingInspectionResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut plan = prepare(logical, binding, policy, resources, ctx)?;
    if eq(get(&plan, "status"), "blocked") {
        return Ok(plan);
    }
    if text(get(&plan, "nativeSource")) != Some(candidate_source) {
        return Err(fail(
            "DDD_POSTGRESQL_RECEIPT",
            "Host candidate differs from Rust-generated projection",
        ));
    }
    let candidate_archived =
        crate::postgresql_sql_runtime::get_postgresql_source(candidate_archive, ctx)?;
    if text(Some(&candidate_archived)) != Some(candidate_source) {
        return Err(fail(
            "DDD_POSTGRESQL_RECEIPT",
            "Candidate archive does not retain the exact Rust-generated SQL",
        ));
    }
    let archived = crate::postgresql_sql_runtime::get_postgresql_source(target_archive, ctx)?;
    if text(Some(&archived)) != Some(native_source) {
        return Err(fail(
            "DDD_POSTGRESQL_RECEIPT",
            "Parsed archive does not retain the exact generated SQL",
        ));
    }
    let candidate_node = crate::postgresql_sql_runtime::get_postgresql_node(
        candidate_archive,
        &Utf16::default(),
        ctx,
    )?;
    let target_node =
        crate::postgresql_sql_runtime::get_postgresql_node(target_archive, &Utf16::default(), ctx)?;
    if candidate_node != target_node {
        return Err(fail(
            "DDD_POSTGRESQL_RECEIPT",
            "Host parser/deparser changed the Rust-generated PostgreSQL syntax tree",
        ));
    }
    let inspection = crate::postgresql_sql_runtime::inspect_postgresql_sql(target_archive, ctx)?;
    if !matches!(get(&inspection, "valid"), Some(Value::Bool(true))) {
        return Err(fail(
            "DDD_POSTGRESQL_PARSER",
            "Generated SQL archive failed native parser validation",
        ));
    }
    let _ = set(
        &mut plan,
        "nativeSource",
        Value::String(native_source.clone()),
    );
    if let Value::Object(fields) = &mut plan {
        fields.push((k("targetArchive"), copy_json(target_archive, ctx)?));
    }
    if let Some(problem) = result_validator(ctx)?.validate(&plan, ctx)?.first() {
        return Err(EngineError::new(
            "DDD_POSTGRESQL_RESULT",
            problem.instance_path.clone(),
            problem.message.clone(),
        ));
    }
    Ok(plan)
}

pub fn verify(
    receipt: &Value,
    current_target: &Value,
    candidate_source: &Utf16,
    candidate_archive: &Value,
    resources: &BindingInspectionResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if !eq(get(receipt, "operation"), "project-ddd-postgresql")
        || !eq(get(receipt, "status"), "projected")
    {
        return Err(fail(
            "DDD_POSTGRESQL_RECEIPT",
            "Complete successful projection receipt required",
        ));
    }
    let source = text(get(receipt, "nativeSource"))
        .ok_or_else(|| fail("DDD_POSTGRESQL_RECEIPT", "Native source is missing"))?;
    let archive = get(receipt, "targetArchive")
        .ok_or_else(|| fail("DDD_POSTGRESQL_RECEIPT", "Target archive is missing"))?;
    let verified = crate::postgresql_sql_runtime::get_postgresql_source(current_target, ctx)?;
    if text(Some(&verified)) != Some(source) {
        return Err(fail(
            "DDD_POSTGRESQL_STALE",
            "Current PostgreSQL source differs from receipt",
        ));
    }
    let expected_node =
        crate::postgresql_sql_runtime::get_postgresql_node(archive, &Utf16::default(), ctx)?;
    let current_node =
        crate::postgresql_sql_runtime::get_postgresql_node(current_target, &Utf16::default(), ctx)?;
    if expected_node != current_node {
        return Err(fail(
            "DDD_POSTGRESQL_STALE",
            "Current PostgreSQL AST differs from receipt",
        ));
    }
    let logical = get(receipt, "source")
        .ok_or_else(|| fail("DDD_POSTGRESQL_RECEIPT", "Source document is missing"))?;
    let binding = get(receipt, "binding")
        .ok_or_else(|| fail("DDD_POSTGRESQL_RECEIPT", "Binding document is missing"))?;
    let policy = get(receipt, "policy")
        .ok_or_else(|| fail("DDD_POSTGRESQL_RECEIPT", "Policy is missing"))?;
    let expected = complete(
        logical,
        binding,
        policy,
        candidate_source,
        candidate_archive,
        source,
        archive,
        resources,
        ctx,
    )?;
    if &expected != receipt {
        return Err(fail(
            "DDD_POSTGRESQL_RECEIPT",
            "Receipt differs from retained source, binding or policy",
        ));
    }
    Ok(expected)
}

pub fn recover_ideal(
    receipt: &Value,
    current_target: &Value,
    candidate_source: &Utf16,
    candidate_archive: &Value,
    resources: &BindingInspectionResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let verified = verify(
        receipt,
        current_target,
        candidate_source,
        candidate_archive,
        resources,
        ctx,
    )?;
    Ok(object(vec![
        (
            "logical",
            copy_json(
                get(&verified, "source")
                    .ok_or_else(|| fail("DDD_POSTGRESQL_RECEIPT", "Source is missing"))?,
                ctx,
            )?,
        ),
        (
            "binding",
            copy_json(
                get(&verified, "binding")
                    .ok_or_else(|| fail("DDD_POSTGRESQL_RECEIPT", "Binding is missing"))?,
                ctx,
            )?,
        ),
        (
            "policy",
            copy_json(
                get(&verified, "policy")
                    .ok_or_else(|| fail("DDD_POSTGRESQL_RECEIPT", "Policy is missing"))?,
                ctx,
            )?,
        ),
    ]))
}
pub fn recover_native(
    receipt: &Value,
    current_target: &Value,
    candidate_source: &Utf16,
    candidate_archive: &Value,
    resources: &BindingInspectionResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let verified = verify(
        receipt,
        current_target,
        candidate_source,
        candidate_archive,
        resources,
        ctx,
    )?;
    Ok(Value::String(
        text(get(&verified, "nativeSource"))
            .cloned()
            .ok_or_else(|| fail("DDD_POSTGRESQL_RECEIPT", "Native source is missing"))?,
    ))
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! SQL Server 2022 table DDL projection from an authored physical binding.
use crate::{
    binding_index_projection::{project_binding_indexes, BindingIndexProjectionResources},
    context::Context,
    ddd_json_schema_projection,
    error::EngineError,
    serialization::stringify_compact_metered,
    value::{copy_json, Utf16, Value},
};
use std::collections::{HashMap, HashSet};

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
    if let Some(Value::Array(a)) = v {
        Some(a)
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
fn scalar(v: Option<&Value>) -> Result<String, EngineError> {
    text(v)
        .ok_or_else(|| err("SQLSERVER_TABLE_POLICY", "Expected text"))
        .and_then(|s| {
            s.to_utf8()
                .map_err(|_| err("SQLSERVER_IDENTIFIER", "Invalid UTF-16 SQL identifier"))
        })
}
fn tagged_native_text(value: Option<&Value>, name: &str) -> Option<String> {
    let members = get(value?, "members")?;
    let node = get(members, name)?;
    if !eq(get(node, "kind"), "string") {
        return None;
    }
    text(get(node, "value")).and_then(|value| value.to_utf8().ok())
}
fn tagged_native_integer(value: Option<&Value>, name: &str) -> Option<i64> {
    let members = get(value?, "members")?;
    let node = get(members, name)?;
    if !eq(get(node, "kind"), "number") {
        return None;
    }
    text(get(node, "value"))?.to_utf8().ok()?.parse().ok()
}
fn eq(v: Option<&Value>, value: &str) -> bool {
    text(v).is_some_and(|s| s.units().iter().copied().eq(value.encode_utf16()))
}
fn strv(s: &str) -> Value {
    Value::String(Utf16::from(s))
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(a, b)| (k(a), b)).collect())
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn quote(s: &str) -> Result<String, EngineError> {
    if s.is_empty() || s.as_bytes().len() > 128 || s.contains('\0') {
        return Err(err(
            "SQLSERVER_IDENTIFIER",
            "Invalid or truncated SQL Server identifier",
        ));
    }
    Ok(format!("[{}]", s.replace(']', "]]")))
}
fn qualified_parts(value: Option<&Value>) -> Result<Option<(String, String)>, EngineError> {
    let Some(value) = text(value) else {
        return Ok(None);
    };
    let pieces: Vec<&[u16]> = value.units().split(|unit| *unit == b'.' as u16).collect();
    if pieces.len() != 2 || pieces.iter().any(|piece| piece.is_empty()) {
        return Ok(None);
    }
    let schema = Utf16::new(pieces[0].to_vec()).to_utf8().map_err(|_| {
        err(
            "SQLSERVER_IDENTIFIER",
            "Invalid or truncated SQL Server identifier",
        )
    })?;
    let table = Utf16::new(pieces[1].to_vec()).to_utf8().map_err(|_| {
        err(
            "SQLSERVER_IDENTIFIER",
            "Invalid or truncated SQL Server identifier",
        )
    })?;
    Ok(Some((schema, table)))
}
fn entity_definition<'a>(doc: &'a Value, module: &Utf16, element: &Utf16) -> Option<&'a Value> {
    arr(get(doc, "modules"))?
        .iter()
        .find(|m| text(get(m, "id")) == Some(module))?
        .pipe(|m| {
            arr(get(m, "elements"))?
                .iter()
                .find(|e| text(get(e, "id")) == Some(element))
        })?
        .pipe(|e| get(get(e, "extensions")?, "umf.ddd"))
}
trait Pipe: Sized {
    fn pipe<T>(self, f: impl FnOnce(Self) -> T) -> T {
        f(self)
    }
}
impl<T> Pipe for T {}
fn row_key(row: &Value) -> Option<(Utf16, Utf16, Utf16)> {
    Some((
        text(get(row, "module"))?.clone(),
        text(get(row, "element"))?.clone(),
        text(get(row, "field"))?.clone(),
    ))
}
fn scalar_type(raw: &str) -> Option<(String, &'static str)> {
    let lowered = raw.to_ascii_lowercase();
    let t: String = lowered.split_whitespace().collect();
    if ["bit", "tinyint", "smallint", "int", "bigint"].contains(&t.as_str()) {
        return Some((
            t,
            if raw.eq_ignore_ascii_case("bit") {
                "boolean"
            } else {
                "integer"
            },
        ));
    }
    if t == "date" {
        return Some(("date".to_owned(), "date-time"));
    }
    if let Some(inner) = t
        .strip_prefix("nvarchar(")
        .and_then(|x| x.strip_suffix(')'))
    {
        if inner == "max"
            || inner
                .parse::<u32>()
                .is_ok_and(|n| (1..=4000).contains(&n) && n.to_string() == inner)
        {
            return Some((t, "string"));
        }
    }
    if let Some(inner) = t
        .strip_prefix("varbinary(")
        .and_then(|x| x.strip_suffix(')'))
    {
        if inner == "max"
            || inner
                .parse::<u32>()
                .is_ok_and(|n| (1..=8000).contains(&n) && n.to_string() == inner)
        {
            return Some((t, "bytes"));
        }
    }
    if let Some(inner) = t.strip_prefix("decimal(").and_then(|x| x.strip_suffix(')')) {
        let mut p = inner.split(',');
        if let (Some(a), Some(b), None) = (p.next(), p.next(), p.next()) {
            if let (Ok(precision), Ok(scale)) = (a.parse::<u32>(), b.parse::<u32>()) {
                if precision.to_string() == a
                    && scale.to_string() == b
                    && (1..=38).contains(&precision)
                    && scale <= precision
                {
                    return Some((t, "decimal"));
                }
            }
        }
    }
    if let Some(inner) = t
        .strip_prefix("datetime2(")
        .and_then(|x| x.strip_suffix(')'))
        .or_else(|| {
            t.strip_prefix("datetimeoffset(")
                .and_then(|x| x.strip_suffix(')'))
        })
    {
        if inner
            .parse::<u32>()
            .is_ok_and(|n| n <= 7 && n.to_string() == inner)
        {
            return Some((t, "date-time"));
        }
    }
    None
}
/// Port of `projectBindingTablesToSqlServer`; native catalog parsing is kept on the explicit source route.
pub fn project_binding_tables_to_sqlserver(
    resources: &BindingIndexProjectionResources,
    logical: &Value,
    binding: &Value,
    policy: &Value,
    loss_policy: &str,
    native_source: Option<&Value>,
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
    let target = get(payload, "target")
        .cloned()
        .ok_or_else(|| err("BINDING_DOCUMENT", "Binding target is missing"))?;
    if !eq(get(&target, "system"), "sqlserver")
        || !eq(get(&target, "version"), "2022")
        || !eq(
            get(&target, "subset"),
            "ordinary-tables-json-text-partition-scheme",
        )
    {
        return Err(err(
            "BINDING_TARGET",
            "Expected pinned SQL Server 2022 table subset",
        ));
    }
    let ddd = ddd_json_schema_projection::inspect_ddd_document(model, ctx)?;
    if !ddd.valid || ddd.diagnostics.iter().any(|d| d.code == k("DDD_UNKNOWN")) {
        return Err(err("DDD_DOCUMENT", "Invalid or uninterpreted DDD model"));
    }
    let fields = arr(get(payload, "fields")).unwrap_or(&[]);
    let elements = arr(get(payload, "elements")).unwrap_or(&[]);
    let types = arr(get(policy, "fieldTypes")).ok_or_else(|| {
        err(
            "SQLSERVER_TABLE_POLICY",
            "Explicit type and partition-family policy required",
        )
    })?;
    let families = arr(get(policy, "partitionFamilies")).ok_or_else(|| {
        err(
            "SQLSERVER_TABLE_POLICY",
            "Explicit type and partition-family policy required",
        )
    })?;
    if let Value::Object(props) = policy {
        if props
            .iter()
            .any(|(n, _)| n != &k("fieldTypes") && n != &k("partitionFamilies"))
        {
            return Err(err(
                "SQLSERVER_TABLE_POLICY",
                "Unknown SQL Server policy property",
            ));
        }
    } else {
        return Err(err(
            "SQLSERVER_TABLE_POLICY",
            "Explicit type and partition-family policy required",
        ));
    }
    let mut type_map = HashMap::<(Utf16, Utf16, Utf16), String>::new();
    for row in types {
        let key = row_key(row)
            .ok_or_else(|| err("SQLSERVER_TABLE_POLICY", "Invalid field type policy"))?;
        let sql = scalar(get(row, "sqlType"))?;
        if type_map.insert(key, sql).is_some() {
            return Err(err(
                "SQLSERVER_TABLE_POLICY",
                "Invalid or duplicate field type policy",
            ));
        }
        if let Value::Object(props) = row {
            if props.len() != 4
                || props.iter().any(|(n, _)| {
                    ["module", "element", "field", "sqlType"]
                        .iter()
                        .all(|x| n != &k(x))
                })
            {
                return Err(err("SQLSERVER_TABLE_POLICY", "Invalid field type policy"));
            }
        } else {
            return Err(err("SQLSERVER_TABLE_POLICY", "Invalid field type policy"));
        }
    }
    let mut family_map = HashMap::<Utf16, (String, String)>::new();
    for row in families {
        let name = text(get(row, "name"))
            .ok_or_else(|| err("SQLSERVER_TABLE_POLICY", "Invalid partition family"))?
            .clone();
        let scheme = scalar(get(row, "scheme"))?;
        let column = scalar(get(row, "column"))?;
        quote(&scheme)?;
        quote(&column)?;
        if family_map.insert(name, (scheme, column)).is_some() {
            return Err(err(
                "SQLSERVER_TABLE_POLICY",
                "Invalid or duplicate partition family",
            ));
        }
        if let Value::Object(props) = row {
            if props.len() != 3
                || props
                    .iter()
                    .any(|(n, _)| ["name", "scheme", "column"].iter().all(|x| n != &k(x)))
            {
                return Err(err("SQLSERVER_TABLE_POLICY", "Invalid partition family"));
            }
        } else {
            return Err(err("SQLSERVER_TABLE_POLICY", "Invalid partition family"));
        }
    }
    for row in types {
        let key = row_key(row)
            .ok_or_else(|| err("SQLSERVER_TABLE_POLICY", "Invalid field type policy"))?;
        let bound = fields
            .iter()
            .any(|f| row_key(f).as_ref() == Some(&key) && eq(get(f, "storage"), "column"));
        let owner = elements.iter().any(|e| {
            text(get(e, "module")) == Some(&key.0) && text(get(e, "element")) == Some(&key.1)
        });
        if !bound || !owner {
            return Err(err(
                "SQLSERVER_TABLE_POLICY",
                "Field type policy has no table-bound DDD column",
            ));
        }
    }
    for row in families {
        if !elements
            .iter()
            .any(|e| text(get(e, "partition")) == text(get(row, "name")))
        {
            return Err(err(
                "SQLSERVER_TABLE_POLICY",
                "Partition family is not selected by a bound element",
            ));
        }
    }
    let mut residuals = Vec::new();
    let mut mappings = Vec::new();
    let mut statements = Vec::<String>::new();
    let mut schemas = HashSet::new();
    let mut tables = HashSet::new();
    for (ei, element) in elements.iter().enumerate() {
        let ep = format!("/extensions/umf.binding/elements/{ei}");
        let module = text(get(element, "module"))
            .ok_or_else(|| err("BINDING_REFERENCE", "Missing element module"))?;
        let element_id = text(get(element, "element"))
            .ok_or_else(|| err("BINDING_REFERENCE", "Missing element identity"))?;
        let definition = entity_definition(model, module, element_id);
        if definition.is_none() || !eq(get(definition.unwrap_or(&Value::Null), "kind"), "entity") {
            residuals.push(obj(vec![
                ("path", strv(&ep)),
                (
                    "reason",
                    strv("Only DDD entities have a table carrier in this slice"),
                ),
                ("choice", copy_json(element, ctx)?),
            ]));
            continue;
        }
        let Some((schema, name)) = qualified_parts(get(element, "table"))? else {
            residuals.push(obj(vec![
                ("path", strv(&ep)),
                ("reason", strv("An exact schema.table override is required")),
                ("choice", copy_json(element, ctx)?),
            ]));
            continue;
        };
        quote(&schema)?;
        quote(&name)?;
        let table_id = format!("{}\u{1f}{}", schema.to_lowercase(), name.to_lowercase());
        if !tables.insert(table_id) {
            return Err(err(
                "SQLSERVER_TABLE_DUPLICATE",
                "Two logical elements target one SQL Server table",
            ));
        }
        let ddd_fields = get(definition.unwrap(), "fields")
            .and_then(|v| {
                if let Value::Object(x) = v {
                    Some(x)
                } else {
                    None
                }
            })
            .ok_or_else(|| err("DDD_DOCUMENT", "Entity fields must be an object"))?;
        let rows: Vec<(usize, &Value)> = fields
            .iter()
            .enumerate()
            .filter(|(_, f)| {
                text(get(f, "module")) == Some(module)
                    && text(get(f, "element")) == Some(element_id)
            })
            .collect();
        for (field_name, _) in ddd_fields {
            if !rows
                .iter()
                .any(|(_, r)| text(get(r, "field")) == Some(field_name))
            {
                residuals.push(obj(vec![
                    ("path", strv(&ep)),
                    ("reason", strv("DDD field has no physical binding")),
                    (
                        "choice",
                        obj(vec![("field", Value::String(field_name.clone()))]),
                    ),
                ]));
            }
        }
        let mut cols = Vec::<String>::new();
        let mut occupied = HashSet::<String>::new();
        let mut embedded = Vec::<(String, Vec<Value>, Vec<String>)>::new();
        for (fi, field) in &rows {
            let fp = format!("/extensions/umf.binding/fields/{fi}");
            let Some(field_name_value) = text(get(field, "field")) else {
                residuals.push(obj(vec![
                    ("path", strv(&fp)),
                    ("reason", strv("This slice requires an exact DDD field key")),
                    ("choice", copy_json(field, ctx)?),
                ]));
                continue;
            };
            let field_name = field_name_value.to_utf8().map_err(|_| {
                err(
                    "BINDING_REFERENCE",
                    "DDD field reference must be valid Unicode",
                )
            })?;
            let auth = ddd_fields
                .iter()
                .find(|(n, _)| n.to_utf8().ok().as_deref() == Some(&field_name))
                .map(|(_, v)| v)
                .ok_or_else(|| err("BINDING_REFERENCE", "Unresolved DDD field"))?;
            if eq(get(field, "storage"), "embedded") {
                let column = scalar(get(field, "documentColumn"))?;
                quote(&column)?;
                let path = get(field, "path")
                    .cloned()
                    .ok_or_else(|| err("BINDING_REFERENCE", "Embedded field path missing"))?;
                let group = embedded.iter_mut().find(|g| g.0 == column);
                if let Some(g) = group {
                    g.1.push(path);
                    g.2.push(fp.clone());
                } else {
                    embedded.push((column, vec![path], vec![fp.clone()]));
                }
                residuals.push(obj(vec![("path",strv(&fp)),("reason",strv("SQL Server stores the declared path in text JSON; path presence and value type are not enforced by this table DDL")),("choice",copy_json(field,ctx)?)]));
                continue;
            }
            if !eq(get(auth, "cardinality"), "one") && !eq(get(auth, "cardinality"), "optional") {
                residuals.push(obj(vec![("path",strv(&fp)),("reason",strv("A many-valued DDD field needs a separately declared table or document carrier")),("choice",copy_json(field,ctx)?)]));
                continue;
            }
            let type_name = get(get(auth, "type").unwrap_or(&Value::Null), "name")
                .and_then(|v| text(Some(v)))
                .ok_or_else(|| err("DDD_DOCUMENT", "Field type missing"))?;
            let requested = row_key(field).and_then(|key| type_map.get(&key));
            let mapped = requested.and_then(|x| scalar_type(x));
            let expected = type_name
                .to_utf8()
                .map_err(|_| err("DDD_DOCUMENT", "Invalid DDD scalar type"))?;
            if !eq(
                get(get(auth, "type").unwrap_or(&Value::Null), "kind"),
                "scalar",
            ) || !mapped
                .as_ref()
                .is_some_and(|(_, ddd)| *ddd == expected.as_str())
            {
                residuals.push(obj(vec![
                    ("path", strv(&fp)),
                    (
                        "reason",
                        strv("No safe explicit SQL scalar type mapping for this DDD field"),
                    ),
                    (
                        "choice",
                        obj(vec![
                            ("field", copy_json(field, ctx)?),
                            ("type", requested.map(|x| strv(x)).unwrap_or(Value::Null)),
                        ]),
                    ),
                ]));
                continue;
            }
            let (sql, _) = mapped.unwrap();
            let reason=match expected.as_str(){"integer"=>Some("SQL Server finite integer domain does not represent an unbounded DDD integer"),"string"=>Some("SQL Server nvarchar has finite UTF-16 storage, collation and trailing-space behavior outside DDD string meaning"),"decimal"=>Some("SQL Server decimal precision and scale narrow an unqualified DDD decimal"),"bytes"=>Some("SQL Server varbinary has a finite length bound outside DDD bytes meaning"),"date-time"=>Some("DDD date-time does not declare instant/civil, precision or offset semantics"),_=>None};
            if let Some(reason) = reason {
                residuals.push(obj(vec![
                    ("path", strv(&fp)),
                    ("reason", strv(reason)),
                    ("choice", copy_json(field, ctx)?),
                ]));
            }
            if eq(get(auth, "cardinality"), "optional") {
                residuals.push(obj(vec![("path",strv(&fp)),("reason",strv("SQL NULL is the selected absence carrier; DDD optionality alone does not define native NULL behavior")),("choice",copy_json(field,ctx)?)]));
            }
            let column = scalar(get(field, "column"))?;
            quote(&column)?;
            if !occupied.insert(column.clone()) {
                return Err(err("SQLSERVER_TABLE_COLUMN", "Duplicate physical column"));
            }
            cols.push(format!(
                "{} {} {}",
                quote(&column)?,
                sql,
                if eq(get(auth, "cardinality"), "one") {
                    "NOT NULL"
                } else {
                    "NULL"
                }
            ));
            mappings.push(obj(vec![
                ("sourcePath", strv(&fp)),
                ("target", strv(&format!("{schema}.{name}.{column}"))),
            ]));
        }
        for (column, paths, source_paths) in embedded {
            if occupied.contains(&column) {
                let direct = rows.iter().map(|(_, r)| *r).find(|r| {
                    eq(get(r, "storage"), "column")
                        && text(get(r, "column"))
                            .is_some_and(|x| x.to_utf8().ok().as_deref() == Some(column.as_str()))
                });
                if direct
                    .and_then(|r| row_key(r))
                    .and_then(|k| type_map.get(&k).cloned())
                    .and_then(|t| scalar_type(&t).map(|(s, _)| s.to_owned()))
                    .as_deref()
                    != Some("nvarchar(max)")
                {
                    return Err(err("SQLSERVER_TABLE_COLUMN","Embedded document column must be an explicitly typed nvarchar(max) carrier"));
                }
            } else {
                occupied.insert(column.clone());
                cols.push(format!("{} nvarchar(max) NULL", quote(&column)?));
                mappings.push(obj(vec![
                    (
                        "sourcePath",
                        strv(source_paths.first().map(String::as_str).unwrap_or("")),
                    ),
                    ("target", strv(&format!("{schema}.{name}.{column}"))),
                ]));
            }
            cols.push(format!(
                "CONSTRAINT {} CHECK ({} IS NULL OR ISJSON({}, OBJECT)=1)",
                quote(&format!("CK_{name}_{column}_json"))?,
                quote(&column)?,
                quote(&column)?
            ));
            let mut seen = HashSet::new();
            for path in paths {
                let encoded = stringify_compact_metered(&path, ctx)?;
                let s = encoded
                    .to_utf8()
                    .map_err(|_| err("SQLSERVER_TABLE_PATH", "Invalid embedded path"))?;
                if !seen.insert(s) {
                    return Err(err(
                        "SQLSERVER_TABLE_PATH",
                        "Duplicate embedded path in a document column",
                    ));
                }
            }
        }
        if cols.is_empty() {
            residuals.push(obj(vec![
                ("path", strv(&ep)),
                ("reason", strv("Cannot emit an empty SQL Server table")),
                ("choice", copy_json(element, ctx)?),
            ]));
            continue;
        }
        if schemas.insert(schema.to_owned()) {
            statements.push(format!(
                "IF SCHEMA_ID(N'{}') IS NULL EXEC(N'CREATE SCHEMA {}');",
                schema.replace('\'', "''"),
                quote(&schema)?.replace('\'', "''")
            ));
        }
        let placement = if let Some(part) = text(get(element, "partition")) {
            if let Some((scheme, column)) = family_map.get(part) {
                if !occupied.contains(column) {
                    residuals.push(obj(vec![
                        ("path", strv(&format!("{ep}/partition"))),
                        (
                            "reason",
                            strv("Partition column is absent from emitted table"),
                        ),
                        (
                            "choice",
                            obj(vec![("scheme", strv(scheme)), ("column", strv(column))]),
                        ),
                    ]));
                    String::new()
                } else {
                    format!(" ON {}({})", quote(scheme)?, quote(column)?)
                }
            } else {
                residuals.push(obj(vec![
                    ("path", strv(&format!("{ep}/partition"))),
                    (
                        "reason",
                        strv("Partition family lacks an explicit SQL Server scheme/column policy"),
                    ),
                    ("choice", Value::String(part.clone())),
                ]));
                String::new()
            }
        } else {
            String::new()
        };
        statements.push(format!(
            "CREATE TABLE {}.{} (\n  {}\n){};",
            quote(&schema)?,
            quote(&name)?,
            cols.join(",\n  "),
            placement
        ));
        mappings.push(obj(vec![
            ("sourcePath", strv(&ep)),
            ("target", strv(&format!("{schema}.{name}"))),
        ]));
        residuals.push(obj(vec![("path",strv(&ep)),("reason",strv("DDD identity is retained; this table slice does not emit a primary or unique key")),("choice",get(definition.unwrap(),"identity").cloned().unwrap_or(Value::Null))]));
        if let Some(value) = get(definition.unwrap(), "aggregate") {
            residuals.push(obj(vec![
                ("path", strv(&ep)),
                (
                    "reason",
                    strv("DDD aggregate membership and lifecycle are not SQL table semantics"),
                ),
                ("choice", copy_json(value, ctx)?),
            ]));
        }
        let module_index = arr(get(model, "modules"))
            .unwrap_or(&[])
            .iter()
            .position(|m| text(get(m, "id")) == Some(module))
            .unwrap_or(0);
        let element_index = arr(get(
            arr(get(model, "modules"))
                .unwrap_or(&[])
                .get(module_index)
                .unwrap_or(&Value::Null),
            "elements",
        ))
        .unwrap_or(&[])
        .iter()
        .position(|e| text(get(e, "id")) == Some(element_id))
        .unwrap_or(0);
        for (ii, invariant) in arr(get(definition.unwrap(), "invariants"))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            residuals.push(obj(vec![
                ("path", strv(&format!("/modules/{module_index}/elements/{element_index}/extensions/umf.ddd/invariants/{ii}"))),
                (
                    "reason",
                    strv("DDD invariant is retained but not interpreted or enforced"),
                ),
                ("choice", copy_json(invariant, ctx)?),
            ]));
        }
    }
    for (i, field) in fields.iter().enumerate() {
        if !elements.iter().any(|e| {
            text(get(e, "module")) == text(get(field, "module"))
                && text(get(e, "element")) == text(get(field, "element"))
        }) {
            residuals.push(obj(vec![
                ("path", strv(&format!("/extensions/umf.binding/fields/{i}"))),
                (
                    "reason",
                    strv("Field has no table-bound owner in this projection"),
                ),
                ("choice", copy_json(field, ctx)?),
            ]));
        }
    }
    for (i, rel) in arr(get(payload, "relationships"))
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        residuals.push(obj(vec![
            (
                "path",
                strv(&format!("/extensions/umf.binding/relationships/{i}")),
            ),
            (
                "reason",
                strv("Relationship storage is handled by the relationship-dependent generator"),
            ),
            ("choice", copy_json(rel, ctx)?),
        ]));
    }
    for (i, index) in arr(get(payload, "indexes"))
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        residuals.push(obj(vec![
            (
                "path",
                strv(&format!("/extensions/umf.binding/indexes/{i}")),
            ),
            (
                "reason",
                strv("Index storage is handled by the separate index generator"),
            ),
            ("choice", copy_json(index, ctx)?),
        ]));
    }
    if statements.is_empty() {
        residuals.push(obj(vec![
            ("path", strv("/extensions/umf.binding/elements")),
            (
                "reason",
                strv("No complete SQL Server table can be emitted"),
            ),
            ("choice", copy_json(&Value::Array(elements.to_vec()), ctx)?),
        ]));
    }
    let blocked = statements.is_empty() || (loss_policy == "strict" && !residuals.is_empty());
    let status = if blocked {
        "blocked"
    } else if residuals.is_empty() {
        "proposed"
    } else {
        "reported"
    };
    let mut result = vec![
        ("status", strv(status)),
        ("logical", copy_json(logical, ctx)?),
        ("binding", copy_json(binding, ctx)?),
        ("target", target),
        ("policy", copy_json(policy, ctx)?),
        ("residuals", Value::Array(residuals)),
        ("mappings", Value::Array(mappings)),
    ];
    if !blocked && !statements.is_empty() {
        result.push(("candidate", strv(&(statements.join("\n") + "\n"))));
    }
    if let Some(native) = native_source {
        let source = scalar(Some(native))?;
        let source_units = source.encode_utf16().collect::<Vec<_>>();
        let source_utf16 = Utf16::new(source_units);
        let source_tree =
            crate::native_json::NativeJsonTree::parse_json(source_utf16.units(), ctx)?;
        let source_rendered = source_tree
            .render_compact(ctx)?
            .to_utf8()
            .map_err(|_| err("SQLSERVER_SOURCE", "Native source must be valid UTF-8 JSON"))?;
        let catalog = crate::sqlserver_adapter::SqlServerCatalog::import(&source_utf16, ctx)?;
        let mut exported = crate::sqlserver_adapter::SqlServerCatalog::export(&catalog, ctx)?
            .to_utf8()
            .map_err(|_| err("SQLSERVER_SOURCE", "Native source must be valid UTF-8 JSON"))?;
        if exported.ends_with('\n') {
            exported.pop();
        }
        if exported != source_rendered {
            return Err(err(
                "SQLSERVER_SOURCE",
                "Native source and retained catalog differ",
            ));
        }
        let archive = crate::sqlserver_adapter::document_value(
            &Utf16::from("sqlserver-binding-native-archive"),
            &catalog,
            ctx,
        )?;
        result.push(("nativeArchive", archive));
        result.push(("nativeSource", native.clone()));
    }
    Ok(obj(result))
}

/// Compose the table proposal with native planned-column index semantics.
pub fn project_binding_tables_and_indexes_from_plan_to_sqlserver(
    resources: &BindingIndexProjectionResources,
    logical: &Value,
    binding: &Value,
    policy: &Value,
    loss_policy: &str,
    native_source: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if loss_policy != "strict" && loss_policy != "report" {
        return Err(err(
            "BINDING_LOSS_POLICY",
            "Expected strict or report loss policy",
        ));
    }
    let tables = project_binding_tables_to_sqlserver(
        resources,
        logical,
        binding,
        policy,
        "report",
        native_source,
        ctx,
    )?;
    let Some(table_candidate) = text(get(&tables, "candidate"))
        .map(|value| value.to_utf8())
        .transpose()
        .map_err(|_| err("SQLSERVER_TABLE_PLAN", "Generated SQL is not valid Unicode"))?
    else {
        return Ok(rebuild_result(&tables, "blocked", None, None));
    };
    let binding_payload = get(
        get(binding, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .ok_or_else(|| err("BINDING_DOCUMENT", "Binding extension payload is missing"))?;
    let fields = arr(get(binding_payload, "fields")).unwrap_or(&[]);
    let elements = arr(get(binding_payload, "elements")).unwrap_or(&[]);
    let type_policy = arr(get(policy, "fieldTypes")).unwrap_or(&[]);
    let mut planned = Vec::new();
    for (index, field) in fields.iter().enumerate() {
        let Some(owner) = elements.iter().find(|element| {
            text(get(element, "module")) == text(get(field, "module"))
                && text(get(element, "element")) == text(get(field, "element"))
        }) else {
            continue;
        };
        let Some((schema, table)) = qualified_parts(get(owner, "table"))? else {
            continue;
        };
        let Some(column) = (if eq(get(field, "storage"), "embedded") {
            text(get(field, "documentColumn"))
        } else {
            text(get(field, "column"))
        }) else {
            continue;
        };
        let column = column
            .to_utf8()
            .map_err(|_| err("SQLSERVER_IDENTIFIER", "Invalid SQL Server column"))?;
        let field_path = format!("/extensions/umf.binding/fields/{index}");
        let target_path = format!("{schema}.{table}.{column}");
        let mapped = arr(get(&tables, "mappings"))
            .unwrap_or(&[])
            .iter()
            .any(|mapping| {
                text(get(mapping, "sourcePath"))
                    .and_then(|v| v.to_utf8().ok())
                    .as_deref()
                    == Some(field_path.as_str())
                    && text(get(mapping, "target"))
                        .and_then(|v| v.to_utf8().ok())
                        .as_deref()
                        == Some(target_path.as_str())
            });
        if !mapped {
            continue;
        }
        let max_length = if eq(get(field, "storage"), "embedded") {
            -1
        } else {
            let key = row_key(field)
                .ok_or_else(|| err("SQLSERVER_TABLE_PLAN", "Field type is missing"))?;
            let sql_type = type_policy
                .iter()
                .find(|row| row_key(row).as_ref() == Some(&key))
                .and_then(|row| text(get(row, "sqlType")))
                .ok_or_else(|| {
                    err(
                        "SQLSERVER_TABLE_PLAN",
                        "Emitted field has no explicit SQL type",
                    )
                })?
                .to_utf8()
                .map_err(|_| err("SQLSERVER_TABLE_PLAN", "SQL type must be valid Unicode"))?;
            planned_sqlserver_length(&sql_type)
        };
        if !planned.iter().any(|row: &Value| {
            text(get(row, "schema")) == Some(&Utf16::from(schema.as_str()))
                && text(get(row, "table")) == Some(&Utf16::from(table.as_str()))
                && text(get(row, "column")) == Some(&Utf16::from(column.as_str()))
        }) {
            planned.push(obj(vec![
                ("schema", strv(&schema)),
                ("table", strv(&table)),
                ("column", strv(&column)),
                ("maxLength", Value::Number(max_length as f64)),
            ]));
        }
    }
    let indexes =
        crate::binding_sqlserver_planned_indexes::project_binding_indexes_against_sqlserver_plan(
            resources,
            logical,
            binding,
            &Value::Array(planned),
            "report",
            ctx,
        )?;
    let mut residuals: Vec<Value> = arr(get(&tables, "residuals"))
        .unwrap_or(&[])
        .iter()
        .filter(|row| {
            !text(get(row, "path"))
                .and_then(|value| value.to_utf8().ok())
                .is_some_and(|path| path.starts_with("/extensions/umf.binding/indexes/"))
        })
        .cloned()
        .collect();
    residuals.extend(
        arr(get(&indexes, "residuals"))
            .unwrap_or(&[])
            .iter()
            .cloned(),
    );
    let candidate = table_candidate
        + &text(get(&indexes, "candidate"))
            .map(|value| value.to_utf8())
            .transpose()
            .map_err(|_| err("SQLSERVER_TABLE_PLAN", "Generated SQL is not valid Unicode"))?
            .unwrap_or_default();
    let blocked = loss_policy == "strict" && !residuals.is_empty();
    let status = if blocked {
        "blocked"
    } else if residuals.is_empty() {
        "proposed"
    } else {
        "reported"
    };
    Ok(rebuild_result(
        &tables,
        status,
        Some(Value::Array(residuals)),
        (!blocked).then(|| strv(&candidate)),
    ))
}

/// Compose the table proposal with an observed SQL Server catalog before index emission.
pub fn project_binding_tables_and_indexes_to_sqlserver(
    resources: &BindingIndexProjectionResources,
    logical: &Value,
    binding: &Value,
    policy: &Value,
    native_source: &Value,
    loss_policy: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let planned = project_binding_tables_and_indexes_from_plan_to_sqlserver(
        resources,
        logical,
        binding,
        policy,
        "report",
        Some(native_source),
        ctx,
    )?;
    if get(&planned, "candidate").is_none() {
        return Ok(rebuild_result(&planned, "blocked", None, None));
    }
    let source_archive = get(&planned, "nativeArchive").ok_or_else(|| {
        err(
            "SQLSERVER_TABLE_CATALOG",
            "Native catalog archive is missing",
        )
    })?;
    validate_index_columns_against_native_archive(source_archive, binding, policy, &planned, ctx)?;
    if loss_policy != "strict" && loss_policy != "report" {
        return Err(err(
            "BINDING_LOSS_POLICY",
            "Expected strict or report loss policy",
        ));
    }
    let residuals = arr(get(&planned, "residuals")).unwrap_or(&[]).to_vec();
    let blocked = loss_policy == "strict" && !residuals.is_empty();
    let status = if blocked {
        "blocked"
    } else if residuals.is_empty() {
        "proposed"
    } else {
        "reported"
    };
    let candidate = if blocked {
        None
    } else {
        get(&planned, "candidate").cloned()
    };
    Ok(rebuild_result(
        &planned,
        status,
        Some(Value::Array(residuals)),
        candidate,
    ))
}

fn validate_index_columns_against_native_archive(
    archive: &Value,
    binding: &Value,
    policy: &Value,
    projection: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let catalog = crate::sqlserver_adapter::catalog_from_document(archive, ctx)?;
    let observed = crate::sqlserver_adapter::column_metadata_value(&catalog, ctx)?;
    let payload = get(
        get(binding, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .ok_or_else(|| err("BINDING_DOCUMENT", "Binding extension payload is missing"))?;
    let fields = arr(get(payload, "fields")).unwrap_or(&[]);
    let elements = arr(get(payload, "elements")).unwrap_or(&[]);
    let indexes = arr(get(payload, "indexes")).unwrap_or(&[]);
    let mappings = arr(get(projection, "mappings")).unwrap_or(&[]);
    let policies = arr(get(policy, "fieldTypes")).unwrap_or(&[]);
    for (index, field) in fields.iter().enumerate() {
        let reference = row_key(field);
        let used = indexes.iter().any(|item| {
            if !["btree", "unique", "partial"]
                .iter()
                .any(|kind| eq(get(item, "kind"), kind))
            {
                return false;
            }
            let on = arr(get(item, "on"))
                .unwrap_or(&[])
                .iter()
                .any(|target| row_key(get(target, "field").unwrap_or(&Value::Null)) == reference);
            let include = arr(get(item, "include"))
                .unwrap_or(&[])
                .iter()
                .any(|target| row_key(target) == reference);
            on || include
        });
        if !used {
            continue;
        }
        let owner = elements
            .iter()
            .find(|element| {
                text(get(element, "module")) == text(get(field, "module"))
                    && text(get(element, "element")) == text(get(field, "element"))
            })
            .ok_or_else(|| err("SQLSERVER_TABLE_PLAN", "Index owner has no emitted table"))?;
        let (schema, table) = qualified_parts(get(owner, "table"))?
            .ok_or_else(|| err("SQLSERVER_TABLE_PLAN", "Index owner has no emitted table"))?;
        let column = if eq(get(field, "storage"), "embedded") {
            text(get(field, "documentColumn"))
        } else {
            text(get(field, "column"))
        }
        .ok_or_else(|| err("SQLSERVER_TABLE_PLAN", "Index field has no physical column"))?;
        let column_name = column
            .to_utf8()
            .map_err(|_| err("SQLSERVER_IDENTIFIER", "Invalid SQL Server column"))?;
        let field_path = format!("/extensions/umf.binding/fields/{index}");
        let expected_target = format!("{schema}.{table}.{column_name}");
        if !mappings.iter().any(|row| {
            text(get(row, "sourcePath"))
                .and_then(|v| v.to_utf8().ok())
                .as_deref()
                == Some(field_path.as_str())
                && text(get(row, "target"))
                    .and_then(|v| v.to_utf8().ok())
                    .as_deref()
                    == Some(expected_target.as_str())
        }) {
            return Err(err(
                "SQLSERVER_TABLE_PLAN",
                "Index column is absent from generated table plan",
            ));
        }
        let (expected_name, expected_length) = if eq(get(field, "storage"), "embedded") {
            ("nvarchar".to_owned(), Some(-1))
        } else {
            let policy_row = policies
                .iter()
                .find(|row| row_key(row) == reference)
                .ok_or_else(|| {
                    err(
                        "SQLSERVER_TABLE_PLAN",
                        "Emitted field has no explicit SQL type",
                    )
                })?;
            let raw = scalar(get(policy_row, "sqlType"))?;
            let normalized: String = raw.to_ascii_lowercase().split_whitespace().collect();
            let name = normalized
                .split('(')
                .next()
                .unwrap_or(&normalized)
                .to_owned();
            let length = if name == "nvarchar" || name == "varbinary" {
                Some(planned_sqlserver_length(&raw))
            } else {
                None
            };
            (name, length)
        };
        let native_column = arr(Some(&observed)).unwrap_or(&[]).iter().find(|row| {
            eq(get(get(row, "table").unwrap_or(&Value::Null), "schema"), &schema)
                && eq(get(get(row, "table").unwrap_or(&Value::Null), "name"), &table)
                && eq(get(get(row, "element").unwrap_or(&Value::Null), "name"), &column_name)
        }).and_then(|row| get(row, "nativeColumn"))
            .ok_or_else(|| err("SQLSERVER_TABLE_CATALOG", &format!("Native catalog does not match generated table column {schema}.{table}.{column_name}")))?;
        // sqlserver_adapter exposes nativeColumn as a lossless tagged JSON tree,
        // not a plain object. Read its members without flattening or coercing the
        // retained representation.
        let actual_name = tagged_native_text(Some(native_column), "base_type_name")
            .ok_or_else(|| err("SQLSERVER_TABLE_CATALOG", "Native column type is unavailable"))?;
        let actual_length = tagged_native_integer(Some(native_column), "max_length");
        if actual_name.to_ascii_lowercase() != expected_name
            || expected_length.is_some_and(|length| actual_length != Some(length))
        {
            return Err(err("SQLSERVER_TABLE_CATALOG", &format!("Native catalog does not match generated table column {schema}.{table}.{column_name}")));
        }
    }
    Ok(())
}

fn planned_sqlserver_length(raw: &str) -> i64 {
    let normalized: String = raw.to_ascii_lowercase().split_whitespace().collect();
    for (prefix, multiplier) in [("nvarchar(", 2), ("varbinary(", 1)] {
        if let Some(inner) = normalized
            .strip_prefix(prefix)
            .and_then(|v| v.strip_suffix(')'))
        {
            return if inner == "max" {
                -1
            } else {
                inner.parse::<i64>().unwrap_or(0) * multiplier
            };
        }
    }
    0
}

fn rebuild_result(
    original: &Value,
    status: &str,
    residuals: Option<Value>,
    candidate: Option<Value>,
) -> Value {
    let Value::Object(fields) = original else {
        return Value::Null;
    };
    let mut result: Vec<(Utf16, Value)> = fields
        .iter()
        .filter(|(name, _)| {
            name != &k("status") && name != &k("residuals") && name != &k("candidate")
        })
        .cloned()
        .collect();
    result.push((k("status"), strv(status)));
    if let Some(residuals) = residuals.or_else(|| get(original, "residuals").cloned()) {
        result.push((k("residuals"), residuals));
    }
    if let Some(candidate) = candidate {
        result.push((k("candidate"), candidate));
    }
    Value::Object(result)
}

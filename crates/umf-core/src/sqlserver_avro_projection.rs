// SPDX-License-Identifier: MIT OR Apache-2.0
//! SQL Server capture to Avro schema projection.
use crate::{
    avro_document,
    context::Context,
    error::EngineError,
    native_json::{NativeJsonNode, NativeJsonTree},
    serialization::{write_json_value, Format},
    sqlserver_adapter::{self, SqlServerColumnMetadata},
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
fn s(v: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(x)) = v {
        Some(x)
    } else {
        None
    }
}
fn ascii_alpha(unit: u16) -> bool {
    (65..=90).contains(&unit) || (97..=122).contains(&unit)
}
fn st(v: Option<&Value>) -> Option<String> {
    s(v).and_then(|x| x.to_utf8().ok())
}
fn strv(x: &str) -> Value {
    Value::string_utf8(x)
}
fn obj(f: Vec<(&str, Value)>) -> Value {
    Value::Object(f.into_iter().map(|(n, v)| (k(n), v)).collect())
}
fn err(c: &str, m: &str) -> EngineError {
    EngineError::new(c, Utf16::default(), m)
}
fn ptr(p: &Utf16, n: &Utf16) -> Utf16 {
    let mut o = p.units().to_vec();
    o.push(47);
    for u in n.units() {
        match *u {
            126 => o.extend([126, 48]),
            47 => o.extend([126, 49]),
            x => o.push(x),
        }
    }
    Utf16::new(o)
}
fn path_suffix(path: &Utf16, suffix: &str) -> Utf16 {
    let mut units = path.units().to_vec();
    units.extend(suffix.encode_utf16());
    Utf16::new(units)
}
fn issue(p: Utf16, c: &str, cl: &str, d: &str) -> Value {
    obj(vec![
        ("path", Value::String(p)),
        ("code", strv(c)),
        ("classification", strv(cl)),
        ("detail", strv(d)),
        ("retainedInSource", Value::Bool(true)),
    ])
}
fn issue_utf16(p: Utf16, c: &str, cl: &str, d: Utf16) -> Value {
    obj(vec![
        ("path", Value::String(p)),
        ("code", strv(c)),
        ("classification", strv(cl)),
        ("detail", Value::String(d)),
        ("retainedInSource", Value::Bool(true)),
    ])
}
fn join_utf16(parts: &[&Utf16]) -> Utf16 {
    Utf16::new(
        parts
            .iter()
            .flat_map(|part| part.units().iter().copied())
            .collect(),
    )
}
fn ident(v: &Utf16) -> bool {
    let u = v.units();
    !u.is_empty()
        && (u[0] == 95 || ascii_alpha(u[0]))
        && u[1..]
            .iter()
            .all(|x| *x == 95 || (48..=57).contains(x) || ascii_alpha(*x))
}
fn policy(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let p = copy_json(v, ctx)?;
    let Value::Object(fields) = &p else {
        return Err(err("SQLSERVER_AVRO_POLICY", "Expected policy object"));
    };
    if fields.iter().any(|(x, _)| {
        ![
            "id",
            "recordName",
            "namespace",
            "table",
            "fields",
            "lossPolicy",
        ]
        .iter()
        .any(|a| x == &k(a))
    }) || s(get(&p, "id")).is_none_or(Utf16::is_empty)
        || s(get(&p, "recordName")).is_none_or(|x| !ident(x))
        || s(get(&p, "namespace")).is_none_or(|x| {
            x.units()
                .split(|u| *u == 46)
                .any(|p| !ident(&Utf16::new(p.to_vec())))
        })
        || !matches!(
            st(get(&p, "lossPolicy")).as_deref(),
            Some("strict" | "allow-reported-loss")
        )
    {
        return Err(err(
            "SQLSERVER_AVRO_POLICY",
            "Expected explicit Avro names and loss policy",
        ));
    }
    let Some(Value::Object(t)) = get(&p, "table") else {
        return Err(err("SQLSERVER_AVRO_POLICY", "Qualified table required"));
    };
    if t.iter()
        .any(|(x, _)| !["schema", "name"].iter().any(|a| x == &k(a)))
        || s(get(&Value::Object(t.clone()), "schema")).is_none()
        || s(get(&Value::Object(t.clone()), "name")).is_none()
    {
        return Err(err("SQLSERVER_AVRO_POLICY", "Qualified table required"));
    }
    let Some(Value::Object(bindings)) = get(&p, "fields") else {
        return Err(err(
            "SQLSERVER_AVRO_POLICY",
            "Explicit field bindings required",
        ));
    };
    if bindings.is_empty() {
        return Err(err(
            "SQLSERVER_AVRO_POLICY",
            "Explicit field bindings required",
        ));
    }
    let mut names = Vec::new();
    for (_, b) in bindings {
        let Value::Object(f) = b else {
            return Err(err("SQLSERVER_AVRO_POLICY", "Invalid binding"));
        };
        if f.iter()
            .any(|(x, _)| !["name", "representation"].iter().any(|a| x == &k(a)))
        {
            return Err(err("SQLSERVER_AVRO_POLICY", "Unknown binding member"));
        }
        let n = s(get(b, "name"))
            .filter(|n| ident(n))
            .ok_or_else(|| err("SQLSERVER_AVRO_POLICY", "Invalid Avro field"))?;
        if !matches!(
            st(get(b, "representation")).as_deref(),
            Some("value" | "sql-text")
        ) || names.contains(n)
        {
            return Err(err("SQLSERVER_AVRO_POLICY", "Invalid or duplicate binding"));
        }
        names.push(n.clone())
    }
    Ok(p)
}
fn native<'a>(n: &'a NativeJsonNode, name: &str) -> Option<&'a NativeJsonNode> {
    if let NativeJsonNode::Object(f) = n {
        f.iter().find(|(x, _)| x == &k(name)).map(|(_, v)| v)
    } else {
        None
    }
}
fn ni(n: Option<&NativeJsonNode>) -> Option<i64> {
    if let Some(NativeJsonNode::Number(x)) = n {
        let v = x.parse::<f64>().ok()?;
        if v.fract() != 0. || v.abs() > 9007199254740991. {
            None
        } else {
            Some(v as i64)
        }
    } else {
        None
    }
}
fn nb(n: Option<&NativeJsonNode>) -> Option<bool> {
    if let Some(NativeJsonNode::Boolean(v)) = n {
        Some(*v)
    } else {
        None
    }
}
fn ns(n: Option<&NativeJsonNode>) -> Option<&Utf16> {
    if let Some(NativeJsonNode::String(value)) = n {
        Some(value)
    } else {
        None
    }
}
fn json_string(value: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    write_json_value(&Value::String(value.clone()), Format::Json, ctx)
}
fn result(
    source: Value,
    p: Value,
    issues: Vec<Value>,
    maps: Vec<Value>,
    target: Option<Value>,
    schema: Option<Utf16>,
    fatal: bool,
) -> Value {
    let blocked =
        fatal || st(get(&p, "lossPolicy")).as_deref() == Some("strict") && !issues.is_empty();
    let mut o = vec![
        (
            k("status"),
            strv(if blocked { "blocked" } else { "projected" }),
        ),
        (k("source"), source),
        (k("policy"), p),
        (k("issues"), Value::Array(issues)),
        (k("mappings"), Value::Array(maps)),
    ];
    if !blocked {
        if let Some(x) = target {
            o.push((k("target"), x))
        }
        if let Some(x) = schema {
            o.push((k("nativeSchema"), Value::String(x)))
        }
    }
    Value::Object(o)
}
fn project(source: &Value, input: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let source = copy_json(source, ctx)?;
    let p = policy(input, ctx)?;
    let inspection = sqlserver_adapter::inspect_document(&source, ctx)?;
    if !matches!(get(&inspection, "valid"), Some(Value::Bool(true))) {
        return Err(err("SQLSERVER_AVRO_SOURCE", "Invalid source capture"));
    }
    let mut issues = match get(&inspection, "diagnostics") {
        Some(Value::Array(v)) => v
            .iter()
            .map(|d| {
                issue(
                    s(get(d, "path")).cloned().unwrap_or_default(),
                    &st(get(d, "code")).unwrap_or_default(),
                    "not-enforced",
                    &st(get(d, "message")).unwrap_or_default(),
                )
            })
            .collect(),
        _ => Vec::new(),
    };
    let mut fatal = issues.iter().any(|d| {
        [
            "SQLSERVER_VERSION",
            "SQLSERVER_MODIFIED",
            "SQLSERVER_ENCODING",
        ]
        .iter()
        .any(|c| s(get(d, "code")) == Some(&k(c)))
    });
    if fatal {
        return Ok(result(source, p, issues, vec![], None, None, true));
    }
    let _ = sqlserver_adapter::export_document(&source, ctx)?;
    let catalog = sqlserver_adapter::catalog_from_document(&source, ctx)?;
    let Some(Value::Object(t)) = get(&p, "table") else {
        unreachable!()
    };
    let schema = s(get(&Value::Object(t.clone()), "schema")).unwrap().clone();
    let table = s(get(&Value::Object(t.clone()), "name")).unwrap().clone();
    let all = catalog.column_metadata(ctx)?;
    let columns: Vec<SqlServerColumnMetadata> = all
        .into_iter()
        .filter(|c| c.schema == schema && c.table == table)
        .collect();
    if columns.is_empty() {
        issues.push(issue(
            k("/table"),
            "SQLSERVER_AVRO_UNSUPPORTED",
            "unsupported",
            "Table is absent or has no captured columns",
        ));
        return Ok(result(source, p, issues, vec![], None, None, true));
    }
    issues.push(issue(Utf16::default(),"SCHEMA_ONLY","representation-change","Schema projection only: SQL/native row values require a separate explicit encoder; source UMF remains required for fidelity"));
    issues.push(issue(k("/table"),"DATABASE_SEMANTICS","not-enforced","Keys, checks, foreign keys, permissions, triggers, indexes and other database semantics are not enforced by this Avro record and may be outside the capture"));
    let constraints = catalog.constraint_metadata(ctx)?;
    let indexes = catalog.index_metadata(ctx)?;
    for meta in &constraints.tables {
        if let Some(Value::String(path)) = get(meta, "path") {
            if get(meta, "table").is_some_and(|table_meta| {
                s(get(table_meta, "schema")) == Some(&schema)
                    && s(get(table_meta, "name")) == Some(&table)
            }) {
                let base = path.clone();
                let available = get(meta, "available");
                for section in ["keys", "foreign_keys", "checks"] {
                    if !matches!(
                        available.and_then(|value| get(value, section)),
                        Some(Value::Bool(true))
                    ) {
                        issues.push(issue(
                            path_suffix(&base, &format!("/{section}")),
                            "CONSTRAINT_COVERAGE_UNAVAILABLE",
                            "not-enforced",
                            &format!("Native {section} were not captured; absence of observations does not imply absence of constraints"),
                        ));
                    }
                    if let Some(Value::Array(rows)) = get(meta, section) {
                        for (i, row) in rows.iter().enumerate() {
                            let tree = NativeJsonTree::from_tagged_value(row, ctx)?;
                            let native_row = tree.root();
                            let name = ns(native(native_row, "name")).cloned().unwrap_or_default();
                            let quoted_name = json_string(&name, ctx)?;
                            let kind = ns(native(native_row, "kind")).cloned().unwrap_or_default();
                            let delete_action = ns(native(native_row, "delete_action"))
                                .cloned()
                                .unwrap_or_default();
                            let update_action = ns(native(native_row, "update_action"))
                                .cloned()
                                .unwrap_or_default();
                            let (code, detail) = match section {
                                "keys" => (
                                    "KEY_NOT_ENFORCED",
                                    join_utf16(&[
                                        &Utf16::from("Key "),
                                        &quoted_name,
                                        &Utf16::from(" ("),
                                        &kind,
                                        &Utf16::from(") is not enforced across Avro records; column order, index behavior and disabled state remain native"),
                                    ]),
                                ),
                                "foreign_keys" => (
                                    "FOREIGN_KEY_NOT_ENFORCED",
                                    join_utf16(&[
                                        &Utf16::from("Foreign key "),
                                        &quoted_name,
                                        &Utf16::from(" is not enforced; referenced columns, "),
                                        &delete_action,
                                        &Utf16::from("/"),
                                        &update_action,
                                        &Utf16::from(" actions, trust, disabled and replication state remain native"),
                                    ]),
                                ),
                                _ => (
                                    "CHECK_NOT_ENFORCED",
                                    join_utf16(&[
                                        &Utf16::from("Check "),
                                        &quoted_name,
                                        &Utf16::from(" is not evaluated; SQL null/UNKNOWN behavior, trust, disabled, replication and collation state remain native"),
                                    ]),
                                ),
                            };
                            issues.push(issue_utf16(
                                path_suffix(&base, &format!("/{section}/{i}")),
                                code,
                                "not-enforced",
                                detail,
                            ));
                        }
                    }
                }
            }
        }
    }
    for meta in &indexes.tables {
        if let Some(Value::String(base)) = get(meta, "path") {
            if get(meta, "table").is_some_and(|table_meta| {
                s(get(table_meta, "schema")) == Some(&schema)
                    && s(get(table_meta, "name")) == Some(&table)
            }) {
                if let Some(Value::Array(rows)) = get(meta, "indexes") {
                    for (i, _) in rows.iter().enumerate() {
                        issues.push(issue(
                            path_suffix(base, &format!("/indexes/{i}")),
                            "INDEX_NOT_REPRESENTED",
                            "not-enforced",
                            "Native index/heap semantics are not represented: filtered uniqueness, SQL null/collation behavior, included/order/partition columns, disabled state and physical options remain source-owned",
                        ));
                    }
                }
            }
        }
    }
    let fields = match get(&p, "fields") {
        Some(Value::Object(x)) => x,
        _ => unreachable!(),
    };
    for c in &columns {
        if let Some(n) = s(get(&c.element, "name")) {
            if !fields.iter().any(|(x, _)| x == n) {
                issues.push(issue(
                    c.path.clone(),
                    "COLUMN_OMITTED",
                    "not-enforced",
                    "Column deliberately omitted by the selected field bindings",
                ))
            }
        }
    }
    let mut output = Vec::new();
    let mut maps = Vec::new();
    for (column, b) in fields {
        let Some(c) = columns
            .iter()
            .find(|c| s(get(&c.element, "name")) == Some(column))
        else {
            issues.push(issue(
                ptr(&k("/fields"), column),
                "SQLSERVER_AVRO_UNSUPPORTED",
                "unsupported",
                "Selected source column does not exist",
            ));
            fatal = true;
            continue;
        };
        let tree = NativeJsonTree::from_tagged_value(&c.native_column, ctx)?;
        let n = tree.root();
        let family = st(get(&c.element, "scalarType")).unwrap_or_default();
        let repr = st(get(b, "representation")).unwrap_or_default();
        let sys = ni(native(n, "system_type_id")).unwrap_or_default();
        let mut ty = None;
        let mut error = None;
        let binary_width = ni(native(n, "max_length"));
        let precision = ni(native(n, "precision"));
        let scale = ni(native(n, "scale"));
        if repr == "sql-text" {
            ty = Some(strv("string"));
            issues.push(issue(c.path.clone(),"SQL_TEXT_REPRESENTATION","representation-change","Native text is an explicit application encoding; formatting/session choices, type tags, XML validation and native lexical constraints are not preserved by Avro string"))
        } else {
            match family.as_str(){"boolean"=>ty=Some(strv("boolean")),"integer"=>{ty=Some(strv(if sys==127{"long"}else{"int"}));if sys!=127&&sys!=56{issues.push(issue(c.path.clone(),"INTEGER_RANGE","not-enforced","Avro int admits values outside the native tinyint/smallint range"))}},"float"=>{ty=Some(strv(if sys==59{"float"}else{"double"}));issues.push(issue(c.path.clone(),"NONFINITE_VALUES","not-enforced","Avro floating types admit non-finite values that are not SQL Server numeric values"))},"decimal"=>{if precision.is_none_or(|x|x<1||x>38)||scale.is_none_or(|x|x<0||x>precision.unwrap_or(0)){error=Some("Invalid or unsupported decimal precision/scale")}else{ty=Some(obj(vec![("type",strv("bytes")),("logicalType",strv("decimal")),("precision",Value::Number(precision.unwrap()as f64)),("scale",Value::Number(scale.unwrap()as f64))]));if [60,122].contains(&sys){issues.push(issue(c.path.clone(),"MONEY_RANGE","not-enforced","Decimal precision/scale does not enforce the narrower native money/smallmoney range"))}}},"string"=>{ty=Some(strv("string"));issues.push(issue(c.path.clone(),"TEXT_REFINEMENTS","not-enforced","Native byte/character limits, code page, collation and fixed-width padding are not enforced by Avro string"))},"binary"=>{if [173,189].contains(&sys){if binary_width.is_none_or(|x|x<1||x>8000)||(sys==189&&binary_width!=Some(8)){error=Some("Invalid fixed binary or rowversion width")}else{ty=Some(obj(vec![("type",strv("fixed")),("name",strv(&format!("{}_field_{}",st(get(&p,"recordName")).unwrap_or_default(),output.len()))),("size",Value::Number(binary_width.unwrap()as f64))]));}}else{ty=Some(strv("bytes"));issues.push(issue(c.path.clone(),"BINARY_LENGTH","not-enforced","Native varbinary/image length semantics are not enforced by Avro bytes"))}},"date"=>{ty=Some(obj(vec![("type",strv("int")),("logicalType",strv("date"))]));issues.push(issue(c.path.clone(),"DATE_RANGE","not-enforced","Avro date does not enforce the SQL Server year range"))},"time" if sys==41&&scale.is_some_and(|x|x<=6)=>{ty=Some(obj(vec![("type",strv("long")),("logicalType",strv("time-micros"))]));issues.push(issue(c.path.clone(),"TIME_RESOLUTION","not-enforced","Avro time-micros does not enforce the native scale or all native time constraints"))},"timestamp" if [42,43].contains(&sys)&&scale.is_some_and(|x|x<=6)=>{ty=Some(obj(vec![("type",strv("long")),("logicalType",strv(if sys==42{"local-timestamp-micros"}else{"timestamp-micros"}))]));issues.push(issue(c.path.clone(),"TIMESTAMP_REFINEMENTS","not-enforced","Native year range and scale are not enforced; datetimeoffset offset identity is not preserved by an instant"))},_=>error=Some("Native value mapping is unavailable or would lose temporal precision; choose sql-text")}
        }
        if let Some(message) = error {
            fatal = true;
            issues.push(issue(
                c.path.clone(),
                "SQLSERVER_AVRO_UNSUPPORTED",
                "unsupported",
                message,
            ))
        }
        maps.push(obj(vec![
            ("sourcePath", Value::String(c.path.clone())),
            ("column", Value::String(column.clone())),
            ("field", Value::String(s(get(b, "name")).unwrap().clone())),
            ("representation", strv(&repr)),
        ]));
        let internal = nb(native(n, "is_user_defined")).unwrap_or(false);
        if internal {
            issues.push(issue(
                c.path.clone(),
                "ALIAS_IDENTITY",
                "annotation-only",
                "Native alias identity and bound rules/defaults remain in source",
            ))
        }
        if nb(native(n, "is_identity")).unwrap_or(false)
            || nb(native(n, "is_computed")).unwrap_or(false)
            || sys == 189
        {
            issues.push(issue(
                c.path.clone(),
                "GENERATED_BEHAVIOR",
                "not-enforced",
                "Identity, computed or rowversion generation is not performed by an Avro writer",
            ))
        }
        if !matches!(native(n, "default_definition"), Some(NativeJsonNode::Null)) {
            issues.push(issue(
                c.path.clone(),
                "SQL_DEFAULT",
                "not-enforced",
                "SQL defaults do not become Avro reader defaults or make writer fields optional",
            ))
        }
        if let Some(ty) = ty {
            let name = s(get(b, "name")).unwrap().clone();
            let nullable = nb(native(n, "is_nullable")).unwrap_or(false);
            let t = if nullable {
                Value::Array(vec![strv("null"), ty])
            } else {
                ty
            };
            let mut f = vec![(k("name"), Value::String(name)), (k("type"), t)];
            if let Some(d) = s(get(&c.element, "description")) {
                f.push((k("doc"), Value::String(d.clone())))
            }
            output.push(Value::Object(f))
        }
    }
    if fatal || st(get(&p, "lossPolicy")).as_deref() == Some("strict") && !issues.is_empty() {
        return Ok(result(source, p, issues, maps, None, None, fatal));
    }
    let schema_value = obj(vec![
        ("type", strv("record")),
        (
            "name",
            Value::String(s(get(&p, "recordName")).unwrap().clone()),
        ),
        (
            "namespace",
            Value::String(s(get(&p, "namespace")).unwrap().clone()),
        ),
        ("fields", Value::Array(output)),
    ]);
    let schema = write_json_value(&schema_value, Format::Json, ctx)?;
    let target = avro_document::import_schema(s(get(&p, "id")).unwrap(), schema.units(), &[], ctx)?;
    Ok(result(
        source,
        p,
        issues,
        maps,
        Some(target),
        Some(schema),
        false,
    ))
}
pub fn project_sqlserver_to_avro(
    source: &Value,
    policy: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    project(source, policy, ctx)
}

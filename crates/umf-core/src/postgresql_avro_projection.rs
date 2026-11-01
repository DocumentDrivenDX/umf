// SPDX-License-Identifier: MIT OR Apache-2.0
//! PostgreSQL catalog capture to Avro schema projection.
use crate::{
    avro_document,
    context::Context,
    error::EngineError,
    native_json::{NativeJsonNode, NativeJsonTree},
    postgresql_catalog::{self, PostgresqlColumnMetadata},
    serialization::{write_json_value, Format},
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
fn st(v: Option<&Value>) -> Option<String> {
    s(v).and_then(|x| x.to_utf8().ok())
}
fn obj(f: Vec<(&str, Value)>) -> Value {
    Value::Object(f.into_iter().map(|(n, v)| (k(n), v)).collect())
}
fn strv(x: &str) -> Value {
    Value::string_utf8(x)
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
fn issue(p: Utf16, c: &str, cl: &str, d: &str) -> Value {
    obj(vec![
        ("path", Value::String(p)),
        ("code", strv(c)),
        ("classification", strv(cl)),
        ("detail", strv(d)),
        ("retainedInSource", Value::Bool(true)),
    ])
}
fn ident(v: &Utf16) -> bool {
    let u = v.units();
    !u.is_empty()
        && (u[0] == 95 || ascii_alpha(u[0]))
        && u[1..]
            .iter()
            .all(|x| *x == 95 || (48..=57).contains(x) || ascii_alpha(*x))
}
fn ascii_alpha(unit: u16) -> bool {
    (65..=90).contains(&unit) || (97..=122).contains(&unit)
}
fn native<'a>(n: &'a NativeJsonNode, k: &str) -> Option<&'a NativeJsonNode> {
    if let NativeJsonNode::Object(f) = n {
        f.iter().find(|(x, _)| x == &self::k(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn nt(n: Option<&NativeJsonNode>) -> Option<&Utf16> {
    if let Some(NativeJsonNode::String(x)) = n {
        Some(x)
    } else {
        None
    }
}
fn ni(n: Option<&NativeJsonNode>) -> Option<i64> {
    if let Some(NativeJsonNode::Number(x)) = n {
        let n = x.parse::<f64>().ok()?;
        if n.fract() != 0. || n.abs() > 9007199254740991. {
            None
        } else {
            Some(n as i64)
        }
    } else {
        None
    }
}
fn modifier(root: &NativeJsonNode) -> Option<i64> {
    ni(native(native(root, "nativeType")?, "modifier"))
}
fn bindings(p: &Value) -> Result<&[(Utf16, Value)], EngineError> {
    if let Some(Value::Object(b)) = get(p, "fields") {
        if !b.is_empty() {
            return Ok(b);
        }
    }
    Err(err(
        "POSTGRESQL_AVRO_POLICY",
        "Explicit field bindings are required",
    ))
}
fn policy(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let p = copy_json(v, ctx)?;
    let Value::Object(o) = &p else {
        return Err(err("POSTGRESQL_AVRO_POLICY", "Expected policy object"));
    };
    if o.iter().any(|(x, _)| {
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
                .any(|part| !ident(&Utf16::new(part.to_vec())))
        })
        || !matches!(
            st(get(&p, "lossPolicy")).as_deref(),
            Some("strict" | "allow-reported-loss")
        )
    {
        return Err(err(
            "POSTGRESQL_AVRO_POLICY",
            "Expected explicit Avro names and loss policy",
        ));
    }
    let Some(Value::Object(t)) = get(&p, "table") else {
        return Err(err("POSTGRESQL_AVRO_POLICY", "Qualified table required"));
    };
    if t.iter()
        .any(|(x, _)| !["schema", "name"].iter().any(|a| x == &k(a)))
        || s(get(&Value::Object(t.clone()), "schema")).is_none()
        || s(get(&Value::Object(t.clone()), "name")).is_none()
    {
        return Err(err("POSTGRESQL_AVRO_POLICY", "Qualified table required"));
    }
    let mut names = Vec::new();
    for (_, b) in bindings(&p)? {
        let Value::Object(f) = b else {
            return Err(err("POSTGRESQL_AVRO_POLICY", "Invalid binding"));
        };
        if f.iter()
            .any(|(x, _)| !["name", "representation"].iter().any(|a| x == &k(a)))
        {
            return Err(err("POSTGRESQL_AVRO_POLICY", "Unknown binding member"));
        }
        let n = s(get(b, "name"))
            .filter(|x| ident(x))
            .ok_or_else(|| err("POSTGRESQL_AVRO_POLICY", "Invalid Avro field"))?;
        let r = st(get(b, "representation"));
        if !matches!(
            r.as_deref(),
            Some("value" | "finite-decimal" | "avro-temporal" | "sql-text")
        ) || names.contains(n)
        {
            return Err(err(
                "POSTGRESQL_AVRO_POLICY",
                "Invalid or duplicate binding",
            ));
        }
        names.push(n.clone())
    }
    Ok(p)
}
fn native_diagnostic(d: &Value) -> Value {
    obj(vec![
        (
            "path",
            s(get(d, "path"))
                .cloned()
                .map(Value::String)
                .unwrap_or(Value::String(Utf16::default())),
        ),
        (
            "code",
            s(get(d, "code"))
                .cloned()
                .map(Value::String)
                .unwrap_or(Value::String(Utf16::default())),
        ),
        ("classification", strv("not-enforced")),
        (
            "detail",
            s(get(d, "message"))
                .cloned()
                .map(Value::String)
                .unwrap_or(Value::String(Utf16::default())),
        ),
        ("retainedInSource", Value::Bool(true)),
    ])
}
fn add(issues: &mut Vec<Value>, p: Utf16, c: &str, cl: &str, d: &str) {
    issues.push(issue(p, c, cl, d))
}
fn target_result(
    source: Value,
    policy: Value,
    issues: Vec<Value>,
    maps: Vec<Value>,
    target: Option<Value>,
    schema: Option<Utf16>,
    fatal: bool,
) -> Value {
    let blocked =
        fatal || st(get(&policy, "lossPolicy")).as_deref() == Some("strict") && !issues.is_empty();
    let mut o = vec![
        (
            k("status"),
            strv(if blocked { "blocked" } else { "projected" }),
        ),
        (k("source"), source),
        (k("policy"), policy),
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
    let inspection = postgresql_catalog::inspect_document(&source, ctx)?;
    if !matches!(get(&inspection, "valid"), Some(Value::Bool(true))) {
        return Err(err("POSTGRESQL_AVRO_SOURCE", "Invalid source capture"));
    }
    let mut issues = match get(&inspection, "diagnostics") {
        Some(Value::Array(d)) => d.iter().map(native_diagnostic).collect(),
        _ => Vec::new(),
    };
    let mut fatal = issues.iter().any(|d| {
        [
            "POSTGRESQL_CATALOG_VERSION",
            "POSTGRESQL_CATALOG_MODIFIED",
            "POSTGRESQL_CATALOG_REPRESENTATION",
        ]
        .iter()
        .any(|c| s(get(d, "code")) == Some(&k(c)))
    });
    if fatal {
        return Ok(target_result(source, p, issues, vec![], None, None, true));
    }
    let _ = postgresql_catalog::export_document(&source, ctx)?;
    let Some(Value::Object(t)) = get(&p, "table") else {
        unreachable!()
    };
    let schema = s(get(&Value::Object(t.clone()), "schema")).unwrap().clone();
    let relation = s(get(&Value::Object(t.clone()), "name")).unwrap().clone();
    let relation_value = postgresql_catalog::find_relation(&source, &schema, &relation, ctx)?;
    if matches!(relation_value, Value::Null) {
        add(
            &mut issues,
            k("/table"),
            "POSTGRESQL_AVRO_UNSUPPORTED",
            "unsupported",
            "Selected relation was not captured",
        );
        return Ok(target_result(source, p, issues, vec![], None, None, true));
    }
    let relation_tree = NativeJsonTree::from_tagged_value(&relation_value, ctx)?;
    if !matches!(native(relation_tree.root(),"kind"),Some(NativeJsonNode::String(v)) if v==&k("r")||v==&k("p"))
    {
        add(
            &mut issues,
            k("/table"),
            "POSTGRESQL_AVRO_UNSUPPORTED",
            "unsupported",
            "Expected an ordinary or partitioned table with captured columns",
        );
        return Ok(target_result(source, p, issues, vec![], None, None, true));
    }
    let capture = postgresql_catalog::catalog_from_document(&source, ctx)?;
    let all = capture.columns(ctx)?;
    let columns: Vec<PostgresqlColumnMetadata> = all
        .into_iter()
        .filter(|c| c.schema == schema && c.relation == relation)
        .collect();
    if columns.is_empty()
        || columns
            .iter()
            .any(|c| !["r", "p"].iter().any(|x| c.kind == k(x)))
    {
        add(
            &mut issues,
            k("/table"),
            "POSTGRESQL_AVRO_UNSUPPORTED",
            "unsupported",
            "Expected an ordinary or partitioned table with captured columns",
        );
        return Ok(target_result(source, p, issues, vec![], None, None, true));
    }
    add(&mut issues,Utf16::default(),"SCHEMA_ONLY","representation-change","Schema projection only; native row values need a separate encoder, including exact int64, decimal and epoch conversion");
    add(&mut issues,k("/table"),"DATABASE_SEMANTICS","not-enforced","Constraints, identity/default generation, indexes, partitioning, permissions, relationships and database behavior remain in the source; Avro does not execute them");
    let fields = bindings(&p)?;
    let mut seen = std::collections::BTreeSet::new();
    for c in &columns {
        let n = s(get(&c.element, "name")).unwrap();
        if !seen.insert(n.clone()) {
            add(
                &mut issues,
                k("/table"),
                "POSTGRESQL_AVRO_UNSUPPORTED",
                "unsupported",
                "Ambiguous duplicate native column names",
            );
            fatal = true
        }
        if !fields.iter().any(|(f, _)| f == n) {
            add(
                &mut issues,
                c.path.clone(),
                "COLUMN_OMITTED",
                "not-enforced",
                "Column deliberately omitted by the selected bindings",
            )
        }
    }
    let mut target_fields = Vec::new();
    let mut maps = Vec::new();
    for (col, b) in fields {
        let Some(c) = columns
            .iter()
            .find(|x| s(get(&x.element, "name")) == Some(col))
        else {
            add(
                &mut issues,
                ptr(&k("/fields"), col),
                "POSTGRESQL_AVRO_UNSUPPORTED",
                "unsupported",
                "Selected column does not exist",
            );
            fatal = true;
            continue;
        };
        let tree = NativeJsonTree::from_tagged_value(&c.native_column, ctx)?;
        let n = tree.root();
        let typ = native(
            native(n, "nativeType").unwrap_or(&NativeJsonNode::Null),
            "name",
        )
        .and_then(|x| nt(Some(x)))
        .and_then(|x| x.to_utf8().ok())
        .unwrap_or_default();
        let family = st(get(&c.element, "scalarType")).unwrap_or_default();
        let repr = st(get(b, "representation")).unwrap_or_default();
        let mut avro = None;
        let mut desc = s(get(&c.element, "description")).cloned();
        let notnull = matches!(native(n, "notNull"), Some(NativeJsonNode::Boolean(true)));
        if repr == "sql-text" {
            avro = Some(strv("string"));
            add(&mut issues,c.path.clone(),"SQL_TEXT_REPRESENTATION","representation-change","Explicit application text encoding requires native formatting/session choices; Avro string does not enforce native lexical or type semantics")
        } else if repr == "finite-decimal" && family == "decimal" {
            if let Some(m) = modifier(n).filter(|m| *m >= 4 && *m <= i32::MAX as i64) {
                let raw = m as i32 - 4;
                let precision = ((raw as u32 >> 16) & 65535) as i64;
                let signed = (raw & 2047) ^ 1024;
                let scale = (signed - 1024) as i64;
                let round = (((precision as i32) << 16) | ((scale as i32) & 2047)) as i64 + 4;
                if precision > 0
                    && precision <= 1000
                    && scale >= -1000
                    && scale <= 1000
                    && round == m
                {
                    avro = Some(obj(vec![
                        ("type", strv("bytes")),
                        ("logicalType", strv("decimal")),
                        (
                            "precision",
                            Value::Number(precision.max(scale).max(precision - scale) as f64),
                        ),
                        ("scale", Value::Number(scale.max(0) as f64)),
                    ]));
                    add(&mut issues,c.path.clone(),"DECIMAL_SPECIAL_VALUES","representation-change","Finite-decimal explicitly excludes native NaN; no instance filtering or coercion is performed");
                    add(
                        &mut issues,
                        c.path.clone(),
                        "DECIMAL_COERCION",
                        "not-enforced",
                        "Avro does not execute PostgreSQL numeric rounding or input coercion",
                    );
                    if scale < 0 || scale > precision {
                        add(&mut issues,c.path.clone(),"DECIMAL_DOMAIN_WIDENED","not-enforced","Avro precision/scale admits values outside native quantization or fractional range")
                    }
                } else {
                    fatal = true;
                    add(
                        &mut issues,
                        c.path.clone(),
                        "POSTGRESQL_AVRO_UNSUPPORTED",
                        "unsupported",
                        "Invalid native numeric typmod",
                    )
                }
            } else {
                fatal = true;
                add(
                    &mut issues,
                    c.path.clone(),
                    "POSTGRESQL_AVRO_UNSUPPORTED",
                    "unsupported",
                    "Finite decimal requires constrained native typmod",
                )
            }
        } else if repr == "avro-temporal"
            && ["date", "time", "timestamp"].contains(&family.as_str())
        {
            let precision = modifier(n);
            if typ == "timetz" {
                fatal = true;
                add(
                    &mut issues,
                    c.path.clone(),
                    "POSTGRESQL_AVRO_UNSUPPORTED",
                    "unsupported",
                    "Time with time zone needs offset-preserving representation; choose sql-text",
                )
            } else if family != "date" && precision.is_none_or(|p| p < -1 || p > 6) {
                fatal = true;
                add(
                    &mut issues,
                    c.path.clone(),
                    "POSTGRESQL_AVRO_UNSUPPORTED",
                    "unsupported",
                    "Invalid native temporal precision",
                )
            } else {
                avro = Some(obj(vec![
                    ("type", strv(if family == "date" { "int" } else { "long" })),
                    (
                        "logicalType",
                        strv(if family == "date" {
                            "date"
                        } else if typ == "time" {
                            "time-micros"
                        } else if typ == "timestamp" {
                            "local-timestamp-micros"
                        } else {
                            "timestamp-micros"
                        }),
                    ),
                ]));
                add(&mut issues,c.path.clone(),"TEMPORAL_DOMAIN","representation-change","Explicit temporal subset excludes native infinities and values outside target carrier/library ranges; epoch conversion and rejection require a separate encoder");
                add(&mut issues,c.path.clone(),"TEMPORAL_REFINEMENTS","not-enforced","Native precision, session timezone behavior and calendar range are not enforced by the target schema")
            }
        } else if repr == "value" {
            avro = match family.as_str() {
                "boolean" => Some(strv("boolean")),
                "integer" => Some(strv(if typ == "int8" { "long" } else { "int" })),
                "float" => {
                    add(&mut issues,c.path.clone(),"FLOAT_BEHAVIOR","not-enforced","Native NaN ordering and input overflow behavior are not Avro schema constraints");
                    Some(strv(if typ == "float4" { "float" } else { "double" }))
                }
                "string" => {
                    add(&mut issues,c.path.clone(),"TEXT_REFINEMENTS","not-enforced","Native length, collation, fixed-width padding and NUL exclusion are not enforced by Avro string");
                    Some(strv("string"))
                }
                "binary" => Some(strv("bytes")),
                _ => None,
            };
            if family == "integer" && typ == "int2" {
                add(
                    &mut issues,
                    c.path.clone(),
                    "INTEGER_RANGE",
                    "not-enforced",
                    "Avro int admits values outside smallint range",
                )
            };
            if avro.is_none() {
                fatal = true;
                add(&mut issues,c.path.clone(),"POSTGRESQL_AVRO_UNSUPPORTED","unsupported","No unrestricted value mapping; decimal/temporal require explicit subset bindings")
            }
        } else {
            fatal = true;
            add(
                &mut issues,
                c.path.clone(),
                "POSTGRESQL_AVRO_UNSUPPORTED",
                "unsupported",
                "Representation does not match the native type family",
            )
        }
        maps.push(obj(vec![
            ("sourcePath", Value::String(c.path.clone())),
            ("column", Value::String(col.clone())),
            ("field", Value::String(s(get(b, "name")).unwrap().clone())),
            ("representation", strv(&repr)),
        ]));
        if let Some(ty) = avro {
            let name = s(get(b, "name")).unwrap().clone();
            let ty = if !notnull {
                Value::Array(vec![strv("null"), ty])
            } else {
                ty
            };
            let mut f = vec![(k("name"), Value::String(name)), (k("type"), ty)];
            if let Some(d) = desc.take() {
                f.push((k("doc"), Value::String(d)))
            }
            target_fields.push(Value::Object(f))
        }
    }
    if fatal || st(get(&p, "lossPolicy")).as_deref() == Some("strict") && !issues.is_empty() {
        return Ok(target_result(source, p, issues, maps, None, None, fatal));
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
        ("fields", Value::Array(target_fields)),
    ]);
    let schema = write_json_value(&schema_value, Format::Json, ctx)?;
    let target = avro_document::import_schema(s(get(&p, "id")).unwrap(), schema.units(), &[], ctx)?;
    Ok(target_result(
        source,
        p,
        issues,
        maps,
        Some(target),
        Some(schema),
        false,
    ))
}
pub fn project_postgresql_to_avro(
    source: &Value,
    policy: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    project(source, policy, ctx)
}

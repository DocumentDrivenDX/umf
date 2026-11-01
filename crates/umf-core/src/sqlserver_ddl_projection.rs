// SPDX-License-Identifier: MIT OR Apache-2.0
//! Reviewable lowering of a captured SQL Server catalog to ordinary DDL.
use crate::sqlserver_adapter;
use crate::{
    context::Context,
    error::EngineError,
    serialization::{read_json_value, Format},
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
fn text(v: Option<&Value>) -> Option<String> {
    s(v).and_then(|x| x.to_utf8().ok())
}
fn a(v: Option<&Value>) -> Option<&[Value]> {
    if let Some(Value::Array(x)) = v {
        Some(x)
    } else {
        None
    }
}
fn b(v: Option<&Value>) -> Option<bool> {
    if let Some(Value::Bool(x)) = v {
        Some(*x)
    } else {
        None
    }
}
fn n(v: Option<&Value>) -> Option<i64> {
    if let Some(Value::Number(x)) = v {
        if x.is_finite() && x.fract() == 0. && x.abs() <= 9007199254740991. {
            Some(*x as i64)
        } else {
            None
        }
    } else {
        None
    }
}
fn err(c: &str, m: &str) -> EngineError {
    EngineError::new(c, Utf16::default(), m)
}
fn obj(f: Vec<(&str, Value)>) -> Value {
    Value::Object(f.into_iter().map(|(n, v)| (k(n), v)).collect())
}
fn sv(v: Utf16) -> Value {
    Value::String(v)
}
fn ascii(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn cat(parts: &[&Utf16]) -> Utf16 {
    Utf16::new(
        parts
            .iter()
            .flat_map(|p| p.units().iter().copied())
            .collect(),
    )
}
fn ptr(path: &Utf16, name: &Utf16) -> Utf16 {
    let mut out = path.units().to_vec();
    out.push(47);
    for u in name.units() {
        match *u {
            126 => out.extend([126, 48]),
            47 => out.extend([126, 49]),
            x => out.push(x),
        }
    }
    Utf16::new(out)
}
fn suffix(path: &Utf16, s: &str) -> Utf16 {
    cat(&[path, &ascii(s)])
}
fn quoted(v: &Utf16) -> Result<Utf16, EngineError> {
    if v.is_empty() || v.len() > 128 || v.units().contains(&0) {
        return Err(err(
            "SQLSERVER_DDL_IDENTIFIER",
            "Expected a nonempty SQL Server identifier of at most 128 UTF-16 units",
        ));
    }
    let mut out = vec![91];
    for u in v.units() {
        out.push(*u);
        if *u == 93 {
            out.push(93)
        }
    }
    out.push(93);
    Ok(Utf16::new(out))
}
fn literal(v: &Utf16) -> Utf16 {
    let mut out = vec![b'N' as u16, b'\'' as u16];
    for u in v.units() {
        out.push(*u);
        if *u == 39 {
            out.push(39)
        }
    }
    out.push(39);
    Utf16::new(out)
}
fn issue(path: Utf16, code: &str, detail: &str, classification: &str) -> Value {
    obj(vec![
        ("path", sv(path)),
        ("code", Value::string_utf8(code)),
        ("classification", Value::string_utf8(classification)),
        ("detail", Value::string_utf8(detail)),
        ("retainedInSource", Value::Bool(true)),
    ])
}
#[derive(Clone)]
struct Statement {
    path: Utf16,
    kind: &'static str,
    sql: Utf16,
}
fn statement(path: Utf16, kind: &'static str, sql: Utf16) -> Statement {
    Statement { path, kind, sql }
}
fn sv_statement(x: Statement) -> Value {
    obj(vec![
        ("sourcePath", sv(x.path)),
        ("kind", Value::string_utf8(x.kind)),
        ("sql", sv(x.sql)),
    ])
}
fn known(v: &Value, keys: &[&str], path: &Utf16, issues: &mut Vec<Value>) {
    if let Value::Object(fields) = v {
        for (name, _) in fields {
            if !keys.iter().any(|known| name == &k(known)) {
                issues.push(issue(
                    ptr(path, name),
                    "UNKNOWN_NATIVE_METADATA",
                    "Uninterpreted native metadata remains in source",
                    "not-enforced",
                ))
            }
        }
    }
}
fn column_name(
    columns: &[Value],
    column_id: Option<i64>,
    name: Option<&Utf16>,
    path: &Utf16,
    issues: &mut Vec<Value>,
    fatal: &mut bool,
) -> Result<Utf16, EngineError> {
    if let (Some(column_id), Some(name)) = (column_id, name) {
        if columns.iter().any(|column| {
            n(get(column, "column_id")) == Some(column_id) && s(get(column, "name")) == Some(name)
        }) {
            return quoted(name);
        }
    }
    *fatal = true;
    issues.push(issue(
        path.clone(),
        "SQLSERVER_DDL_UNSUPPORTED",
        "Column name/ID does not resolve in the table",
        "unsupported",
    ));
    Ok(ascii("[unresolved]"))
}
fn qtable(schema: &Utf16, name: &Utf16) -> Result<Utf16, EngineError> {
    Ok(cat(&[&quoted(schema)?, &ascii("."), &quoted(name)?]))
}
fn type_name(system: i64) -> Option<&'static str> {
    Some(match system {
        104 => "bit",
        48 => "tinyint",
        52 => "smallint",
        56 => "int",
        127 => "bigint",
        106 => "decimal",
        108 => "numeric",
        60 => "money",
        122 => "smallmoney",
        59 => "real",
        62 => "float",
        167 => "varchar",
        175 => "char",
        231 => "nvarchar",
        239 => "nchar",
        35 => "text",
        99 => "ntext",
        165 => "varbinary",
        173 => "binary",
        34 => "image",
        189 => "timestamp",
        40 => "date",
        41 => "time",
        42 => "datetime2",
        43 => "datetimeoffset",
        58 => "smalldatetime",
        61 => "datetime",
        36 => "uniqueidentifier",
        98 => "sql_variant",
        241 => "xml",
        _ => return None,
    })
}
fn decimal(x: i64) -> Utf16 {
    ascii(&x.to_string())
}
fn projection(source: &Value, input: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let source = copy_json(source, ctx)?;
    let policy = copy_json(input, ctx)?;
    let allowed = [
        "aliases",
        "physicalLayout",
        "nativeExpressions",
        "sourceState",
        "lossPolicy",
    ];
    let Value::Object(fields) = &policy else {
        return Err(err(
            "SQLSERVER_DDL_POLICY",
            "Explicit alias, layout, expression, source-state and loss policies required",
        ));
    };
    if fields
        .iter()
        .any(|(name, _)| !allowed.iter().any(|x| name == &k(x)))
        || !matches!(
            text(get(&policy, "aliases")).as_deref(),
            Some("reject" | "base-type")
        )
        || !matches!(
            text(get(&policy, "physicalLayout")).as_deref(),
            Some("default-rowstore")
        )
        || !matches!(
            text(get(&policy, "nativeExpressions")).as_deref(),
            Some("verbatim")
        )
        || !matches!(
            text(get(&policy, "sourceState")).as_deref(),
            Some("captured-only" | "allow-candidate")
        )
        || !matches!(
            text(get(&policy, "lossPolicy")).as_deref(),
            Some("strict" | "allow-reported-loss")
        )
    {
        return Err(err(
            "SQLSERVER_DDL_POLICY",
            "Explicit alias, layout, expression, source-state and loss policies required",
        ));
    }
    let inspected = sqlserver_adapter::inspect_document(&source, ctx)?;
    if !matches!(get(&inspected, "valid"), Some(Value::Bool(true))) {
        return Err(err("SQLSERVER_DDL_SOURCE", "Invalid source capture"));
    }
    let mut issues = Vec::new();
    let mut fatal = false;
    let mut regular = Vec::new();
    let mut deferred = Vec::new();
    for d in a(get(&inspected, "diagnostics")).unwrap_or(&[]) {
        let path = s(get(d, "path")).cloned().unwrap_or_default();
        let code = text(get(d, "code")).unwrap_or_default();
        let message = text(get(d, "message")).unwrap_or_default();
        issues.push(issue(path, &code, &message, "not-enforced"));
        if code == "SQLSERVER_VERSION"
            || code == "SQLSERVER_ENCODING"
            || (code == "SQLSERVER_MODIFIED"
                && text(get(&policy, "sourceState")).as_deref() == Some("captured-only"))
        {
            fatal = true
        }
    }
    let base_result =
        |status: &str, issues: Vec<Value>, statements: Vec<Value>, native: Option<Utf16>| {
            let mut out = vec![
                (k("status"), Value::string_utf8(status)),
                (k("source"), source.clone()),
                (k("policy"), policy.clone()),
                (k("issues"), Value::Array(issues)),
                (k("statements"), Value::Array(statements)),
            ];
            if let Some(native) = native {
                out.push((k("nativeSource"), sv(native)))
            }
            Value::Object(out)
        };
    if fatal {
        return Ok(base_result("blocked", issues, vec![], None));
    }
    let exported = sqlserver_adapter::export_document(&source, ctx)?;
    let native = read_json_value(exported.units(), Format::Json, ctx)?;
    issues.push(issue(Utf16::default(),"CAPTURE_LOWERING","Captured observations do not describe all server semantics: security, triggers, temporal/memory-optimized/storage features, column persistence/sparse/encryption/replication flags, bound objects and dependencies are not reconstructed. Target is new ordinary tables on default storage.","not-enforced"));
    issues.push(issue(Utf16::default(),"NATIVE_EXPRESSIONS","Default, computed, check and filter expressions are copied verbatim for review; their dependencies, session environment and execution safety are not established. This API does not execute SQL.","representation-change"));
    known(
        &native,
        &["profile", "state", "serverVersion", "query", "tables"],
        &Utf16::default(),
        &mut issues,
    );
    let tables = a(get(&native, "tables"))
        .ok_or_else(|| err("SQLSERVER_DDL_SOURCE", "Expected table array"))?;
    for (ti, t) in tables.iter().enumerate() {
        let path = ascii(&format!("/tables/{ti}"));
        let schema =
            s(get(t, "schema")).ok_or_else(|| err("SQLSERVER_DDL_SOURCE", "Missing schema"))?;
        let name =
            s(get(t, "name")).ok_or_else(|| err("SQLSERVER_DDL_SOURCE", "Missing table name"))?;
        let table = qtable(schema, name)?;
        if !tables[..ti]
            .iter()
            .any(|prev| s(get(prev, "schema")) == Some(schema))
        {
            let sql = cat(&[
                &ascii("IF SCHEMA_ID("),
                &literal(schema),
                &ascii(") IS NULL EXEC("),
                &literal(&cat(&[&ascii("CREATE SCHEMA "), &quoted(schema)?])),
                &ascii(");"),
            ]);
            regular.push(statement(path.clone(), "schema", sql));
        }
        known(
            t,
            &[
                "schema",
                "name",
                "columns",
                "keys",
                "checks",
                "foreign_keys",
                "indexes",
            ],
            &path,
            &mut issues,
        );
        let cols =
            a(get(t, "columns")).ok_or_else(|| err("SQLSERVER_DDL_SOURCE", "Missing columns"))?;
        let mut definitions = Vec::new();
        for (ci, c) in cols.iter().enumerate() {
            let cp = suffix(&path, &format!("/columns/{ci}"));
            known(
                c,
                &[
                    "name",
                    "column_id",
                    "system_type_id",
                    "user_type_id",
                    "type_schema",
                    "type_name",
                    "base_type_name",
                    "is_user_defined",
                    "is_assembly_type",
                    "max_length",
                    "precision",
                    "scale",
                    "is_nullable",
                    "is_identity",
                    "is_computed",
                    "collation_name",
                    "default_definition",
                    "computed_definition",
                    "identity_seed",
                    "identity_increment",
                    "description",
                ],
                &cp,
                &mut issues,
            );
            let cname = s(get(c, "name"))
                .ok_or_else(|| err("SQLSERVER_DDL_SOURCE", "Missing column name"))?;
            if b(get(c, "is_computed")) == Some(true) {
                let Some(expr) = s(get(c, "computed_definition")).filter(|value| !value.is_empty())
                else {
                    fatal = true;
                    issues.push(issue(
                        cp.clone(),
                        "SQLSERVER_DDL_UNSUPPORTED",
                        "Computed definition unavailable",
                        "unsupported",
                    ));
                    continue;
                };
                definitions.push(cat(&[&quoted(cname)?, &ascii(" AS "), expr]));
                issues.push(issue(cp,"COMPUTED_PERSISTENCE_UNAVAILABLE","Computed persistence, dependency definitions and SET environment were not captured; emitted as non-persisted","not-enforced"));
                continue;
            }
            let sys = n(get(c, "system_type_id")).unwrap_or(-1);
            let base = text(get(c, "base_type_name")).unwrap_or_default();
            let tname = text(get(c, "type_name")).unwrap_or_default();
            let tschema = text(get(c, "type_schema")).unwrap_or_default();
            if b(get(c, "is_assembly_type")) == Some(true) || type_name(sys) != Some(base.as_str())
            {
                fatal = true;
                issues.push(issue(
                    cp.clone(),
                    "SQLSERVER_DDL_UNSUPPORTED",
                    "Unknown/CLR native type identity",
                    "unsupported",
                ));
                continue;
            }
            if b(get(c, "is_user_defined")) == Some(true) || tname != base || tschema != "sys" {
                if text(get(&policy, "aliases")).as_deref() == Some("reject") {
                    fatal = true;
                    issues.push(issue(
                        cp.clone(),
                        "SQLSERVER_DDL_UNSUPPORTED",
                        "Alias type declarations are not present in this capture",
                        "unsupported",
                    ));
                    continue;
                }
                issues.push(issue(cp.clone(),"ALIAS_TO_BASE_TYPE","Explicit policy replaces the declared alias with its captured base type; alias identity, bound rules/defaults remain source-owned","representation-change"));
            }
            let mut ty = ascii(type_name(sys).unwrap());
            let width = n(get(c, "max_length"));
            let precision = n(get(c, "precision"));
            let scale = n(get(c, "scale"));
            let base_type = type_name(sys).unwrap();
            if [
                "varchar",
                "nvarchar",
                "char",
                "nchar",
                "binary",
                "varbinary",
            ]
            .contains(&base_type)
            {
                let max =
                    width == Some(-1) && ["varchar", "nvarchar", "varbinary"].contains(&base_type);
                let divisor = if base_type.starts_with('n') { 2 } else { 1 };
                let length = width.map(|x| x / divisor);
                if !max
                    && length.is_none_or(|x| {
                        width.unwrap_or(0) % divisor != 0
                            || x < 1
                            || x > if divisor == 2 { 4000 } else { 8000 }
                    })
                {
                    fatal = true;
                    issues.push(issue(
                        cp.clone(),
                        "SQLSERVER_DDL_UNSUPPORTED",
                        "Invalid native byte length",
                        "unsupported",
                    ));
                    continue;
                }
                let width_token = if max {
                    ascii("max")
                } else {
                    decimal(length.unwrap())
                };
                ty = cat(&[&ty, &ascii("("), &width_token, &ascii(")")]);
            } else if ["decimal", "numeric"].contains(&base_type) {
                if precision.is_none_or(|x| x < 1 || x > 38)
                    || scale.is_none_or(|x| x < 0 || x > precision.unwrap_or(-1))
                {
                    fatal = true;
                    issues.push(issue(
                        cp.clone(),
                        "SQLSERVER_DDL_UNSUPPORTED",
                        "Invalid decimal precision/scale",
                        "unsupported",
                    ));
                    continue;
                }
                ty = cat(&[
                    &ty,
                    &ascii("("),
                    &decimal(precision.unwrap()),
                    &ascii(","),
                    &decimal(scale.unwrap()),
                    &ascii(")"),
                ]);
            } else if ["time", "datetime2", "datetimeoffset"].contains(&base_type) {
                if scale.is_none_or(|x| x > 7) {
                    fatal = true;
                    issues.push(issue(
                        cp.clone(),
                        "SQLSERVER_DDL_UNSUPPORTED",
                        "Invalid temporal scale",
                        "unsupported",
                    ));
                    continue;
                }
                ty = cat(&[&ty, &ascii("("), &decimal(scale.unwrap()), &ascii(")")]);
            } else if base_type == "float" {
                if precision.is_none_or(|x| x < 1 || x > 53) {
                    fatal = true;
                    issues.push(issue(
                        cp.clone(),
                        "SQLSERVER_DDL_UNSUPPORTED",
                        "Invalid float precision",
                        "unsupported",
                    ));
                    continue;
                }
                ty = cat(&[&ty, &ascii("("), &decimal(precision.unwrap()), &ascii(")")]);
            } else if base_type == "xml" {
                issues.push(issue(cp.clone(),"XML_COLLECTION_UNAVAILABLE","Typed XML schema collection/document constraints are not captured; emitted untyped XML","not-enforced"));
            }
            let mut def = cat(&[&quoted(cname)?, &ascii(" "), &ty]);
            if !matches!(get(c, "collation_name"), Some(Value::Null)) {
                let Some(collation) = s(get(c, "collation_name")) else {
                    fatal = true;
                    issues.push(issue(
                        cp.clone(),
                        "SQLSERVER_DDL_UNSUPPORTED",
                        "Unsupported collation token",
                        "unsupported",
                    ));
                    continue;
                };
                let ascii_alpha =
                    |unit: u16| (65..=90).contains(&unit) || (97..=122).contains(&unit);
                let ascii_alphanumeric = |unit: u16| ascii_alpha(unit) || (48..=57).contains(&unit);
                let ok = !collation.units().is_empty()
                    && ascii_alpha(collation.units()[0])
                    && collation.units()[1..]
                        .iter()
                        .all(|x| ascii_alphanumeric(*x) || *x == 95);
                if !ok {
                    fatal = true;
                    issues.push(issue(
                        cp.clone(),
                        "SQLSERVER_DDL_UNSUPPORTED",
                        "Unsupported collation token",
                        "unsupported",
                    ));
                    continue;
                }
                def = cat(&[&def, &ascii(" COLLATE "), collation]);
            }
            if b(get(c, "is_identity")) == Some(true) {
                let seed = s(get(c, "identity_seed"));
                let inc = s(get(c, "identity_increment"));
                if seed.is_none_or(|v| !integer_lexical(v))
                    || inc.is_none_or(|v| !integer_lexical(v))
                {
                    fatal = true;
                    issues.push(issue(
                        cp.clone(),
                        "SQLSERVER_DDL_UNSUPPORTED",
                        "Exact integer identity seed/increment required",
                        "unsupported",
                    ));
                    continue;
                }
                def = cat(&[
                    &def,
                    &ascii(" IDENTITY("),
                    seed.unwrap(),
                    &ascii(","),
                    inc.unwrap(),
                    &ascii(")"),
                ]);
                issues.push(issue(cp.clone(),"IDENTITY_STATE_UNAVAILABLE","Identity seed/increment retained; current counter and replication flag are not captured","not-enforced"));
            }
            def = cat(&[
                &def,
                &ascii(if b(get(c, "is_nullable")) == Some(true) {
                    " NULL"
                } else {
                    " NOT NULL"
                }),
            ]);
            if !matches!(get(c, "default_definition"), Some(Value::Null)) {
                if let Some(d) = s(get(c, "default_definition")) {
                    def = cat(&[&def, &ascii(" DEFAULT "), d]);
                }
                issues.push(issue(cp.clone(),"DEFAULT_IDENTITY_UNAVAILABLE","Default expression retained; constraint name or bound-default identity is not captured","not-enforced"));
            }
            definitions.push(def);
        }
        if definitions.is_empty() {
            fatal = true;
            issues.push(issue(
                path.clone(),
                "SQLSERVER_DDL_UNSUPPORTED",
                "Cannot emit an empty table",
                "unsupported",
            ));
        }
        let mut body = Vec::new();
        for def in definitions {
            body.push(def)
        }
        let joined = join(&body, &ascii(",\n  "));
        let sql = cat(&[
            &ascii("CREATE TABLE "),
            &table,
            &ascii(" (\n  "),
            &joined,
            &ascii("\n);"),
        ]);
        regular.push(statement(path.clone(), "table", sql));
        for (ci, c) in cols.iter().enumerate() {
            if let Some(description) = s(get(c, "description")) {
                let cn = s(get(c, "name")).unwrap();
                let sql = cat(&[
                    &ascii("EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value="),
                    &literal(description),
                    &ascii(", @level0type=N'SCHEMA', @level0name="),
                    &literal(schema),
                    &ascii(", @level1type=N'TABLE', @level1name="),
                    &literal(name),
                    &ascii(", @level2type=N'COLUMN', @level2name="),
                    &literal(cn),
                    &ascii(";"),
                ]);
                regular.push(statement(
                    suffix(&path, &format!("/columns/{ci}/description")),
                    "description",
                    sql,
                ));
            }
        }
        for section in ["keys", "checks", "foreign_keys", "indexes"] {
            if get(t, section).is_none() {
                issues.push(issue(
                    suffix(&path, &format!("/{section}")),
                    "CATALOG_SECTION_UNAVAILABLE",
                    &format!(
                        "Section not captured; generated SQL cannot assert absence of {section}"
                    ),
                    "not-enforced",
                ));
            }
        }
    }
    // All tables are emitted first; relational objects follow so cyclic
    // references can be recreated without reordering their source identities.
    for (ti, t) in tables.iter().enumerate() {
        let path = ascii(&format!("/tables/{ti}"));
        let schema =
            s(get(t, "schema")).ok_or_else(|| err("SQLSERVER_DDL_SOURCE", "Missing schema"))?;
        let name =
            s(get(t, "name")).ok_or_else(|| err("SQLSERVER_DDL_SOURCE", "Missing table name"))?;
        let table = qtable(schema, name)?;
        let cols = a(get(t, "columns")).unwrap_or(&[]);
        for (ki, keyrow) in a(get(t, "keys")).unwrap_or(&[]).iter().enumerate() {
            let kp = suffix(&path, &format!("/keys/{ki}"));
            known(
                keyrow,
                &[
                    "name",
                    "kind",
                    "is_system_named",
                    "index_type",
                    "is_disabled",
                    "ignore_dup_key",
                    "columns",
                ],
                &kp,
                &mut issues,
            );
            let kind = text(get(keyrow, "kind")).unwrap_or_default();
            let index_type = text(get(keyrow, "index_type")).unwrap_or_default();
            if !["PK", "UQ"].contains(&kind.as_str())
                || !["CLUSTERED", "NONCLUSTERED"].contains(&index_type.as_str())
                || b(get(keyrow, "is_disabled")) == Some(true)
            {
                fatal = true;
                issues.push(issue(
                    kp.clone(),
                    "SQLSERVER_DDL_UNSUPPORTED",
                    "Unsupported key kind, index type or disabled key dependency",
                    "unsupported",
                ));
                continue;
            }
            let key_name = s(get(keyrow, "name"))
                .ok_or_else(|| err("SQLSERVER_DDL_SOURCE", "Missing key name"))?;
            if b(get(keyrow, "is_system_named")) == Some(true) {
                issues.push(issue(
                    kp.clone(),
                    "SYSTEM_NAME_BECOMES_EXPLICIT",
                    "Constraint name retained as explicit, not system-generated",
                    "representation-change",
                ));
            }
            let keycols = a(get(keyrow, "columns"))
                .ok_or_else(|| err("SQLSERVER_DDL_SOURCE", "Missing key columns"))?;
            let mut ordered: Vec<_> = keycols.iter().collect();
            ordered.sort_by_key(|c| n(get(c, "key_ordinal")).unwrap_or(i64::MIN));
            if ordered.is_empty()
                || ordered
                    .iter()
                    .enumerate()
                    .any(|(i, c)| n(get(c, "key_ordinal")) != Some(i as i64 + 1))
            {
                fatal = true;
                issues.push(issue(
                    kp.clone(),
                    "SQLSERVER_DDL_UNSUPPORTED",
                    "Missing or noncontiguous positive column ordinals",
                    "unsupported",
                ));
            }
            let mut names = Vec::new();
            for col in ordered {
                let cp = suffix(
                    &kp,
                    &format!(
                        "/columns/{}",
                        keycols
                            .iter()
                            .position(|x| std::ptr::eq(x, col))
                            .unwrap_or(0)
                    ),
                );
                known(
                    col,
                    &["key_ordinal", "column_id", "name", "is_descending_key"],
                    &cp,
                    &mut issues,
                );
                let value = column_name(
                    cols,
                    n(get(col, "column_id")),
                    s(get(col, "name")),
                    &kp,
                    &mut issues,
                    &mut fatal,
                )?;
                names.push(cat(&[
                    &value,
                    &ascii(if b(get(col, "is_descending_key")) == Some(true) {
                        " DESC"
                    } else {
                        " ASC"
                    }),
                ]));
            }
            let cols_sql = join(&names, &ascii(", "));
            let key_sql = cat(&[
                &ascii("ALTER TABLE "),
                &table,
                &ascii(" ADD CONSTRAINT "),
                &quoted(key_name)?,
                &ascii(if kind == "PK" {
                    " PRIMARY KEY "
                } else {
                    " UNIQUE "
                }),
                &ascii(&index_type),
                &ascii(" ("),
                &cols_sql,
                &ascii(") WITH (IGNORE_DUP_KEY="),
                &ascii(if b(get(keyrow, "ignore_dup_key")) == Some(true) {
                    "ON"
                } else {
                    "OFF"
                }),
                &ascii(");"),
            ]);
            regular.push(statement(kp, "key", key_sql));
        }
        for (ii, index) in a(get(t, "indexes")).unwrap_or(&[]).iter().enumerate() {
            let ip = suffix(&path, &format!("/indexes/{ii}"));
            known(
                index,
                &[
                    "index_id",
                    "name",
                    "type",
                    "type_desc",
                    "is_unique",
                    "is_primary_key",
                    "is_unique_constraint",
                    "is_disabled",
                    "is_hypothetical",
                    "ignore_dup_key",
                    "fill_factor",
                    "is_padded",
                    "allow_row_locks",
                    "allow_page_locks",
                    "has_filter",
                    "filter_definition",
                    "compression_delay",
                    "optimize_for_sequential_key",
                    "data_space_id",
                    "data_space_name",
                    "data_space_type",
                    "columns",
                ],
                &ip,
                &mut issues,
            );
            let indexcols = a(get(index, "columns")).unwrap_or(&[]);
            for (ci, col) in indexcols.iter().enumerate() {
                known(
                    col,
                    &[
                        "index_column_id",
                        "column_id",
                        "name",
                        "key_ordinal",
                        "partition_ordinal",
                        "is_descending_key",
                        "is_included_column",
                        "column_store_order_ordinal",
                    ],
                    &suffix(&ip, &format!("/columns/{ci}")),
                    &mut issues,
                )
            }
            let index_type = n(get(index, "type")).unwrap_or(-1);
            let type_desc = text(get(index, "type_desc")).unwrap_or_default();
            if text(get(index, "data_space_type")).as_deref() == Some("PARTITION_SCHEME")
                || indexcols
                    .iter()
                    .any(|c| n(get(c, "partition_ordinal")).is_some_and(|x| x > 0))
            {
                issues.push(issue(ip.clone(),"PARTITION_LAYOUT_LOWERED","Partition scheme/function/boundaries not reconstructed; emitted on default storage","representation-change"));
            }
            issues.push(issue(ip.clone(),"INDEX_PHYSICAL_DETAILS","Data-space placement, index IDs, compression/rowgroup/storage details and omitted physical options are not reconstructed","not-enforced"));
            let is_constraint = b(get(index, "is_primary_key")) == Some(true)
                || b(get(index, "is_unique_constraint")) == Some(true);
            if is_constraint {
                if !a(get(t, "keys"))
                    .unwrap_or(&[])
                    .iter()
                    .any(|x| get(x, "name") == get(index, "name"))
                {
                    fatal = true;
                    issues.push(issue(
                        ip,
                        "SQLSERVER_DDL_UNSUPPORTED",
                        "Constraint-owned index has no captured key",
                        "unsupported",
                    ));
                }
                continue;
            }
            if index_type == 0 {
                continue;
            }
            if b(get(index, "is_hypothetical")) == Some(true) || [5, 6].contains(&index_type) {
                issues.push(issue(ip,"INDEX_LAYOUT_OMITTED","Explicit default-rowstore policy omits hypothetical/columnstore access structures","representation-change"));
                continue;
            }
            if ![1, 2].contains(&index_type)
                || type_desc
                    != if index_type == 1 {
                        "CLUSTERED"
                    } else {
                        "NONCLUSTERED"
                    }
            {
                fatal = true;
                issues.push(issue(
                    ip.clone(),
                    "SQLSERVER_DDL_UNSUPPORTED",
                    "Specialized or unknown index type cannot be reconstructed",
                    "unsupported",
                ));
                continue;
            }
            if b(get(index, "has_filter")) == Some(true)
                && matches!(get(index, "filter_definition"), Some(Value::Null) | None)
            {
                fatal = true;
                issues.push(issue(
                    ip.clone(),
                    "SQLSERVER_DDL_UNSUPPORTED",
                    "Filtered predicate unavailable",
                    "unsupported",
                ));
                continue;
            }
            let keycols: Vec<_> = indexcols
                .iter()
                .filter(|c| n(get(c, "key_ordinal")).is_some_and(|x| x > 0))
                .collect();
            let mut ordered = keycols.clone();
            ordered.sort_by_key(|c| n(get(c, "key_ordinal")).unwrap_or(i64::MIN));
            if ordered.is_empty()
                || ordered
                    .iter()
                    .enumerate()
                    .any(|(i, c)| n(get(c, "key_ordinal")) != Some(i as i64 + 1))
            {
                fatal = true;
                issues.push(issue(
                    ip.clone(),
                    "SQLSERVER_DDL_UNSUPPORTED",
                    "Missing or noncontiguous positive key ordinals",
                    "unsupported",
                ));
            }
            let mut keys = Vec::new();
            for c in ordered {
                let v = column_name(
                    cols,
                    n(get(c, "column_id")),
                    s(get(c, "name")),
                    &ip,
                    &mut issues,
                    &mut fatal,
                )?;
                keys.push(cat(&[
                    &v,
                    &ascii(if b(get(c, "is_descending_key")) == Some(true) {
                        " DESC"
                    } else {
                        " ASC"
                    }),
                ]));
            }
            let mut included = Vec::new();
            for c in indexcols
                .iter()
                .filter(|c| b(get(c, "is_included_column")) == Some(true))
            {
                included.push(column_name(
                    cols,
                    n(get(c, "column_id")),
                    s(get(c, "name")),
                    &ip,
                    &mut issues,
                    &mut fatal,
                )?)
            }
            let fill = n(get(index, "fill_factor")).unwrap_or(0);
            if fill == 0 {
                issues.push(issue(ip.clone(),"FILLFACTOR_DEFAULT","Native zero denotes the default; omit the DDL option and use the target server default","not-enforced"));
            }
            let mut opts = vec![cat(&[
                &ascii("IGNORE_DUP_KEY="),
                &ascii(if b(get(index, "ignore_dup_key")) == Some(true) {
                    "ON"
                } else {
                    "OFF"
                }),
            ])];
            if fill > 0 {
                opts.push(cat(&[&ascii("FILLFACTOR="), &decimal(fill)]));
            }
            for (keyname, field) in [
                ("PAD_INDEX", "is_padded"),
                ("ALLOW_ROW_LOCKS", "allow_row_locks"),
                ("ALLOW_PAGE_LOCKS", "allow_page_locks"),
                ("OPTIMIZE_FOR_SEQUENTIAL_KEY", "optimize_for_sequential_key"),
            ] {
                opts.push(cat(&[
                    &ascii(keyname),
                    &ascii("="),
                    &ascii(if b(get(index, field)) == Some(true) {
                        "ON"
                    } else {
                        "OFF"
                    }),
                ]));
            }
            let mut sql = cat(&[
                &ascii("CREATE "),
                &ascii(if b(get(index, "is_unique")) == Some(true) {
                    "UNIQUE "
                } else {
                    ""
                }),
                &ascii(&type_desc),
                &ascii(" INDEX "),
                &quoted(
                    s(get(index, "name"))
                        .ok_or_else(|| err("SQLSERVER_DDL_SOURCE", "Missing index name"))?,
                )?,
                &ascii(" ON "),
                &table,
                &ascii(" ("),
                &join(&keys, &ascii(", ")),
                &ascii(")"),
            ]);
            if !included.is_empty() {
                sql = cat(&[
                    &sql,
                    &ascii(" INCLUDE ("),
                    &join(&included, &ascii(", ")),
                    &ascii(")"),
                ]);
            }
            if b(get(index, "has_filter")) == Some(true) {
                sql = cat(&[
                    &sql,
                    &ascii(" WHERE "),
                    s(get(index, "filter_definition"))
                        .ok_or_else(|| err("SQLSERVER_DDL_SOURCE", "Missing index filter"))?,
                ]);
            }
            sql = cat(&[
                &sql,
                &ascii(" WITH ("),
                &join(&opts, &ascii(", ")),
                &ascii(");"),
            ]);
            regular.push(statement(ip.clone(), "index", sql));
            if b(get(index, "is_disabled")) == Some(true) {
                if index_type == 1 {
                    fatal = true;
                    issues.push(issue(ip,"SQLSERVER_DDL_UNSUPPORTED","Disabled clustered index affects table accessibility and dependent indexes","unsupported"));
                    continue;
                }
                deferred.push(statement(
                    ip.clone(),
                    "disable",
                    cat(&[
                        &ascii("ALTER INDEX "),
                        &quoted(s(get(index, "name")).unwrap())?,
                        &ascii(" ON "),
                        &table,
                        &ascii(" DISABLE;"),
                    ]),
                ));
            }
        }
        for (ci, check) in a(get(t, "checks")).unwrap_or(&[]).iter().enumerate() {
            let cp = suffix(&path, &format!("/checks/{ci}"));
            known(
                check,
                &[
                    "name",
                    "is_system_named",
                    "parent_column_id",
                    "definition",
                    "is_disabled",
                    "is_not_trusted",
                    "is_not_for_replication",
                    "uses_database_collation",
                ],
                &cp,
                &mut issues,
            );
            let Some(expr) = s(get(check, "definition")) else {
                fatal = true;
                issues.push(issue(
                    cp,
                    "SQLSERVER_DDL_UNSUPPORTED",
                    "Check definition unavailable",
                    "unsupported",
                ));
                continue;
            };
            if b(get(check, "is_system_named")) == Some(true) {
                issues.push(issue(
                    cp.clone(),
                    "SYSTEM_NAME_BECOMES_EXPLICIT",
                    "Check name retained as explicit, not system-generated",
                    "representation-change",
                ));
            }
            if n(get(check, "parent_column_id")).is_some_and(|x| x != 0) {
                issues.push(issue(
                    cp.clone(),
                    "CHECK_SCOPE_LOWERED",
                    "Column-scoped check emitted as table-scoped check",
                    "representation-change",
                ));
            }
            let sql = cat(&[
                &ascii("ALTER TABLE "),
                &table,
                &ascii(if b(get(check, "is_not_trusted")) == Some(true) {
                    " WITH NOCHECK ADD CONSTRAINT "
                } else {
                    " WITH CHECK ADD CONSTRAINT "
                }),
                &quoted(
                    s(get(check, "name"))
                        .ok_or_else(|| err("SQLSERVER_DDL_SOURCE", "Missing check name"))?,
                )?,
                &ascii(" CHECK "),
                &ascii(if b(get(check, "is_not_for_replication")) == Some(true) {
                    "NOT FOR REPLICATION "
                } else {
                    ""
                }),
                &ascii("("),
                expr,
                &ascii(");"),
            ]);
            deferred.push(statement(cp.clone(), "check", sql));
            if b(get(check, "is_disabled")) == Some(true) {
                deferred.push(statement(
                    cp,
                    "disable",
                    cat(&[
                        &ascii("ALTER TABLE "),
                        &table,
                        &ascii(" NOCHECK CONSTRAINT "),
                        &quoted(s(get(check, "name")).unwrap())?,
                        &ascii(";"),
                    ]),
                ));
            }
        }
        for (fi, fk) in a(get(t, "foreign_keys")).unwrap_or(&[]).iter().enumerate() {
            let fp = suffix(&path, &format!("/foreign_keys/{fi}"));
            known(
                fk,
                &[
                    "name",
                    "is_system_named",
                    "is_disabled",
                    "is_not_trusted",
                    "is_not_for_replication",
                    "delete_action",
                    "update_action",
                    "referenced_schema",
                    "referenced_table",
                    "columns",
                ],
                &fp,
                &mut issues,
            );
            let rs = s(get(fk, "referenced_schema"))
                .ok_or_else(|| err("SQLSERVER_DDL_SOURCE", "Missing referenced schema"))?;
            let rn = s(get(fk, "referenced_table"))
                .ok_or_else(|| err("SQLSERVER_DDL_SOURCE", "Missing referenced table"))?;
            let target = tables
                .iter()
                .find(|t| s(get(t, "schema")) == Some(rs) && s(get(t, "name")) == Some(rn));
            let da = text(get(fk, "delete_action")).unwrap_or_default();
            let ua = text(get(fk, "update_action")).unwrap_or_default();
            if target.is_none()
                || !["NO_ACTION", "CASCADE", "SET_NULL", "SET_DEFAULT"].contains(&da.as_str())
                || !["NO_ACTION", "CASCADE", "SET_NULL", "SET_DEFAULT"].contains(&ua.as_str())
            {
                fatal = true;
                issues.push(issue(
                    fp.clone(),
                    "SQLSERVER_DDL_UNSUPPORTED",
                    "Referenced table or native action is unresolved",
                    "unsupported",
                ));
                continue;
            }
            let target = target.unwrap();
            let fcols = a(get(fk, "columns")).unwrap_or(&[]);
            let mut ordered: Vec<_> = fcols.iter().collect();
            ordered.sort_by_key(|c| n(get(c, "ordinal")).unwrap_or(i64::MIN));
            if ordered.is_empty()
                || ordered
                    .iter()
                    .enumerate()
                    .any(|(i, c)| n(get(c, "ordinal")) != Some(i as i64 + 1))
            {
                fatal = true;
                issues.push(issue(
                    fp.clone(),
                    "SQLSERVER_DDL_UNSUPPORTED",
                    "Missing or noncontiguous positive column ordinals",
                    "unsupported",
                ));
            }
            let mut from = Vec::new();
            let mut to = Vec::new();
            for col in ordered {
                known(
                    col,
                    &[
                        "ordinal",
                        "column_id",
                        "column_name",
                        "referenced_column_id",
                        "referenced_column_name",
                    ],
                    &suffix(
                        &fp,
                        &format!(
                            "/columns/{}",
                            fcols.iter().position(|x| std::ptr::eq(x, col)).unwrap_or(0)
                        ),
                    ),
                    &mut issues,
                );
                from.push(column_name(
                    cols,
                    n(get(col, "column_id")),
                    s(get(col, "column_name")),
                    &fp,
                    &mut issues,
                    &mut fatal,
                )?);
                let target_name = s(get(col, "referenced_column_name"))
                    .ok_or_else(|| err("SQLSERVER_DDL_SOURCE", "Missing referenced column name"))?;
                let target_id = n(get(col, "referenced_column_id"));
                if !a(get(target, "columns")).unwrap_or(&[]).iter().any(|tc| {
                    n(get(tc, "column_id")) == target_id && s(get(tc, "name")) == Some(target_name)
                }) {
                    fatal = true;
                    issues.push(issue(
                        fp.clone(),
                        "SQLSERVER_DDL_UNSUPPORTED",
                        "Referenced column name/ID unresolved",
                        "unsupported",
                    ));
                }
                to.push(quoted(target_name)?);
            }
            if b(get(fk, "is_system_named")) == Some(true) {
                issues.push(issue(
                    fp.clone(),
                    "SYSTEM_NAME_BECOMES_EXPLICIT",
                    "Foreign key name retained as explicit, not system-generated",
                    "representation-change",
                ));
            }
            let sql = cat(&[
                &ascii("ALTER TABLE "),
                &table,
                &ascii(if b(get(fk, "is_not_trusted")) == Some(true) {
                    " WITH NOCHECK ADD CONSTRAINT "
                } else {
                    " WITH CHECK ADD CONSTRAINT "
                }),
                &quoted(
                    s(get(fk, "name"))
                        .ok_or_else(|| err("SQLSERVER_DDL_SOURCE", "Missing foreign key name"))?,
                )?,
                &ascii(" FOREIGN KEY ("),
                &join(&from, &ascii(", ")),
                &ascii(") REFERENCES "),
                &qtable(rs, rn)?,
                &ascii(" ("),
                &join(&to, &ascii(", ")),
                &ascii(") ON DELETE "),
                &ascii(&da.replace('_', " ")),
                &ascii(" ON UPDATE "),
                &ascii(&ua.replace('_', " ")),
                &ascii(if b(get(fk, "is_not_for_replication")) == Some(true) {
                    " NOT FOR REPLICATION"
                } else {
                    ""
                }),
                &ascii(";"),
            ]);
            deferred.push(statement(fp.clone(), "foreign-key", sql));
            if b(get(fk, "is_disabled")) == Some(true) {
                deferred.push(statement(
                    fp,
                    "disable",
                    cat(&[
                        &ascii("ALTER TABLE "),
                        &table,
                        &ascii(" NOCHECK CONSTRAINT "),
                        &quoted(s(get(fk, "name")).unwrap())?,
                        &ascii(";"),
                    ]),
                ));
            }
        }
    }
    let out_statements = regular
        .into_iter()
        .chain(deferred)
        .map(sv_statement)
        .collect::<Vec<_>>();
    if fatal || text(get(&policy, "lossPolicy")).as_deref() == Some("strict") && !issues.is_empty()
    {
        return Ok(base_result("blocked", issues, vec![], None));
    }
    let mut script=vec![ascii("SET ANSI_NULLS ON;\nSET QUOTED_IDENTIFIER ON;\nSET ANSI_PADDING ON;\nSET ANSI_WARNINGS ON;\nSET ARITHABORT ON;\nSET CONCAT_NULL_YIELDS_NULL ON;\nSET NUMERIC_ROUNDABORT OFF;\n")];
    for st in &out_statements {
        if let Some(sql) = s(get(st, "sql")) {
            script.push(sql.clone());
            script.push(ascii("\n"))
        }
    }
    let mut native_units = Vec::new();
    for part in script {
        native_units.extend_from_slice(part.units());
    }
    let native_source = Utf16::new(native_units);
    Ok(base_result(
        "projected",
        issues,
        out_statements,
        Some(native_source),
    ))
}
fn integer_lexical(v: &Utf16) -> bool {
    let x = v.units();
    if x.is_empty() {
        return false;
    }
    let start = usize::from(x[0] == 45);
    start < x.len() && x[start..].iter().all(|u| (48..=57).contains(u))
}
fn join(values: &[Utf16], separator: &Utf16) -> Utf16 {
    let mut out = Vec::new();
    for (i, value) in values.iter().enumerate() {
        if i > 0 {
            out.extend_from_slice(separator.units())
        }
        out.extend_from_slice(value.units())
    }
    Utf16::new(out)
}
pub fn project_sqlserver_to_ddl(
    source: &Value,
    policy: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    projection(source, policy, ctx)
}

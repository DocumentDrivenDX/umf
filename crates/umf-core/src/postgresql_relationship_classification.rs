// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned PostgreSQL foreign-key observation and retained-source receipt.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    native_json::NativeJsonTree,
    postgresql_catalog as pg, postgresql_sql_runtime as sql,
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::collections::{BTreeMap, BTreeSet};
const RESULT: &str =
    include_str!("../../../spec/core/postgresql-relationship-classification.schema.json");
const PACKAGE: &str =
    include_str!("../../../spec/extensions/postgresql-relationships/package.json");
const CATALOG_PACKAGE: &str =
    include_str!("../../../spec/extensions/postgresql-catalog/package.json");
const EXT: &str = "umf.postgresql.relationships";
const SUBSET: &str = "Observed DDL/catalog FKs and authored new ordinary keyed tables with homogeneous FK/junction endpoint layouts; retained meaning, no native equivalence or deployed-state guarantee";
fn u(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(xs: Vec<(&str, Value)>) -> Value {
    Value::Object(xs.into_iter().map(|(k, v)| (u(k), v)).collect())
}
fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(x, _)| x == &u(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn set(v: &mut Value, k: &str, x: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("POSTGRESQL_RELATIONSHIP_TARGET", "", "Expected object"));
    };
    if let Some((_, old)) = m.iter_mut().find(|(n, _)| n == &u(k)) {
        *old = x
    } else {
        m.push((u(k), x))
    }
    Ok(())
}
fn text<'a>(v: &'a Value, k: &str) -> Option<&'a Utf16> {
    match get(v, k) {
        Some(Value::String(s)) => Some(s),
        _ => None,
    }
}
fn arr<'a>(v: &'a Value, k: &str) -> Option<&'a [Value]> {
    match get(v, k) {
        Some(Value::Array(a)) => Some(a),
        _ => None,
    }
}
fn err(code: &str, path: &str, msg: &str) -> EngineError {
    EngineError::new(code, u(path), msg)
}
fn read(s: &str, c: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&s.encode_utf16().collect::<Vec<_>>(), Format::Json, c)
}
fn equal(a: &Value, b: &Value, c: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canon(v: &Value, c: &mut Context<'_>, depth: usize) -> Result<Value, EngineError> {
        if depth > c.limits().max_depth {
            return Err(err("LIMIT", "", "Canonicalization depth exceeded"));
        }
        c.charge_work(1, Utf16::default())?;
        match v {
            Value::Array(xs) => {
                let mut o = Vec::with_capacity(xs.len());
                for x in xs {
                    o.push(canon(x, c, depth + 1)?)
                }
                Ok(Value::Array(o))
            }
            Value::Object(xs) => {
                let mut o = Vec::with_capacity(xs.len());
                for (k, v) in xs {
                    c.charge_work(k.len().saturating_add(1), Utf16::default())?;
                    o.push((k.clone(), canon(v, c, depth + 1)?))
                }
                o.sort_by(|a, b| a.0.cmp(&b.0));
                Ok(Value::Object(o))
            }
            _ => copy_json(v, c),
        }
    }
    Ok(canon(a, c, 0)? == canon(b, c, 0)?)
}
struct NoCallbacks;
impl Capabilities for NoCallbacks {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(vec![])
    }
}
struct Runtime {
    engine: Engine,
    registry: Registry,
    result: CompiledSchema,
    request: CompiledSchema,
}
fn runtime(c: &mut Context<'_>) -> Result<Runtime, EngineError> {
    let core = |s: &str, c: &mut Context<'_>| read(s, c);
    let engine = Engine::new(
        ResourceSet::new(
            core(include_str!("../../../spec/core/schema.json"), c)?,
            core(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                c,
            )?,
            core(
                include_str!("../../../spec/core/extension-package.schema.json"),
                c,
            )?,
            core(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                c,
            )?,
            core(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                c,
            )?,
        ),
        c,
    )?;
    let resources = engine.schema_resources_with_context(c)?;
    let mut registry = Registry::new();
    registry.register(
        &core(CATALOG_PACKAGE, c)?,
        Some(47),
        engine.package_schema(),
        &resources,
        c,
    )?;
    let relationship_package = core(PACKAGE, c)?;
    registry.register(
        &relationship_package,
        Some(52),
        engine.package_schema(),
        &resources,
        c,
    )?;
    let s = core(RESULT, c)?;
    let mut schemas = resources.clone();
    schemas.entries.push((
        u("urn:umf:native-json:0.1.0"),
        core(
            include_str!("../../../spec/core/native-json.schema.json"),
            c,
        )?,
    ));
    schemas.entries.push((
        u("urn:umf:core:postgresql-relationship-classification:1.0.0"),
        s.clone(),
    ));
    schemas.entries.push((
        u("urn:umf:postgresql:relationship-binding:1.0.0"),
        get(&relationship_package, "schema")
            .cloned()
            .unwrap_or(Value::Null),
    ));
    let result = CompiledSchema::compile(&s, &schemas, c)?;
    let req = CompiledSchema::compile(
        get(get(&s, "properties").unwrap_or(&Value::Null), "request")
            .ok_or_else(|| err("SCHEMA", "", "Request schema missing"))?,
        &schemas,
        c,
    )?;
    Ok(Runtime {
        engine,
        registry,
        result,
        request: req,
    })
}
fn validate(
    v: &Value,
    s: &CompiledSchema,
    c: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    if s.validate(v, c)?.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "",
            "Value does not match PostgreSQL relationship schema",
        ))
    }
}
fn validate_doc(source: &Value, r: &Runtime, c: &mut Context<'_>) -> Result<(), EngineError> {
    let mut caps = NoCallbacks;
    let x = r
        .engine
        .validate_document(source, &r.registry, &mut caps, c)?;
    if !x.valid || text(source, "umf") != Some(&u("0.10.0")) {
        return Err(err(
            "POSTGRESQL_RELATIONSHIP_SOURCE",
            "",
            "Valid UMF 0.10.0 source required",
        ));
    }
    Ok(())
}
fn field_value<'a>(tag: &'a Value, k: &str) -> Option<&'a Value> {
    get(get(tag, "members")?, k)
}
fn tagged_string(v: Option<&Value>) -> Option<&Utf16> {
    match v {
        Some(n) if text(n, "kind") == Some(&u("string")) => text(n, "value"),
        _ => None,
    }
}
fn tagged_array(v: Option<&Value>) -> Option<&[Value]> {
    match v {
        Some(n) if text(n, "kind") == Some(&u("array")) => arr(n, "items"),
        _ => None,
    }
}
fn native_json(value: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
    let encoded = serialization::write_json_value(value, Format::Json, c)?;
    NativeJsonTree::parse_json(encoded.units(), c)?.tagged_value_preserving_extras(c)
}
fn parser_rows(
    request: &Value,
    source: Option<&Value>,
    c: &mut Context<'_>,
) -> Result<Vec<(Utf16, Utf16)>, EngineError> {
    let profile = text(request, "profile").ok_or_else(|| {
        err(
            "POSTGRESQL_RELATIONSHIP_REQUEST",
            "/profile",
            "Profile required",
        )
    })?;
    let native = text(request, "nativeSource").ok_or_else(|| {
        err(
            "POSTGRESQL_RELATIONSHIP_REQUEST",
            "/nativeSource",
            "Native source required",
        )
    })?;
    if profile == &u("raw-ddl") {
        if let Some(doc) = source {
            if !matches!(sql::get_postgresql_source(doc, c)?, Value::String(ref archived) if archived == native)
            {
                return Err(err(
                    "POSTGRESQL_RELATIONSHIP_ARCHIVE",
                    "/nativeSource",
                    "DDL text differs from original archive",
                ));
            }
        }
        return Ok(vec![(u("raw-ddl"), native.clone())]);
    }
    if profile != &u("captured-catalog") {
        return Err(err(
            "POSTGRESQL_RELATIONSHIP_REQUEST",
            "/profile",
            "Unsupported profile",
        ));
    }
    let doc = source.ok_or_else(|| {
        err(
            "POSTGRESQL_RELATIONSHIP_SOURCE",
            "/source",
            "Source required",
        )
    })?;
    let capture = pg::catalog_from_document(doc, c)?;
    if capture.state() != &u("captured") {
        return Err(err(
            "POSTGRESQL_RELATIONSHIP_ARCHIVE",
            "/nativeSource",
            "Expected exact retained catalog archive",
        ));
    }
    let root = capture.root_tagged(c)?;
    let archived = parse_native_text(native, c)?;
    if archived != root {
        return Err(err(
            "POSTGRESQL_RELATIONSHIP_ARCHIVE",
            "/nativeSource",
            "Catalog JSON does not match its retained native tree",
        ));
    }
    let snapshot = field_value(&root, "snapshot")
        .ok_or_else(|| err("POSTGRESQL_RELATIONSHIP_CATALOG", "", "Snapshot missing"))?;
    let relations = tagged_array(field_value(snapshot, "relations"))
        .ok_or_else(|| err("POSTGRESQL_RELATIONSHIP_CATALOG", "", "Relations missing"))?;
    let mut rows = Vec::new();
    for (ri, r) in relations.iter().enumerate() {
        let schema = tagged_string(field_value(r, "schema")).ok_or_else(|| {
            err(
                "POSTGRESQL_RELATIONSHIP_CATALOG",
                "",
                "Relation schema missing",
            )
        })?;
        let name = tagged_string(field_value(r, "name")).ok_or_else(|| {
            err(
                "POSTGRESQL_RELATIONSHIP_CATALOG",
                "",
                "Relation name missing",
            )
        })?;
        let constraints = tagged_array(field_value(r, "constraints")).unwrap_or(&[]);
        let mut seen = BTreeSet::new();
        for (ci, x) in constraints.iter().enumerate() {
            let cname = tagged_string(field_value(x, "name")).ok_or_else(|| {
                err(
                    "POSTGRESQL_RELATIONSHIP_CATALOG",
                    "",
                    "Constraint name missing",
                )
            })?;
            if !seen.insert(cname.clone()) {
                return Err(err(
                    "POSTGRESQL_RELATIONSHIP_CATALOG",
                    "",
                    "Duplicate constraint identity",
                ));
            }
            let kind = tagged_string(field_value(x, "kind"))
                .cloned()
                .unwrap_or_default();
            if kind != u("f") && kind != u("p") && kind != u("u") {
                continue;
            }
            let def = tagged_string(field_value(x, "definition")).ok_or_else(|| {
                err(
                    "POSTGRESQL_RELATIONSHIP_CATALOG",
                    "",
                    "Constraint definition missing",
                )
            })?;
            let mut sql = String::from("ALTER TABLE ");
            sql.push_str(&quote_ident(schema, c)?);
            sql.push('.');
            sql.push_str(&quote_ident(name, c)?);
            sql.push_str(" ADD CONSTRAINT ");
            sql.push_str(&quote_ident(cname, c)?);
            sql.push(' ');
            c.charge_text(def.len(), Utf16::default())?;
            c.charge_work(def.len(), Utf16::default())?;
            sql.push_str(&def.to_utf8().map_err(|_| {
                err(
                    "POSTGRESQL_RELATIONSHIP_CATALOG",
                    "",
                    "Definition must be UTF-8",
                )
            })?);
            sql.push(';');
            let sql_units = sql.encode_utf16().count();
            c.charge_text(sql_units, Utf16::default())?;
            c.charge_work(sql_units, Utf16::default())?;
            let id = Utf16::from(format!("catalog-{ri}-{ci}"));
            rows.push((id, Utf16::from(sql)));
        }
    }
    Ok(rows)
}
fn quote_ident(v: &Utf16, c: &mut Context<'_>) -> Result<String, EngineError> {
    c.charge_text(v.len(), Utf16::default())?;
    c.charge_work(v.len(), Utf16::default())?;
    let s = v.to_utf8().map_err(|_| {
        err(
            "POSTGRESQL_RELATIONSHIP_CATALOG",
            "",
            "Identifier must be UTF-8",
        )
    })?;
    Ok(format!("\"{}\"", s.replace('"', "\"\"")))
}
pub fn prepare_parser_requests(
    source: &Value,
    request: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    validate(request, &rt.request, c, "POSTGRESQL_RELATIONSHIP_REQUEST")?;
    let rows = parser_rows(request, Some(source), c)?;
    Ok(obj(vec![(
        "queries",
        Value::Array(
            rows.into_iter()
                .map(|(id, sql)| obj(vec![("id", Value::String(id)), ("sql", Value::String(sql))]))
                .collect(),
        ),
    )]))
}
fn parser_map(
    source: &Value,
    request: &Value,
    parser: &Value,
    c: &mut Context<'_>,
) -> Result<BTreeMap<Utf16, Value>, EngineError> {
    let expected = parser_rows(request, Some(source), c)?;
    let responses = arr(parser, "responses").ok_or_else(|| {
        err(
            "POSTGRESQL_RELATIONSHIP_BACKEND",
            "/responses",
            "Parser responses required",
        )
    })?;
    if expected.len() != responses.len() {
        return Err(err(
            "POSTGRESQL_RELATIONSHIP_BACKEND",
            "/responses",
            "Parser response count differs from prepared requests",
        ));
    }
    let mut out = BTreeMap::new();
    for ((eid, esql), r) in expected.iter().zip(responses) {
        let id = text(r, "id").ok_or_else(|| {
            err(
                "POSTGRESQL_RELATIONSHIP_BACKEND",
                "/responses/id",
                "Response id required",
            )
        })?;
        let sqlv = text(r, "sql").ok_or_else(|| {
            err(
                "POSTGRESQL_RELATIONSHIP_BACKEND",
                "/responses/sql",
                "Response SQL required",
            )
        })?;
        let ast = get(r, "ast").ok_or_else(|| {
            err(
                "POSTGRESQL_RELATIONSHIP_BACKEND",
                "/responses/ast",
                "AST required",
            )
        })?;
        if id != eid || sqlv != esql || out.insert(eid.clone(), copy_json(ast, c)?).is_some() {
            return Err(err(
                "POSTGRESQL_RELATIONSHIP_BACKEND",
                "/responses",
                "Parser response differs from ordered Rust requests",
            ));
        }
    }
    Ok(out)
}
fn pg_path<'a>(root: &'a Value, path: &str) -> Option<&'a Value> {
    let mut n = root;
    for part in path
        .trim_start_matches('/')
        .split('/')
        .filter(|x| !x.is_empty())
    {
        let key = part.replace("~1", "/").replace("~0", "~");
        n = if text(n, "kind") == Some(&u("array")) {
            arr(n, "items")?.get(key.parse::<usize>().ok()?)?
        } else {
            field_value(n, &key)?
        }
    }
    Some(n)
}
fn walk_fk(
    n: &Value,
    path: &str,
    out: &mut Vec<(String, Value)>,
    c: &mut Context<'_>,
) -> Result<(), EngineError> {
    c.charge_work(1, Utf16::default())?;
    c.charge_text(path.encode_utf16().count(), Utf16::default())?;
    if text(n, "kind") == Some(&u("object")) {
        if let Some(c) = field_value(n, "Constraint") {
            if tagged_string(field_value(c, "contype")).is_some_and(|x| x == &u("CONSTR_FOREIGN")) {
                out.push((format!("{path}/Constraint"), c.clone()))
            }
        }
        if let Some(Value::Object(ms)) = get(n, "members") {
            for (k, v) in ms {
                let key = k
                    .to_utf8()
                    .map_err(|_| {
                        err(
                            "POSTGRESQL_RELATIONSHIP_AST",
                            path,
                            "AST key is not valid UTF-16 text",
                        )
                    })?
                    .replace('~', "~0")
                    .replace('/', "~1");
                walk_fk(v, &format!("{path}/{key}"), out, c)?
            }
        }
    } else if text(n, "kind") == Some(&u("array")) {
        if let Some(xs) = arr(n, "items") {
            for (i, x) in xs.iter().enumerate() {
                walk_fk(x, &format!("{path}/{i}"), out, c)?
            }
        }
    }
    Ok(())
}
fn plain(v: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
    let txt = serialization::write_json_value(v, Format::Json, c)?;
    serialization::read_json_value(txt.units(), Format::Json, c)
}
fn plain_tagged_native(v: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
    let tree = NativeJsonTree::from_tagged_value(v, c)?;
    let compact = tree.render_compact(c)?;
    serialization::read_json_value(compact.units(), Format::Json, c)
}
fn parsed_constraint<'a>(ast: &'a Value) -> Result<&'a Value, EngineError> {
    let statements = arr(ast, "stmts").ok_or_else(|| {
        err(
            "POSTGRESQL_RELATIONSHIP_CATALOG",
            "",
            "Expected one parsed statement",
        )
    })?;
    if statements.len() != 1 {
        return Err(err(
            "POSTGRESQL_RELATIONSHIP_CATALOG",
            "",
            "Constraint SQL must produce one statement",
        ));
    }
    let alter = get(
        get(&statements[0], "stmt").unwrap_or(&Value::Null),
        "AlterTableStmt",
    )
    .ok_or_else(|| {
        err(
            "POSTGRESQL_RELATIONSHIP_CATALOG",
            "",
            "Expected ALTER TABLE statement",
        )
    })?;
    let commands = arr(alter, "cmds").ok_or_else(|| {
        err(
            "POSTGRESQL_RELATIONSHIP_CATALOG",
            "",
            "ALTER TABLE command missing",
        )
    })?;
    if commands.len() != 1 {
        return Err(err(
            "POSTGRESQL_RELATIONSHIP_CATALOG",
            "",
            "Expected one ADD CONSTRAINT command",
        ));
    }
    let command = get(&commands[0], "AlterTableCmd").ok_or_else(|| {
        err(
            "POSTGRESQL_RELATIONSHIP_CATALOG",
            "",
            "ALTER TABLE command wrapper missing",
        )
    })?;
    if text(command, "subtype") != Some(&u("AT_AddConstraint")) {
        return Err(err(
            "POSTGRESQL_RELATIONSHIP_CATALOG",
            "",
            "Expected one ADD CONSTRAINT command",
        ));
    }
    get(get(command, "def").unwrap_or(&Value::Null), "Constraint").ok_or_else(|| {
        err(
            "POSTGRESQL_RELATIONSHIP_CATALOG",
            "",
            "Parsed constraint missing",
        )
    })
}
fn parsed_relation_matches(ast: &Value, schema: &Utf16, relation: &Utf16) -> bool {
    let stmt = get(
        &arr(ast, "stmts")
            .and_then(|xs| xs.first())
            .unwrap_or(&Value::Null),
        "stmt",
    )
    .unwrap_or(&Value::Null);
    let alter = get(stmt, "AlterTableStmt").unwrap_or(&Value::Null);
    let relation_node = get(alter, "relation").unwrap_or(&Value::Null);
    text(relation_node, "schemaname") == Some(schema)
        && text(relation_node, "relname") == Some(relation)
}
fn plain_columns(
    v: Option<&Value>,
    key: &str,
    c: &mut Context<'_>,
) -> Result<Vec<Utf16>, EngineError> {
    let mut out = Vec::new();
    if let Some(rows) = v.and_then(|v| arr(v, key)) {
        for row in rows {
            if let Some(name) = text(get(row, "String").unwrap_or(&Value::Null), "sval") {
                c.charge_work(name.len().saturating_add(1), Utf16::default())?;
                out.push(name.clone());
            }
        }
    }
    Ok(out)
}
fn bool_true(v: Option<&Value>, key: &str) -> bool {
    matches!(v.and_then(|v| get(v, key)), Some(Value::Bool(true)))
}
fn tagged_bool(v: Option<&Value>) -> Option<bool> {
    if text(v?, "kind") != Some(&u("boolean")) {
        return None;
    }
    match get(v?, "value") {
        Some(Value::Bool(b)) => Some(*b),
        _ => None,
    }
}
fn tagged_number(v: Option<&Value>) -> Option<&Utf16> {
    let node = v?;
    if text(node, "kind") != Some(&u("number")) {
        return None;
    }
    text(node, "value")
}
fn parse_native_text(v: &Utf16, c: &mut Context<'_>) -> Result<Value, EngineError> {
    Ok(NativeJsonTree::parse_json(v.units(), c)?.tagged_value_preserving_extras(c)?)
}
fn observation(
    path: &str,
    node: &Value,
    origin: &str,
    source_table: Value,
    validated: Value,
    ast: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let constraint = get(ast, "Constraint").unwrap_or(ast);
    let action = |key: &str| -> Value {
        let x = text(constraint, key)
            .and_then(|x| x.to_utf8().ok())
            .unwrap_or_default();
        t(match x.as_str() {
            "a" => "no-action",
            "r" => "restrict",
            "c" => "cascade",
            "n" => "set-null",
            "d" => "set-default",
            _ => "unknown",
        })
    };
    let matchkind = text(constraint, "fk_matchtype")
        .and_then(|x| x.to_utf8().ok())
        .unwrap_or_default();
    let pktable = get(constraint, "pktable").unwrap_or(&Value::Null);
    let target = match (text(pktable, "schemaname"), text(pktable, "relname")) {
        (Some(a), Some(b)) => {
            let mut joined = a.units().to_vec();
            joined.push(46);
            joined.extend_from_slice(b.units());
            Value::String(Utf16::new(joined))
        }
        _ => Value::Null,
    };
    Ok(obj(vec![
        ("nativePath", t(path)),
        ("nativeNode", copy_json(node, c)?),
        ("origin", t(origin)),
        (
            "name",
            get(constraint, "conname").cloned().unwrap_or(Value::Null),
        ),
        ("sourceTable", source_table),
        ("targetTable", target),
        (
            "sourceColumns",
            Value::Array(
                plain_columns(Some(constraint), "fk_attrs", c)?
                    .into_iter()
                    .map(Value::String)
                    .collect(),
            ),
        ),
        (
            "targetColumns",
            Value::Array(
                plain_columns(Some(constraint), "pk_attrs", c)?
                    .into_iter()
                    .map(Value::String)
                    .collect(),
            ),
        ),
        ("targetKeyCandidates", Value::Array(vec![])),
        (
            "match",
            t(match matchkind.as_str() {
                "s" => "simple",
                "f" => "full",
                "p" => "partial",
                _ => "unknown",
            }),
        ),
        ("onUpdate", action("fk_upd_action")),
        ("onDelete", action("fk_del_action")),
        ("validated", validated),
        (
            "deferrable",
            Value::Bool(bool_true(Some(constraint), "deferrable")),
        ),
        (
            "initiallyDeferred",
            Value::Bool(bool_true(Some(constraint), "initdeferred")),
        ),
        ("authorIntent", t("unknown")),
        ("enforcement", t("unverified-native-observation")),
    ]))
}
fn classify_inner(
    source: &Value,
    request: &Value,
    parser: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    validate(request, &rt.request, c, "POSTGRESQL_RELATIONSHIP_REQUEST")?;
    let profile = text(request, "profile").unwrap();
    let native = text(request, "nativeSource").unwrap();
    if profile == &u("captured-catalog") {
        validate_doc(source, &rt, c)?;
    }
    let responses = parser_map(source, request, parser, c)?;
    let mut observations = Vec::new();
    let mut loss=vec![obj(vec![("source",t("native")),("path",t("")),("value",Value::String(native.clone())),("outcome",t("unknown")),("reason",t("Complete native source retained; FK syntax/catalog state does not establish authored stable relationships, participation, lifecycle, inverse navigation or current deployed enforcement"))])];
    if profile == &u("raw-ddl") {
        let archive = sql::get_postgresql_source(source, c)?;
        if !matches!(archive, Value::String(ref archived) if archived == native) {
            return Err(err(
                "POSTGRESQL_RELATIONSHIP_ARCHIVE",
                "/nativeSource",
                "DDL differs from exact source archive",
            ));
        }
        let root = sql::get_postgresql_node(source, &u(""), c)?;
        let ast = responses.get(&u("raw-ddl")).unwrap();
        let parsed = native_json(ast, c)?;
        if !equal(&root, &parsed, c)? {
            return Err(err(
                "POSTGRESQL_RELATIONSHIP_ARCHIVE",
                "/nativeSource",
                "Parser AST differs from retained source",
            ));
        }
        let mut rows = Vec::new();
        walk_fk(&root, "", &mut rows, c)?;
        for (path, node) in rows {
            let p = pg_path(&root, &path).cloned().unwrap_or(Value::Null);
            let plainnode = plain_tagged_native(&p, c)?;
            observations.push(observation(
                &path,
                &p,
                "ddl",
                Value::Null,
                Value::Null,
                &plainnode,
                c,
            )?);
        }
    } else {
        let capture = pg::catalog_from_document(source, c)?;
        if capture.state() != &u("captured") {
            return Err(err(
                "POSTGRESQL_RELATIONSHIP_ARCHIVE",
                "/nativeSource",
                "Catalog differs from exact retained archive",
            ));
        }
        let root = capture.root_tagged(c)?;
        if parse_native_text(native, c)? != root {
            return Err(err(
                "POSTGRESQL_RELATIONSHIP_ARCHIVE",
                "/nativeSource",
                "Catalog JSON does not match its retained native tree",
            ));
        }
        let version = tagged_number(field_value(&root, "serverVersion"));
        if version != Some(&u("170004")) {
            return Err(err(
                "POSTGRESQL_RELATIONSHIP_CATALOG",
                "/serverVersion",
                "PostgreSQL 17.4 capture required",
            ));
        }
        let snapshot = field_value(&root, "snapshot")
            .ok_or_else(|| err("POSTGRESQL_RELATIONSHIP_CATALOG", "", "Snapshot missing"))?;
        let relations = tagged_array(field_value(snapshot, "relations"))
            .ok_or_else(|| err("POSTGRESQL_RELATIONSHIP_CATALOG", "", "Relations missing"))?;
        let mut names = BTreeSet::new();
        let mut parsed_keys: Vec<(String, Vec<Utf16>, Utf16)> = Vec::new();
        for (ri, rel) in relations.iter().enumerate() {
            let schema = tagged_string(field_value(rel, "schema")).unwrap();
            let rname = tagged_string(field_value(rel, "name")).unwrap();
            let table = format!(
                "{}.{}",
                schema.to_utf8().map_err(|_| err(
                    "POSTGRESQL_RELATIONSHIP_CATALOG",
                    "",
                    "Catalog identifier is not UTF-8"
                ))?,
                rname.to_utf8().map_err(|_| err(
                    "POSTGRESQL_RELATIONSHIP_CATALOG",
                    "",
                    "Catalog identifier is not UTF-8"
                ))?
            );
            if !names.insert(table.clone()) {
                return Err(err(
                    "POSTGRESQL_RELATIONSHIP_CATALOG",
                    "",
                    "Duplicate qualified relation",
                ));
            }
            let mut constraint_names = BTreeSet::new();
            for (ci, cons) in tagged_array(field_value(rel, "constraints"))
                .unwrap_or(&[])
                .iter()
                .enumerate()
            {
                let kind = tagged_string(field_value(cons, "kind"))
                    .cloned()
                    .unwrap_or_default();
                let cname = tagged_string(field_value(cons, "name")).ok_or_else(|| {
                    err(
                        "POSTGRESQL_RELATIONSHIP_CATALOG",
                        "",
                        "Constraint name missing",
                    )
                })?;
                if !constraint_names.insert(cname.clone()) {
                    return Err(err(
                        "POSTGRESQL_RELATIONSHIP_CATALOG",
                        "",
                        "Duplicate constraint identity",
                    ));
                }
                if kind != u("f") && kind != u("p") && kind != u("u") {
                    continue;
                }
                let response = responses
                    .get(&u(&format!("catalog-{ri}-{ci}")))
                    .ok_or_else(|| {
                        err(
                            "POSTGRESQL_RELATIONSHIP_BACKEND",
                            "",
                            "Prepared constraint AST missing",
                        )
                    })?;
                let ast = plain(response, c)?;
                let constraint = parsed_constraint(&ast)?;
                if !parsed_relation_matches(&ast, schema, rname) {
                    return Err(err(
                        "POSTGRESQL_RELATIONSHIP_CATALOG",
                        "",
                        "Parsed constraint targets a different relation",
                    ));
                }
                let expected_kind = if kind == u("f") {
                    "CONSTR_FOREIGN"
                } else if kind == u("p") {
                    "CONSTR_PRIMARY"
                } else {
                    "CONSTR_UNIQUE"
                };
                if text(constraint, "contype") != Some(&u(expected_kind))
                    || text(constraint, "conname") != Some(cname)
                    || bool_true(Some(constraint), "deferrable")
                        != tagged_bool(field_value(cons, "deferrable")).unwrap_or(false)
                    || bool_true(Some(constraint), "initdeferred")
                        != tagged_bool(field_value(cons, "deferred")).unwrap_or(false)
                {
                    return Err(err(
                        "POSTGRESQL_RELATIONSHIP_CATALOG",
                        "",
                        "Parsed constraint disagrees with captured metadata",
                    ));
                }
                if kind != u("f") {
                    parsed_keys.push((
                        table.clone(),
                        plain_columns(Some(constraint), "keys", c)?,
                        cname.clone(),
                    ));
                    continue;
                }
                if bool_true(Some(constraint), "skip_validation")
                    == tagged_bool(field_value(cons, "validated")).unwrap_or(false)
                {
                    return Err(err(
                        "POSTGRESQL_RELATIONSHIP_CATALOG",
                        "",
                        "Parsed FK validation state disagrees with catalog",
                    ));
                }
                let nodepath = format!("/snapshot/relations/{ri}/constraints/{ci}");
                let node = pg_path(&root, &nodepath).cloned().unwrap_or(Value::Null);
                observations.push(observation(
                    &nodepath,
                    &node,
                    "catalog",
                    t(&table),
                    Value::Bool(tagged_bool(field_value(cons, "validated")).unwrap_or(false)),
                    constraint,
                    c,
                )?);
            }
        }
        for row in &mut observations {
            let table = text(row, "targetTable")
                .map(|s| {
                    s.to_utf8().map_err(|_| {
                        err(
                            "POSTGRESQL_RELATIONSHIP_CATALOG",
                            "",
                            "Referenced table name is not UTF-8",
                        )
                    })
                })
                .transpose()?
                .unwrap_or_default();
            let target_columns = arr(row, "targetColumns")
                .unwrap_or(&[])
                .iter()
                .filter_map(|v| {
                    if let Value::String(s) = v {
                        Some(s.clone())
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>();
            let candidates = parsed_keys
                .iter()
                .filter(|(t, cols, _)| {
                    t.as_str() == table.as_str() && cols.as_slice() == target_columns.as_slice()
                })
                .map(|(_, _, name)| Value::String(name.clone()))
                .collect::<Vec<_>>();
            set(row, "targetKeyCandidates", Value::Array(candidates))?;
        }
    }
    for row in &observations {
        loss.push(obj(vec![("source",t("native")),("path",get(row,"nativePath").cloned().unwrap_or(t(""))),("value",copy_json(get(row,"nativeNode").unwrap_or(&Value::Null),c)?),("outcome",t("unknown")),("reason",t("Native FK details retained independently: actions, match/NULL exemption, deferral, validation and referenced Key candidates are observations, not author intent"))]));
        if get(row, "targetTable") == Some(&Value::Null) {
            loss.push(obj(vec![
                ("source", t("native")),
                ("path", get(row, "nativePath").cloned().unwrap_or(t(""))),
                ("value", copy_json(get(row, "nativeNode").unwrap_or(&Value::Null), c)?),
                ("outcome", t("unknown")),
                ("reason", t("Unqualified target table requires explicit native search-path/catalog resolution; null targetTable and empty Key candidates mean unresolved, not absence")),
            ]));
        }
    }
    let conflict = get(get(source, "extensions").unwrap_or(&Value::Null), EXT).is_some();
    let version = get(get(source, "vocabularies").unwrap_or(&Value::Null), EXT);
    let unsupported = version.is_some_and(|v| text(v, "version") != Some(&u("1.0.0")));
    if conflict {
        loss.push(obj(vec![
            ("source", t("native")),
            ("path", t("/extensions/umf.postgresql.relationships")),
            (
                "value",
                copy_json(
                    get(get(source, "extensions").unwrap_or(&Value::Null), EXT).unwrap(),
                    c,
                )?,
            ),
            ("outcome", t("unknown")),
            (
                "reason",
                t("Existing classification content cannot be overwritten"),
            ),
        ]));
    }
    if unsupported {
        loss.push(obj(vec![
            ("source", t("native")),
            ("path", t("/vocabularies/umf.postgresql.relationships")),
            ("value", copy_json(version.unwrap(), c)?),
            ("outcome", t("unknown")),
            ("reason", t("Unsupported classification vocabulary")),
        ]))
    }
    let mode = text(request, "mode").unwrap();
    let status = if mode == &u("strict") || conflict || unsupported {
        "blocked"
    } else {
        "classified"
    };
    let mut result = obj(vec![
        ("operation", t("classify-postgresql-relationships")),
        ("version", t("1.0.0")),
        ("status", t(status)),
        ("source", copy_json(source, c)?),
        ("request", copy_json(request, c)?),
        (
            "binding",
            obj(vec![
                ("id", t(EXT)),
                ("version", t("1.0.0")),
                ("nativeVersion", t("17.4")),
                ("subset", t(SUBSET)),
            ]),
        ),
        ("observations", Value::Array(observations)),
        ("residuals", Value::Array(loss.clone())),
        (
            "diagnostics",
            Value::Array(
                loss.iter()
                    .map(|r| {
                        obj(vec![
                            ("code", t("POSTGRESQL_RELATIONSHIP_RESIDUAL")),
                            ("path", get(r, "path").cloned().unwrap_or(t(""))),
                            ("message", get(r, "reason").cloned().unwrap_or(t(""))),
                            (
                                "severity",
                                t(if status == "blocked" {
                                    "error"
                                } else {
                                    "warning"
                                }),
                            ),
                        ])
                    })
                    .collect(),
            ),
        ),
    ]);
    if status == "classified" {
        let mut target = copy_json(source, c)?;
        let mut voc = copy_json(get(&target, "vocabularies").unwrap_or(&Value::Null), c)?;
        let current = get(&voc, EXT).cloned().unwrap_or(obj(vec![]));
        let mut v = copy_json(&current, c)?;
        set(&mut v, "version", t("1.0.0"))?;
        set(&mut voc, EXT, v)?;
        set(&mut target, "vocabularies", voc)?;
        let mut exts = match get(&target, "extensions") {
            Some(Value::Object(_)) => copy_json(get(&target, "extensions").unwrap(), c)?,
            _ => Value::Object(vec![]),
        };
        let mut meta = obj(vec![
            ("origin", t("classified")),
            ("binding", copy_json(get(&result, "binding").unwrap(), c)?),
            (
                "observations",
                copy_json(get(&result, "observations").unwrap_or(&Value::Null), c)?,
            ),
        ]);
        set(&mut exts, EXT, meta)?;
        set(&mut target, "extensions", exts)?;
        set(&mut result, "target", target)?;
    }
    validate(&result, &rt.result, c, "POSTGRESQL_RELATIONSHIP_RESULT")?;
    Ok(result)
}
pub fn classify(
    source: &Value,
    request: &Value,
    parser: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    classify_inner(&copy_json(source, c)?, &copy_json(request, c)?, parser, c)
}
pub fn verify(
    receipt: &Value,
    current: &Value,
    parser: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    validate(receipt, &rt.result, c, "POSTGRESQL_RELATIONSHIP_RECEIPT")?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(err(
            "POSTGRESQL_RELATIONSHIP_RECEIPT",
            "/status",
            "Classified receipt required",
        ));
    }
    let expected = classify_inner(
        get(receipt, "source").unwrap(),
        get(receipt, "request").unwrap(),
        parser,
        c,
    )?;
    if !equal(receipt, &expected, c)? {
        return Err(err(
            "POSTGRESQL_RELATIONSHIP_RECEIPT",
            "",
            "Receipt differs from retained native evidence",
        ));
    }
    if !equal(current, get(receipt, "target").unwrap(), c)? {
        return Err(err(
            "POSTGRESQL_RELATIONSHIP_STALE",
            "",
            "Current target differs from receipt",
        ));
    }
    copy_json(receipt, c)
}
pub fn recover(
    receipt: &Value,
    current: &Value,
    parser: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let checked = verify(receipt, current, parser, c)?;
    copy_json(
        get(get(&checked, "request").unwrap(), "nativeSource").unwrap(),
        c,
    )
}

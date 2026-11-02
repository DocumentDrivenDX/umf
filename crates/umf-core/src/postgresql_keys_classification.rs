// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native meaning for PostgreSQL observed key enforcement. Parser correlation
//! is supplied by the explicitly selected pinned PostgreSQL parser capability;
//! all UMF classification, admission, receipts, target construction and recovery
//! remain owned here.
use std::collections::BTreeSet;

use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    native_json::{NativeJsonNode, NativeJsonTree},
    postgresql_catalog as pg,
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
const SCHEMA: &str = include_str!("../../../spec/core/postgresql-key-classification.schema.json");
const PACKAGE: &str = include_str!("../../../spec/extensions/postgresql-keys/package.json");
const POSTGRESQL_PACKAGE: &str =
    include_str!("../../../spec/extensions/postgresql-catalog/package.json");
const CARDINALITY_PACKAGE: &str =
    include_str!("../../../spec/extensions/postgresql-cardinality/package.json");
const NATIVE_SCHEMA: &str =
    include_str!("../../../spec/extensions/postgresql-catalog/key-observations-v1.schema.json");
const CLASSIFICATION_EXT: &str = "umf.postgresql.keys";
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
        return Err(err("POSTGRESQL_KEY_TARGET", "", "Expected object"));
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
fn array<'a>(v: &'a Value, k: &str) -> Option<&'a [Value]> {
    match get(v, k) {
        Some(Value::Array(a)) => Some(a),
        _ => None,
    }
}
fn err(code: &str, path: &str, msg: &str) -> EngineError {
    EngineError::new(code, u(path), msg)
}
fn read(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}
fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canon(v: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
        match v {
            Value::Array(xs) => {
                let mut out = Vec::new();
                for x in xs {
                    c.charge_work(1, Utf16::default())?;
                    out.push(canon(x, c)?)
                }
                Ok(Value::Array(out))
            }
            Value::Object(xs) => {
                let mut out = Vec::new();
                for (k, v) in xs {
                    c.charge_work(k.len() + 1, Utf16::default())?;
                    out.push((k.clone(), canon(v, c)?))
                }
                out.sort_by(|a, b| a.0.cmp(&b.0));
                Ok(Value::Object(out))
            }
            _ => copy_json(v, c),
        }
    }
    Ok(canon(a, ctx)? == canon(b, ctx)?)
}
struct NoCallbacks;
impl Capabilities for NoCallbacks {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}
struct Runtime {
    engine: Engine,
    registry: Registry,
    result: CompiledSchema,
    request: CompiledSchema,
    correlation: CompiledSchema,
    native_schema: Value,
}
fn runtime(ctx: &mut Context<'_>) -> Result<Runtime, EngineError> {
    let core = |s: &str, c: &mut Context<'_>| read(s, c);
    let engine = Engine::new(
        ResourceSet::new(
            core(include_str!("../../../spec/core/schema.json"), ctx)?,
            core(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            core(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            core(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            core(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                ctx,
            )?,
        ),
        ctx,
    )?;
    let resources = engine.schema_resources_with_context(ctx)?;
    let package = read(PACKAGE, ctx)?;
    let mut registry = Registry::new();
    registry.register(
        &read(POSTGRESQL_PACKAGE, ctx)?,
        Some(47),
        engine.package_schema(),
        &resources,
        ctx,
    )?;
    registry.register(
        &read(CARDINALITY_PACKAGE, ctx)?,
        Some(48),
        engine.package_schema(),
        &resources,
        ctx,
    )?;
    registry.register(&package, Some(50), engine.package_schema(), &resources, ctx)?;
    let mut schemas = resources.clone();
    schemas.entries.push((
        u("urn:umf:native-json:0.1.0"),
        core(
            include_str!("../../../spec/core/native-json.schema.json"),
            ctx,
        )?,
    ));
    let schema = core(SCHEMA, ctx)?;
    schemas.entries.push((
        u("urn:umf:core:postgresql-key-classification:1.0.0"),
        schema.clone(),
    ));
    schemas.entries.push((
        u("urn:umf:postgresql:key-binding:1.0.0"),
        package.get_object_value("schema").unwrap_or(Value::Null),
    ));
    let native = core(NATIVE_SCHEMA, ctx)?;
    schemas.entries.push((
        u("urn:umf:postgresql:key-observations:1.0.0"),
        native.clone(),
    ));
    let result = CompiledSchema::compile(&schema, &schemas, ctx)?;
    let request = CompiledSchema::compile(
        get(
            get(&schema, "properties").unwrap_or(&Value::Null),
            "request",
        )
        .ok_or_else(|| err("SCHEMA", "", "Request schema missing"))?,
        &schemas,
        ctx,
    )?;
    let correlation_schema = core(
        include_str!("../../../spec/core/postgresql-key-catalog-correlation.schema.json"),
        ctx,
    )?;
    let correlation = CompiledSchema::compile(&correlation_schema, &schemas, ctx)?;
    Ok(Runtime {
        engine,
        registry,
        result,
        request,
        correlation,
        native_schema: native,
    })
}
trait ObjectValue {
    fn get_object_value(&self, key: &str) -> Option<Value>;
}
impl ObjectValue for Value {
    fn get_object_value(&self, key: &str) -> Option<Value> {
        get(self, key).cloned()
    }
}
fn validate(
    v: &Value,
    s: &CompiledSchema,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    if s.validate(v, ctx)?.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "",
            "Value does not match the pinned PostgreSQL key schema",
        ))
    }
}
fn validate_doc(v: &Value, r: &Runtime, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let mut caps = NoCallbacks;
    let x = r.engine.validate_document(v, &r.registry, &mut caps, ctx)?;
    if !x.valid || text(v, "umf") != Some(&u("0.10.0")) {
        return Err(err(
            "POSTGRESQL_KEY_VERSION",
            "",
            "Valid UMF 0.10.0 envelope required",
        ));
    }
    Ok(())
}
fn tagged_value(node: &NativeJsonNode, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    let kind = match node {
        NativeJsonNode::Null => "null",
        NativeJsonNode::Boolean(_) => "boolean",
        NativeJsonNode::String(_) => "string",
        NativeJsonNode::Number(_) => "number",
        NativeJsonNode::Array(_) => "array",
        NativeJsonNode::Object(_) => "object",
    };
    let mut fields = vec![(u("kind"), t(kind))];
    match node {
        NativeJsonNode::Null => {}
        NativeJsonNode::Boolean(v) => fields.push((u("value"), Value::Bool(*v))),
        NativeJsonNode::String(v) => fields.push((u("value"), Value::String(v.clone()))),
        NativeJsonNode::Number(v) => fields.push((u("value"), t(v))),
        NativeJsonNode::Array(items) => fields.push((
            u("items"),
            Value::Array(
                items
                    .iter()
                    .map(|v| tagged_value(v, ctx))
                    .collect::<Result<_, _>>()?,
            ),
        )),
        NativeJsonNode::Object(members) => fields.push((
            u("members"),
            Value::Object(
                members
                    .iter()
                    .map(|(k, v)| Ok((k.clone(), tagged_value(v, ctx)?)))
                    .collect::<Result<_, EngineError>>()?,
            ),
        )),
    }
    Ok(Value::Object(fields))
}
fn pointer_path(
    base: &Utf16,
    segment: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let mut escaped = Vec::new();
    for unit in segment.units() {
        match *unit {
            47 => escaped.extend([126, 49]),
            126 => escaped.extend([126, 48]),
            v => escaped.push(v),
        }
    }
    ctx.charge_work(
        base.len().saturating_add(escaped.len()).saturating_add(1),
        Utf16::default(),
    )?;
    let mut out = base.units().to_vec();
    out.push(47);
    out.extend(escaped);
    Ok(Utf16::new(out))
}
fn unknown_members(
    node: &NativeJsonNode,
    rule: &Value,
    path: &Utf16,
    out: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if let Some(Value::Array(branches)) = get(rule, "anyOf") {
        let selected = branches.iter().find(|branch| {
            let ty = get(branch, "type");
            if matches!(node, NativeJsonNode::Null) {
                matches!(ty,Some(Value::String(v)) if v==&u("null"))
            } else {
                !matches!(ty,Some(Value::String(v)) if v==&u("null"))
            }
        });
        if let Some(branch) = selected {
            unknown_members(node, branch, path, out, ctx)?
        }
        return Ok(());
    }
    match node {
        NativeJsonNode::Array(items) => {
            if let Some(item_rule) = get(rule, "items") {
                for (i, item) in items.iter().enumerate() {
                    let seg = u(&i.to_string());
                    let child = pointer_path(path, &seg, ctx)?;
                    unknown_members(item, item_rule, &child, out, ctx)?
                }
            }
        }
        NativeJsonNode::Object(members) => {
            if let Some(Value::Object(properties)) = get(rule, "properties") {
                for (key, value) in members {
                    ctx.charge_work(key.len().saturating_add(1), path.clone())?;
                    if let Some((_, child_rule)) = properties.iter().find(|(name, _)| name == key) {
                        let child = pointer_path(path, key, ctx)?;
                        unknown_members(value, child_rule, &child, out, ctx)?
                    } else {
                        let child = pointer_path(path, key, ctx)?;
                        out.push(obj(vec![("path",Value::String(child)),("value",tagged_value(value,ctx)?),("outcome",t("unknown")),("reason",t("Unknown native qualifier retained without interpretation")),("recovery",t("Original native catalog and supplement retained; authored key intent is not inferred"))]))
                    }
                }
            }
        }
        _ => {}
    }
    Ok(())
}

fn tagged_field<'a>(node: &'a Value, key: &str) -> Option<&'a Value> {
    if text(node, "kind") != Some(&u("object")) {
        return None;
    }
    get(get(node, "members")?, key)
}
fn tagged_text<'a>(node: &'a Value, key: &str) -> Option<&'a Utf16> {
    let value = tagged_field(node, key)?;
    (text(value, "kind") == Some(&u("string")))
        .then(|| text(value, "value"))
        .flatten()
}
fn tagged_items(node: &Value) -> Option<&[Value]> {
    (text(node, "kind") == Some(&u("array")))
        .then(|| array(node, "items"))
        .flatten()
}
fn quote_ident(s: &Utf16) -> Result<String, EngineError> {
    let raw = s
        .to_utf8()
        .map_err(|_| err("POSTGRESQL_KEY_CATALOG", "", "Invalid UTF-16 identifier"))?;
    Ok(format!("\"{}\"", raw.replace('"', "\"\"")))
}
fn query_entry(id: String, sql: String) -> Value {
    obj(vec![("id", t(&id)), ("sql", t(&sql))])
}
fn parser_queries(
    source: &Value,
    request: &Value,
    rt: &Runtime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    validate(request, &rt.request, ctx, "POSTGRESQL_KEY_REQUEST")?;
    validate_doc(source, rt, ctx)?;
    let native_source = text(request, "nativeSource").ok_or_else(|| {
        err(
            "POSTGRESQL_KEY_REQUEST",
            "/nativeSource",
            "Native source required",
        )
    })?;
    let supplement_text = text(request, "supplement").ok_or_else(|| {
        err(
            "POSTGRESQL_KEY_REQUEST",
            "/supplement",
            "Supplement required",
        )
    })?;
    let captured = pg::export_document(source, ctx)?;
    let native_tree = NativeJsonTree::parse_json(native_source.units(), ctx)?;
    let captured_tree = NativeJsonTree::parse_json(captured.units(), ctx)?;
    if native_tree.render_compact(ctx)? != captured_tree.render_compact(ctx)? {
        return Err(err(
            "POSTGRESQL_KEY_ARCHIVE",
            "/request/nativeSource",
            "Native source differs from retained catalog",
        ));
    }
    let inspected = pg::inspect_key_catalog(supplement_text, ctx)?;
    let indexes = array(&inspected, "indexes").ok_or_else(|| {
        err(
            "POSTGRESQL_KEY_CATALOG",
            "/indexes",
            "Index observations missing",
        )
    })?;
    let mut queries = Vec::new();
    for (i, index) in indexes.iter().enumerate() {
        let definition = text(index, "definition").ok_or_else(|| {
            err(
                "POSTGRESQL_KEY_CATALOG",
                "/indexes/definition",
                "Index definition missing",
            )
        })?;
        queries.push(query_entry(
            format!("index/{i}/definition"),
            definition.to_utf8().map_err(|_| {
                err(
                    "POSTGRESQL_KEY_CATALOG",
                    "/indexes/definition",
                    "Index definition contains invalid UTF-16",
                )
            })?,
        ));
        for key in ["predicate", "expressions"] {
            if let Some(Value::String(expr)) = get(index, key) {
                queries.push(query_entry(
                    format!("index/{i}/{key}"),
                    format!(
                        "SELECT {}",
                        expr.to_utf8().map_err(|_| err(
                            "POSTGRESQL_KEY_CATALOG",
                            "",
                            "Expression contains invalid UTF-16"
                        ))?
                    ),
                ));
            }
        }
        for key in ["parents", "children"] {
            for (j, name) in array(index, key).unwrap_or(&[]).iter().enumerate() {
                let name = match name {
                    Value::String(s) => s,
                    _ => {
                        return Err(err(
                            "POSTGRESQL_KEY_CATALOG",
                            "",
                            "Parent/child relation identity must be text",
                        ))
                    }
                };
                let relation = name.to_utf8().map_err(|_| {
                    err(
                        "POSTGRESQL_KEY_CATALOG",
                        "",
                        "Relation identity contains invalid UTF-16",
                    )
                })?;
                queries.push(query_entry(
                    format!("index/{i}/{key}/{j}"),
                    format!("TABLE {relation}"),
                ));
            }
        }
        let relations = native_relations(source, ctx)?;
        let relation = relations.iter().find(|relation| {
            text(relation, "schema") == text(index, "schema")
                && text(relation, "name") == text(index, "table")
        });
        for (j, component) in array(index, "components").unwrap_or(&[]).iter().enumerate() {
            let attribute = get(component, "attribute")
                .and_then(|value| match value {
                    Value::Number(n) if *n >= 0.0 && n.fract() == 0.0 => Some(*n as i64),
                    _ => None,
                })
                .unwrap_or(0);
            if attribute > 0 {
                if let Some(column) = relation
                    .and_then(|relation| array(relation, "columns"))
                    .and_then(|columns| {
                        columns.iter().find(|column| {
                            get(column, "position").and_then(|value| match value {
                                Value::Number(n) if n.fract() == 0.0 => Some(*n as i64),
                                _ => None,
                            }) == Some(attribute)
                        })
                    })
                {
                    if let Some(Value::String(collation)) = get(column, "collation") {
                        let spelling = collation.to_utf8().map_err(|_| {
                            err(
                                "POSTGRESQL_KEY_CATALOG",
                                "",
                                "Column collation contains invalid UTF-16",
                            )
                        })?;
                        queries.push(query_entry(
                            format!("index/{i}/column-collation/{j}"),
                            format!("SELECT '' COLLATE {spelling}"),
                        ));
                    }
                }
            }
        }
    }
    // Derive the inherited-child inventory from native relation parents. These
    // parser requests are rooted in retained native observations, not in the
    // caller's supplement, so Rust can compare both directions of the graph.
    for (ri, relation) in native_relations(source, ctx)?.iter().enumerate() {
        for (j, parent) in array(relation, "parents").unwrap_or(&[]).iter().enumerate() {
            let parent = match parent {
                Value::String(value) => value,
                _ => {
                    return Err(err(
                        "POSTGRESQL_KEY_CATALOG",
                        "/snapshot/relations/parents",
                        "Parent relation identity must be text",
                    ))
                }
            };
            let spelling = parent.to_utf8().map_err(|_| {
                err(
                    "POSTGRESQL_KEY_CATALOG",
                    "/snapshot/relations/parents",
                    "Parent relation identity contains invalid UTF-16",
                )
            })?;
            queries.push(query_entry(
                format!("relation/{ri}/parents/{j}"),
                format!("TABLE {spelling}"),
            ));
        }
    }
    Ok(obj(vec![("queries", Value::Array(queries))]))
}
fn response_ast<'a>(responses: &'a Value, id: &str) -> Option<&'a Value> {
    array(responses, "responses")?
        .iter()
        .find(|row| text(row, "id") == Some(&u(id)))
        .and_then(|row| get(row, "ast"))
}
fn one_statement(ast: &Value) -> Option<&Value> {
    if get(ast, "version") != Some(&Value::Number(170004.0)) {
        return None;
    }
    let statements = array(ast, "stmts")?;
    if statements.len() != 1 {
        return None;
    }
    get(&statements[0], "stmt")
}
fn ast_name_parts(value: &Value) -> Vec<Utf16> {
    let Value::Array(parts) = value else {
        return Vec::new();
    };
    parts
        .iter()
        .filter_map(|part| {
            get(part, "String")
                .and_then(|string| text(string, "sval"))
                .cloned()
        })
        .collect()
}
fn resolved_table_reference(
    parser: &Value,
    id: &str,
    relations: &[Value],
) -> Result<(Utf16, Utf16), EngineError> {
    let range = response_ast(parser, id)
        .and_then(one_statement)
        .and_then(|statement| get(statement, "SelectStmt"))
        .and_then(|statement| array(statement, "fromClause"))
        .and_then(|from| from.first())
        .and_then(|node| get(node, "RangeVar"))
        .ok_or_else(|| {
            err(
                "POSTGRESQL_KEY_PARSER",
                "/responses",
                "Relation parser result is malformed",
            )
        })?;
    let name = text(range, "relname").ok_or_else(|| {
        err(
            "POSTGRESQL_KEY_PARSER",
            "/responses",
            "Relation name is missing",
        )
    })?;
    let schema = text(range, "schemaname");
    let found = relations
        .iter()
        .filter(|relation| {
            text(relation, "name") == Some(name)
                && schema.is_none_or(|schema| text(relation, "schema") == Some(schema))
        })
        .collect::<Vec<_>>();
    if found.len() != 1 {
        return Err(err(
            "POSTGRESQL_KEY_CORRELATION",
            "/indexes/relations",
            "Relation reference is unresolved or ambiguous",
        ));
    }
    Ok((
        text(found[0], "schema").cloned().ok_or_else(|| {
            err(
                "POSTGRESQL_KEY_CORRELATION",
                "/indexes/relations",
                "Resolved relation schema is missing",
            )
        })?,
        text(found[0], "name").cloned().ok_or_else(|| {
            err(
                "POSTGRESQL_KEY_CORRELATION",
                "/indexes/relations",
                "Resolved relation name is missing",
            )
        })?,
    ))
}
fn canonical_ast(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    match v {
        Value::Array(xs) => Ok(Value::Array(
            xs.iter()
                .map(|x| canonical_ast(x, ctx))
                .collect::<Result<_, _>>()?,
        )),
        Value::Object(fields) => {
            let mut out = Vec::new();
            for (key, value) in fields {
                if ["location", "stmt_location", "stmt_len"]
                    .contains(&key.to_utf8().unwrap_or_default().as_str())
                {
                    continue;
                }
                ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
                out.push((key.clone(), canonical_ast(value, ctx)?));
            }
            out.sort_by(|a, b| a.0.cmp(&b.0));
            Ok(Value::Object(out))
        }
        _ => copy_json(v, ctx),
    }
}
fn native_relations(source: &Value, ctx: &mut Context<'_>) -> Result<Vec<Value>, EngineError> {
    let tagged = pg::get_node(source, &u("/snapshot/relations"), ctx)?;
    let Some(items) = tagged_items(&tagged) else {
        return Err(err(
            "POSTGRESQL_KEY_CORRELATION",
            "/snapshot/relations",
            "Relation inventory is missing",
        ));
    };
    items.iter().map(|v| tagged_to_plain(v, ctx)).collect()
}
fn tagged_to_plain(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match text(v, "kind") {
        Some(k) if k == &u("null") => Ok(Value::Null),
        Some(k) if k == &u("boolean") => Ok(get(v, "value").cloned().unwrap_or(Value::Null)),
        Some(k) if k == &u("string") => Ok(get(v, "value").cloned().unwrap_or(Value::Null)),
        Some(k) if k == &u("number") => {
            let token = text(v, "value")
                .and_then(|s| s.to_utf8().ok())
                .ok_or_else(|| {
                    err(
                        "POSTGRESQL_KEY_CORRELATION",
                        "",
                        "Native numeric token missing",
                    )
                })?;
            let n = token.parse::<f64>().map_err(|_| {
                err(
                    "POSTGRESQL_KEY_CORRELATION",
                    "",
                    "Native numeric token is invalid",
                )
            })?;
            if !n.is_finite() {
                return Err(err(
                    "POSTGRESQL_KEY_CORRELATION",
                    "",
                    "Native numeric token is out of range",
                ));
            }
            Ok(Value::Number(n))
        }
        Some(k) if k == &u("array") => Ok(Value::Array(
            tagged_items(v)
                .unwrap_or(&[])
                .iter()
                .map(|x| tagged_to_plain(x, ctx))
                .collect::<Result<_, _>>()?,
        )),
        Some(k) if k == &u("object") => {
            let m = get(v, "members")
                .and_then(|x| {
                    if let Value::Object(m) = x {
                        Some(m)
                    } else {
                        None
                    }
                })
                .ok_or_else(|| err("POSTGRESQL_KEY_CORRELATION", "", "Native members missing"))?;
            let mut out = Vec::with_capacity(m.len());
            for (k, v) in m {
                out.push((k.clone(), tagged_to_plain(v, ctx)?));
            }
            Ok(Value::Object(out))
        }
        _ => Err(err(
            "POSTGRESQL_KEY_CORRELATION",
            "",
            "Malformed native tagged value",
        )),
    }
}
fn correlate_keys(
    source: &Value,
    request: &Value,
    parser: &Value,
    rt: &Runtime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let plan = parser_queries(source, request, rt, ctx)?;
    let queries = array(&plan, "queries").unwrap_or(&[]);
    let responses = array(parser, "responses").ok_or_else(|| {
        err(
            "POSTGRESQL_KEY_PARSER",
            "/responses",
            "Parser responses are required",
        )
    })?;
    if responses.len() != queries.len() {
        return Err(err(
            "POSTGRESQL_KEY_PARSER",
            "/responses",
            "Parser response count differs from the prepared query set",
        ));
    }
    let mut response_ids = BTreeSet::<Utf16>::new();
    for response in responses {
        let id = text(response, "id").ok_or_else(|| {
            err(
                "POSTGRESQL_KEY_PARSER",
                "/responses",
                "Parser response identity is missing",
            )
        })?;
        if !response_ids.insert(id.clone()) {
            return Err(err(
                "POSTGRESQL_KEY_PARSER",
                "/responses",
                "Duplicate parser response identity",
            ));
        }
        let query = queries
            .iter()
            .find(|q| text(q, "id") == Some(id))
            .ok_or_else(|| {
                err(
                    "POSTGRESQL_KEY_PARSER",
                    "/responses",
                    "Parser response is not part of the prepared query set",
                )
            })?;
        if text(response, "sql") != text(query, "sql")
            || one_statement(get(response, "ast").unwrap_or(&Value::Null)).is_none()
        {
            return Err(err(
                "POSTGRESQL_KEY_PARSER",
                "/responses",
                "Parser result is not bound to its prepared SQL request",
            ));
        }
    }
    let supplement = text(request, "supplement").unwrap();
    let inspected = pg::inspect_key_catalog(supplement, ctx)?;
    let indexes = array(&inspected, "indexes").unwrap_or(&[]);
    let relations = native_relations(source, ctx)?;
    let native_collations = pg::get_node(source, &u("/snapshot/collations"), ctx)?;
    let native_collations = if text(&native_collations, "kind") == Some(&u("null")) {
        Vec::new()
    } else {
        match tagged_to_plain(&native_collations, ctx)? {
            Value::Array(items) => items,
            _ => {
                return Err(err(
                    "POSTGRESQL_KEY_CORRELATION",
                    "/snapshot/collations",
                    "Collation inventory is malformed",
                ))
            }
        }
    };
    let mut native_children =
        std::collections::BTreeMap::<(Utf16, Utf16), Vec<(Utf16, Utf16)>>::new();
    for (ri, child) in relations.iter().enumerate() {
        let child_identity = (
            text(child, "schema").cloned().ok_or_else(|| {
                err(
                    "POSTGRESQL_KEY_CORRELATION",
                    "",
                    "Native relation schema missing",
                )
            })?,
            text(child, "name").cloned().ok_or_else(|| {
                err(
                    "POSTGRESQL_KEY_CORRELATION",
                    "",
                    "Native relation name missing",
                )
            })?,
        );
        for (j, _) in array(child, "parents").unwrap_or(&[]).iter().enumerate() {
            let parent = resolved_table_reference(
                parser,
                &format!("relation/{ri}/parents/{j}"),
                &relations,
            )?;
            native_children
                .entry(parent)
                .or_default()
                .push(child_identity.clone());
        }
    }
    let mut matches = Vec::new();
    let mut seen = BTreeSet::<(Utf16, Utf16, Utf16)>::new();
    for (ri, relation) in relations.iter().enumerate() {
        let schema = text(relation, "schema").ok_or_else(|| {
            err(
                "POSTGRESQL_KEY_CORRELATION",
                "",
                "Native relation schema missing",
            )
        })?;
        let table = text(relation, "name").ok_or_else(|| {
            err(
                "POSTGRESQL_KEY_CORRELATION",
                "",
                "Native relation name missing",
            )
        })?;
        let native_indexes = array(relation, "indexes").unwrap_or(&[]);
        let observed = indexes
            .iter()
            .enumerate()
            .filter(|(_, i)| text(i, "schema") == Some(schema) && text(i, "table") == Some(table))
            .collect::<Vec<_>>();
        if native_indexes.len() != observed.len() {
            return Err(err(
                "POSTGRESQL_KEY_CORRELATION",
                "/indexes",
                "Native index inventory coverage differs",
            ));
        }
        let mut used = BTreeSet::new();
        for (index_i, index) in observed.iter().copied() {
            let id = (
                schema.clone(),
                table.clone(),
                text(index, "index").cloned().ok_or_else(|| {
                    err("POSTGRESQL_KEY_CORRELATION", "", "Index identity missing")
                })?,
            );
            if !seen.insert(id.clone()) {
                return Err(err(
                    "POSTGRESQL_KEY_CORRELATION",
                    "/indexes",
                    "Duplicate key identity",
                ));
            }
            let definition = text(index, "definition")
                .ok_or_else(|| err("POSTGRESQL_KEY_CORRELATION", "", "Index definition missing"))?;
            let candidates = native_indexes
                .iter()
                .enumerate()
                .filter(|(_, n)| text(n, "definition") == Some(definition))
                .collect::<Vec<_>>();
            if candidates.len() != 1 || !used.insert(candidates[0].0) {
                return Err(err(
                    "POSTGRESQL_KEY_CORRELATION",
                    "/indexes",
                    "Index definition is missing or ambiguous in retained catalog",
                ));
            }
            let (ni, native) = candidates[0];
            for key in ["valid", "ready"] {
                if get(native, key) != get(index, key) {
                    return Err(err(
                        "POSTGRESQL_KEY_CORRELATION",
                        "/indexes",
                        "Native index state disagrees",
                    ));
                }
            }
            if text(relation, "kind") != text(index, "relationKind")
                || !equal(
                    &Value::Array(array(relation, "parents").unwrap_or(&[]).to_vec()),
                    &Value::Array(array(index, "parents").unwrap_or(&[]).to_vec()),
                    ctx,
                )?
            {
                return Err(err(
                    "POSTGRESQL_KEY_CORRELATION",
                    "/indexes",
                    "Native relation kind or parent inventory disagrees",
                ));
            }
            for edge in ["parents", "children"] {
                for (edge_index, _) in array(index, edge).unwrap_or(&[]).iter().enumerate() {
                    let _ = resolved_table_reference(
                        parser,
                        &format!("index/{index_i}/{edge}/{edge_index}"),
                        &relations,
                    )?;
                }
            }
            let mut observed_children = array(index, "children")
                .unwrap_or(&[])
                .iter()
                .enumerate()
                .map(|(edge_index, _)| {
                    resolved_table_reference(
                        parser,
                        &format!("index/{index_i}/children/{edge_index}"),
                        &relations,
                    )
                })
                .collect::<Result<Vec<_>, _>>()?;
            let relation_identity = (schema.clone(), table.clone());
            let mut expected_children = native_children
                .get(&relation_identity)
                .cloned()
                .unwrap_or_default();
            observed_children.sort();
            expected_children.sort();
            if observed_children != expected_children {
                return Err(err(
                    "POSTGRESQL_KEY_CORRELATION",
                    "/indexes/children",
                    "Native child inventory differs",
                ));
            }
            let ast = one_statement(
                response_ast(parser, &format!("index/{}/definition", index_i))
                    .unwrap_or(&Value::Null),
            )
            .and_then(|stmt| get(stmt, "IndexStmt"))
            .ok_or_else(|| {
                err(
                    "POSTGRESQL_KEY_PARSER",
                    "/responses",
                    "Index definition did not parse as an IndexStmt",
                )
            })?;
            if text(ast, "idxname") != text(index, "index")
                || text(get(ast, "relation").unwrap_or(&Value::Null), "relname") != Some(table)
                || text(get(ast, "relation").unwrap_or(&Value::Null), "schemaname") != Some(schema)
                || text(ast, "accessMethod") != text(index, "accessMethod")
                || get(ast, "unique").unwrap_or(&Value::Bool(false))
                    != get(index, "unique").unwrap_or(&Value::Bool(false))
                || get(ast, "nulls_not_distinct").unwrap_or(&Value::Bool(false))
                    != get(index, "nullsNotDistinct").unwrap_or(&Value::Bool(false))
            {
                return Err(err(
                    "POSTGRESQL_KEY_CORRELATION",
                    "/indexes/definition",
                    "Parsed IndexStmt identity or semantics disagree with the supplement",
                ));
            }
            if matches!(get(ast, "whereClause"), None | Some(Value::Null))
                != matches!(get(index, "predicate"), None | Some(Value::Null))
            {
                return Err(err(
                    "POSTGRESQL_KEY_CORRELATION",
                    "/indexes/predicate",
                    "Parsed predicate presence disagrees",
                ));
            }
            let constraints = array(relation, "constraints")
                .unwrap_or(&[])
                .iter()
                .filter(|c| matches!(text(c,"kind"),Some(k) if k==&u("p")||k==&u("u")))
                .collect::<Vec<_>>();
            if let Some(declared) = get(index, "constraint").filter(|v| !matches!(v, Value::Null)) {
                let name = text(declared, "name").ok_or_else(|| {
                    err(
                        "POSTGRESQL_KEY_CORRELATION",
                        "/indexes/constraint",
                        "Constraint name missing",
                    )
                })?;
                let found = constraints
                    .iter()
                    .filter(|c| text(c, "name") == Some(name))
                    .collect::<Vec<_>>();
                if found.len() != 1 || !equal(declared, found[0], ctx)? {
                    return Err(err(
                        "POSTGRESQL_KEY_CORRELATION",
                        "/indexes/constraint",
                        "Constraint observation disagrees",
                    ));
                }
                if get(index, "immediate") == get(declared, "deferrable") {
                    return Err(err(
                        "POSTGRESQL_KEY_CORRELATION",
                        "/indexes/constraint",
                        "Constraint timing disagrees",
                    ));
                }
            } else if get(index, "immediate") != Some(&Value::Bool(true))
                || get(index, "primary") == Some(&Value::Bool(true))
            {
                return Err(err(
                    "POSTGRESQL_KEY_CORRELATION",
                    "/indexes/constraint",
                    "Standalone index claims primary or deferred semantics",
                ));
            }
            if let Some(Value::String(_)) = get(index, "predicate") {
                let evidence = response_ast(parser, &format!("index/{}/predicate", index_i))
                    .and_then(one_statement)
                    .and_then(|s| get(s, "SelectStmt"))
                    .and_then(|s| array(s, "targetList"))
                    .and_then(|xs| xs.first())
                    .and_then(|x| get(x, "ResTarget"))
                    .and_then(|x| get(x, "val"));
                if let Some(expected) = evidence {
                    if !equal(
                        &canonical_ast(expected, ctx)?,
                        &canonical_ast(get(ast, "whereClause").unwrap_or(&Value::Null), ctx)?,
                        ctx,
                    )? {
                        return Err(err(
                            "POSTGRESQL_KEY_CORRELATION",
                            "/indexes/predicate",
                            "Parsed predicate disagrees with the index definition",
                        ));
                    }
                }
            }
            let key_count = get(index, "keyCount")
                .and_then(|v| {
                    if let Value::Number(n) = v {
                        Some(*n as usize)
                    } else {
                        None
                    }
                })
                .unwrap_or(0);
            let components = array(index, "components").unwrap_or(&[]);
            let params = array(ast, "indexParams").unwrap_or(&[]);
            let includes = array(ast, "indexIncludingParams").unwrap_or(&[]);
            let mut all = params.to_vec();
            all.extend_from_slice(includes);
            if params.len() != key_count || all.len() != components.len() {
                return Err(err(
                    "POSTGRESQL_KEY_CORRELATION",
                    "/indexes/components",
                    "Parsed key and include component counts disagree",
                ));
            }
            let observed_expressions = all
                .iter()
                .filter_map(|parameter| {
                    get(parameter, "IndexElem")
                        .and_then(|element| get(element, "expr"))
                        .cloned()
                })
                .collect::<Vec<_>>();
            let declared_expressions = match get(index, "expressions") {
                Some(Value::String(_)) => {
                    response_ast(parser, &format!("index/{index_i}/expressions"))
                        .and_then(one_statement)
                        .and_then(|statement| get(statement, "SelectStmt"))
                        .and_then(|statement| array(statement, "targetList"))
                        .map(|targets| {
                            targets
                                .iter()
                                .filter_map(|target| {
                                    get(target, "ResTarget")
                                        .and_then(|target| get(target, "val"))
                                        .cloned()
                                })
                                .collect::<Vec<_>>()
                        })
                        .ok_or_else(|| {
                            err(
                                "POSTGRESQL_KEY_PARSER",
                                "/indexes/expressions",
                                "Expression parser result is malformed",
                            )
                        })?
                }
                _ => Vec::new(),
            };
            if !equal(
                &canonical_ast(&Value::Array(observed_expressions), ctx)?,
                &canonical_ast(&Value::Array(declared_expressions), ctx)?,
                ctx,
            )? {
                return Err(err(
                    "POSTGRESQL_KEY_CORRELATION",
                    "/indexes/expressions",
                    "Parsed expression components disagree",
                ));
            }
            let native_columns = array(relation, "columns").unwrap_or(&[]);
            let mut paths = Vec::new();
            for (ci, c) in components.iter().enumerate() {
                let attr = get(c, "attribute")
                    .and_then(|v| {
                        if let Value::Number(n) = v {
                            Some(*n as i64)
                        } else {
                            None
                        }
                    })
                    .unwrap_or(0);
                let parsed = get(&all[ci], "IndexElem").ok_or_else(|| {
                    err(
                        "POSTGRESQL_KEY_PARSER",
                        "/indexes/components",
                        "Index component syntax missing",
                    )
                })?;
                if attr == 0 {
                    if get(parsed, "name").is_some() || get(parsed, "expr").is_none() {
                        return Err(err(
                            "POSTGRESQL_KEY_CORRELATION",
                            "/indexes/components",
                            "Expression component syntax disagrees",
                        ));
                    }
                    paths.push(Value::Null);
                    continue;
                }
                let name = text(c, "name").ok_or_else(|| {
                    err(
                        "POSTGRESQL_KEY_CORRELATION",
                        "/indexes/components",
                        "Column component name missing",
                    )
                })?;
                if text(parsed, "name") != Some(name) || get(parsed, "expr").is_some() {
                    return Err(err(
                        "POSTGRESQL_KEY_CORRELATION",
                        "/indexes/components",
                        "Parsed column component disagrees",
                    ));
                }
                if ci < key_count {
                    if let Some(collation) =
                        get(c, "collation").filter(|value| !matches!(value, Value::Null))
                    {
                        let schema_name = text(collation, "schema").ok_or_else(|| {
                            err(
                                "POSTGRESQL_KEY_CORRELATION",
                                "/indexes/components/collation",
                                "Collation schema missing",
                            )
                        })?;
                        let coll_name = text(collation, "name").ok_or_else(|| {
                            err(
                                "POSTGRESQL_KEY_CORRELATION",
                                "/indexes/components/collation",
                                "Collation name missing",
                            )
                        })?;
                        let definitions = native_collations
                            .iter()
                            .filter(|definition| {
                                text(definition, "schema") == Some(schema_name)
                                    && text(definition, "name") == Some(coll_name)
                            })
                            .collect::<Vec<_>>();
                        let mut disagrees = false;
                        if definitions.len() == 1 {
                            let Value::Object(observed) = collation else {
                                return Err(err(
                                    "POSTGRESQL_KEY_CORRELATION",
                                    "/indexes/components/collation",
                                    "Collation observation must be an object",
                                ));
                            };
                            let Value::Object(definition) = definitions[0] else {
                                return Err(err(
                                    "POSTGRESQL_KEY_CORRELATION",
                                    "/indexes/components/collation",
                                    "Collation definition must be an object",
                                ));
                            };
                            for (key, value) in observed {
                                let found = definition
                                    .iter()
                                    .find(|(name, _)| name == key)
                                    .map(|(_, value)| value);
                                if let Some(candidate) = found {
                                    if !equal(candidate, value, ctx)? {
                                        disagrees = true;
                                        break;
                                    }
                                } else {
                                    disagrees = true;
                                    break;
                                }
                            }
                        }
                        if definitions.len() > 1 || disagrees {
                            return Err(err(
                                "POSTGRESQL_KEY_CORRELATION",
                                "/indexes/components/collation",
                                "Collation catalog observations disagree",
                            ));
                        }
                        if let Some(collation_parts) = get(parsed, "collation") {
                            let names = ast_name_parts(collation_parts);
                            if names.last() != Some(coll_name)
                                || names.len() == 2 && names.first() != Some(schema_name)
                                || names.len() > 2
                            {
                                return Err(err(
                                    "POSTGRESQL_KEY_CORRELATION",
                                    "/indexes/components/collation",
                                    "Parsed explicit collation disagrees",
                                ));
                            }
                        }
                    } else if get(parsed, "collation")
                        .is_some_and(|value| !matches!(value, Value::Null))
                    {
                        return Err(err(
                            "POSTGRESQL_KEY_CORRELATION",
                            "/indexes/components/collation",
                            "Parsed collation has no matching observation",
                        ));
                    }
                    if let Some(opclass_parts) = get(parsed, "opclass") {
                        let names = ast_name_parts(opclass_parts);
                        let observed =
                            text(c, "operatorClass").and_then(|value| value.to_utf8().ok());
                        let parsed_name = names
                            .iter()
                            .map(|part| part.to_utf8())
                            .collect::<Result<Vec<_>, _>>()
                            .ok()
                            .map(|parts| parts.join("."));
                        let agrees =
                            match (observed.as_deref(), parsed_name.as_deref(), names.len()) {
                                (Some(actual), Some(name), 1) => {
                                    actual.ends_with(&format!(".{name}"))
                                }
                                (Some(actual), Some(name), 2) => actual == name,
                                _ => false,
                            };
                        if !agrees {
                            return Err(err(
                                "POSTGRESQL_KEY_CORRELATION",
                                "/indexes/components/operatorClass",
                                "Parsed operator class disagrees",
                            ));
                        }
                    }
                }
                let found = native_columns
                    .iter()
                    .enumerate()
                    .filter(|(_, col)| {
                        text(col, "name") == Some(name)
                            && get(col, "position").and_then(|n| {
                                if let Value::Number(x) = n {
                                    Some(*x as i64)
                                } else {
                                    None
                                }
                            }) == Some(attr)
                    })
                    .collect::<Vec<_>>();
                if found.len() != 1 {
                    return Err(err(
                        "POSTGRESQL_KEY_CORRELATION",
                        "/indexes/components",
                        "Column component does not resolve uniquely",
                    ));
                }
                let (col_i, col) = found[0];
                if ci < key_count && get(parsed, "collation").is_none() {
                    let native_collation =
                        get(col, "collation").filter(|value| !matches!(value, Value::Null));
                    let observed_collation =
                        get(c, "collation").filter(|value| !matches!(value, Value::Null));
                    if native_collation.is_some() != observed_collation.is_some() {
                        return Err(err(
                            "POSTGRESQL_KEY_CORRELATION",
                            "/indexes/components/collation",
                            "Default column/index collation presence disagrees",
                        ));
                    }
                    if let (Some(Value::String(_)), Some(observed)) =
                        (native_collation, observed_collation)
                    {
                        let parsed =
                            response_ast(parser, &format!("index/{index_i}/column-collation/{ci}"))
                                .and_then(one_statement)
                                .and_then(|statement| get(statement, "SelectStmt"))
                                .and_then(|statement| array(statement, "targetList"))
                                .and_then(|targets| targets.first())
                                .and_then(|target| get(target, "ResTarget"))
                                .and_then(|target| get(target, "val"))
                                .and_then(|value| get(value, "CollateClause"))
                                .and_then(|clause| get(clause, "collname"))
                                .map(ast_name_parts)
                                .ok_or_else(|| {
                                    err(
                                        "POSTGRESQL_KEY_PARSER",
                                        "/indexes/components/collation",
                                        "Column collation parser evidence is malformed",
                                    )
                                })?;
                        let schema = text(observed, "schema");
                        let name = text(observed, "name");
                        if parsed.last() != name
                            || parsed.len() == 2 && parsed.first() != schema
                            || parsed.len() > 2
                        {
                            return Err(err(
                                "POSTGRESQL_KEY_CORRELATION",
                                "/indexes/components/collation",
                                "Default column/index collation identity disagrees",
                            ));
                        }
                    }
                }
                let ty = get(col, "nativeType").ok_or_else(|| {
                    err(
                        "POSTGRESQL_KEY_CORRELATION",
                        "/indexes/components",
                        "Native column type missing",
                    )
                })?;
                for (native_key, supp_key) in [
                    ("schema", "typeSchema"),
                    ("name", "typeName"),
                    ("kind", "typeKind"),
                ] {
                    if text(ty, native_key) != text(c, supp_key) {
                        return Err(err(
                            "POSTGRESQL_KEY_CORRELATION",
                            "/indexes/components",
                            "Column type identity disagrees",
                        ));
                    }
                }
                if get(col, "notNull") != get(c, "notNull") {
                    return Err(err(
                        "POSTGRESQL_KEY_CORRELATION",
                        "/indexes/components",
                        "Column nullability disagrees",
                    ));
                }
                paths.push(t(&format!("/snapshot/relations/{ri}/columns/{col_i}")));
            }
            matches.push(obj(vec![
                (
                    "identity",
                    obj(vec![
                        ("schema", Value::String(id.0)),
                        ("table", Value::String(id.1)),
                        ("index", Value::String(id.2)),
                    ]),
                ),
                ("relationPath", t(&format!("/snapshot/relations/{ri}"))),
                (
                    "indexPath",
                    t(&format!("/snapshot/relations/{ri}/indexes/{ni}")),
                ),
                ("componentPaths", Value::Array(paths)),
            ]));
        }
        let constraints = array(relation, "constraints")
            .unwrap_or(&[])
            .iter()
            .filter(|c| matches!(text(c,"kind"),Some(k) if k==&u("p")||k==&u("u")))
            .collect::<Vec<_>>();
        let native_constraints = observed
            .iter()
            .map(|(_, i)| *i)
            .filter(|i| get(*i, "constraint").is_some_and(|v| !matches!(v, Value::Null)))
            .collect::<Vec<_>>();
        if constraints.len() != native_constraints.len()
            || constraints.iter().any(|c| {
                let name = text(c, "name");
                native_constraints
                    .iter()
                    .filter(|i| text(get(*i, "constraint").unwrap_or(&Value::Null), "name") == name)
                    .count()
                    != 1
            })
        {
            return Err(err(
                "POSTGRESQL_KEY_CORRELATION",
                "/indexes",
                "Primary/unique constraint inventory coverage differs",
            ));
        }
    }
    if matches.len() != indexes.len() {
        return Err(err(
            "POSTGRESQL_KEY_CORRELATION",
            "/indexes",
            "Supplement index inventory differs from retained catalog",
        ));
    }
    Ok(obj(vec![
        ("nativeSupplement", copy_json(get(request, "supplement").unwrap(), ctx)?),
        ("nativeCatalog", Value::String(pg::export_document(source, ctx)?)),
        (
            "root",
            copy_json(get(&inspected, "root").unwrap_or(&Value::Null), ctx)?,
        ),
        ("matches", Value::Array(matches)),
        ("sameSnapshotVerified", Value::Bool(false)),
        ("authenticated", Value::Bool(false)),
        ("idealEqualityVerified", Value::Bool(false)),
    ]))
}
fn classify_inner(
    source: &Value,
    request: &Value,
    parser_responses: &Value,
    rt: &Runtime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    validate(request, &rt.request, ctx, "POSTGRESQL_KEY_REQUEST")?;
    let correlation = correlate_keys(source, request, parser_responses, rt, ctx)?;
    validate(
        &correlation,
        &rt.correlation,
        ctx,
        "POSTGRESQL_KEY_CORRELATION",
    )?;
    validate_doc(source, rt, ctx)?;
    let native_source = text(request, "nativeSource").ok_or_else(|| {
        err(
            "POSTGRESQL_KEY_REQUEST",
            "/nativeSource",
            "Native source required",
        )
    })?;
    let supplement = text(request, "supplement").ok_or_else(|| {
        err(
            "POSTGRESQL_KEY_REQUEST",
            "/supplement",
            "Supplement required",
        )
    })?;
    let captured = pg::export_document(source, ctx)?;
    let native_tree = crate::native_json::NativeJsonTree::parse_json(native_source.units(), ctx)?;
    let captured_tree = crate::native_json::NativeJsonTree::parse_json(captured.units(), ctx)?;
    if native_tree.render_compact(ctx)? != captured_tree.render_compact(ctx)? {
        return Err(err(
            "POSTGRESQL_KEY_ARCHIVE",
            "/request/nativeSource",
            "Native source differs from retained catalog",
        ));
    }
    if text(&correlation, "nativeSupplement") != Some(supplement)
        || text(&correlation, "nativeCatalog") != Some(&captured)
    {
        return Err(err(
            "POSTGRESQL_KEY_CORRELATION",
            "/correlation",
            "Correlation does not retain these exact native sources",
        ));
    }
    let inspected = pg::inspect_key_catalog(supplement, ctx)?;
    if !equal(
        get(&correlation, "root").unwrap_or(&Value::Null),
        get(&inspected, "root").unwrap_or(&Value::Null),
        ctx,
    )? {
        return Err(err(
            "POSTGRESQL_KEY_CORRELATION",
            "/correlation/root",
            "Correlated supplement root differs",
        ));
    }
    let indexes = array(&inspected, "indexes").ok_or_else(|| {
        err(
            "POSTGRESQL_KEY_CATALOG",
            "/indexes",
            "Index observations missing",
        )
    })?;
    let matches = array(&correlation, "matches").ok_or_else(|| {
        err(
            "POSTGRESQL_KEY_CORRELATION",
            "/matches",
            "Correlation matches missing",
        )
    })?;
    if indexes.len() != matches.len() {
        return Err(err(
            "POSTGRESQL_KEY_CORRELATION",
            "/matches",
            "Correlated index inventory differs",
        ));
    }
    let capture = pg::catalog_from_document(source, ctx)?;
    if capture.state() != &u("captured") {
        return Err(err(
            "POSTGRESQL_KEY_CORRELATION",
            "",
            "Modified catalog cannot establish observation correspondence",
        ));
    }
    let columns = capture.columns(ctx)?;
    let mut result=obj(vec![("operation",t("classify-postgresql-keys")),("version",t("1.0.0")),("status",t("classified")),("outcome",t("exact")),("source",copy_json(source,ctx)?),("request",copy_json(request,ctx)?),("binding",obj(vec![("id",t("umf.postgresql.keys")),("version",t("1.0.0")),("nativeVersion",t("17.4")),("subset",t("Correlated captured indexes over relations including descendants; observed enforcement/equality only, no authored identity, authentication, exact-input conversion or native equivalence"))])),("observations",Value::Array(vec![])),("residuals",Value::Array(vec![])),("diagnostics",Value::Array(vec![]))]);
    let mut residuals = Vec::new();
    let native_tree =
        NativeJsonTree::from_tagged_value(get(&inspected, "root").unwrap_or(&Value::Null), ctx)?;
    unknown_members(
        native_tree.root(),
        &rt.native_schema,
        &u("/supplement"),
        &mut residuals,
        ctx,
    )?;
    let mut observations = Vec::new();
    let mut conflict = false;
    let ext = get(
        get(source, "extensions").unwrap_or(&Value::Null),
        CLASSIFICATION_EXT,
    );
    if ext.is_some() {
        conflict = true;
        residuals.push(obj(vec![("path",t("/extensions/umf.postgresql.keys")),("value",copy_json(ext.unwrap(),ctx)?),("outcome",t("unknown")),("reason",t("Existing observations cannot be overwritten; reclassify their retained source")),("recovery",t("Original native catalog and supplement retained; authored key intent is not inferred"))]))
    }
    let vocab = get(
        get(source, "vocabularies").unwrap_or(&Value::Null),
        CLASSIFICATION_EXT,
    );
    if vocab.is_some() && text(vocab.unwrap(), "version") != Some(&u("1.0.0")) {
        conflict = true
    }
    for (i, index) in indexes.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        let matched = matches
            .iter()
            .find(|candidate| {
                let identity = get(candidate, "identity").unwrap_or(&Value::Null);
                ["schema", "table", "index"]
                    .iter()
                    .all(|key| get(index, key) == get(identity, key))
            })
            .ok_or_else(|| {
                err(
                    "POSTGRESQL_KEY_CORRELATION",
                    "/matches",
                    "Correlated index identity is missing",
                )
            })?;
        let identity = get(matched, "identity").unwrap_or(&Value::Null);
        for k in ["schema", "table", "index"] {
            if get(index, k) != get(identity, k) {
                return Err(err(
                    "POSTGRESQL_KEY_CORRELATION",
                    "/matches",
                    "Correlated identity differs from supplement",
                ));
            }
        }
        let component_paths = array(matched, "componentPaths").ok_or_else(|| {
            err(
                "POSTGRESQL_KEY_CORRELATION",
                "/matches/componentPaths",
                "Component paths required",
            )
        })?;
        let components = array(index, "components").ok_or_else(|| {
            err(
                "POSTGRESQL_KEY_CATALOG",
                "/indexes/components",
                "Index components missing",
            )
        })?;
        let key_count = match get(index, "keyCount") {
            Some(Value::Number(n)) => *n as usize,
            _ => 0,
        };
        if component_paths.len() != components.len() || key_count > components.len() {
            return Err(err(
                "POSTGRESQL_KEY_CORRELATION",
                "/matches/componentPaths",
                "Component correspondence differs",
            ));
        }
        let mut fields = Vec::new();
        for p in component_paths.iter().take(key_count) {
            let Value::String(path) = p else {
                continue;
            };
            let col = columns.iter().find(|c| &c.path == path).ok_or_else(|| {
                err(
                    "POSTGRESQL_KEY_COLUMN",
                    "/matches/componentPaths",
                    "Correlated column is missing",
                )
            })?;
            fields.push(obj(vec![
                ("module", t("postgresql.columns")),
                (
                    "element",
                    copy_json(get(&col.element, "id").unwrap_or(&Value::Null), ctx)?,
                ),
            ]));
        }
        let mut reasons = Vec::new();
        let mut enforcement = "unknown";
        let mut equality = "unknown";
        let yes = |k: &str| matches!(get(index, k), Some(Value::Bool(true)));
        let no = |k: &str| matches!(get(index, k), Some(Value::Bool(false)));
        if !yes("valid")
            || !yes("ready")
            || !yes("live")
            || matches!(get(index,"constraint"),Some(Value::Object(_)) if matches!(get(get(index,"constraint").unwrap(),"validated"),Some(Value::Bool(false))))
        {
            enforcement = "unavailable";
            reasons.push("Invalid, unready, non-live or unvalidated native state cannot establish enforcement")
        } else if !yes("unique") {
            enforcement = "not-unique";
            reasons.push("Index does not assert native uniqueness")
        } else if !matches!(get(index, "predicate"), None | Some(Value::Null))
            || array(index, "children").is_some_and(|a| !a.is_empty())
            || array(index, "parents").is_some_and(|a| !a.is_empty())
        {
            enforcement = "conditional";
            reasons.push("Predicate or inheritance changes the covered row set; whole visible-relation uniqueness is not established")
        } else if !yes("immediate")
            || matches!(
                get(
                    get(index, "constraint").unwrap_or(&Value::Null),
                    "deferrable"
                ),
                Some(Value::Bool(true))
            )
        {
            enforcement = "deferred";
            reasons.push(
                "Deferrable constraints can admit transient duplicates before a constraint check",
            )
        } else if !matches!(get(index, "expressions"), None | Some(Value::Null))
            || text(index, "relationKind") != Some(&u("r"))
            || text(index, "accessMethod") != Some(&u("btree"))
        {
            reasons.push("Expression keys, relation kind or index method require another qualified interpretation")
        } else if components
            .iter()
            .take(key_count)
            .any(|c| !matches!(get(c, "notNull"), Some(Value::Bool(true))))
        {
            enforcement = "nullable";
            reasons.push("Native null treatment does not establish required core key components")
        } else {
            enforcement = "immediate-unique-nonnull";
            reasons.push("Captured immediate unconditional uniqueness and NOT NULL apply to this native stored tuple")
        }
        let classes = [
            ("bool", "bool_ops"),
            ("int2", "int2_ops"),
            ("int4", "int4_ops"),
            ("int8", "int8_ops"),
            ("bytea", "bytea_ops"),
        ];
        let mut exact = true;
        let mut incompatible = false;
        for c in components.iter().take(key_count) {
            if text(c, "typeSchema") != Some(&u("pg_catalog"))
                || text(c, "typeKind") != Some(&u("b"))
                || matches!(get(c,"attribute"),Some(Value::Number(n)) if *n==0.0)
            {
                exact = false;
                continue;
            }
            let tn = text(c, "typeName");
            if tn == Some(&u("bpchar")) {
                exact = false;
                incompatible = true;
                reasons.push("Blank-padded character equality collapses distinct Unicode strings");
                continue;
            }
            if tn == Some(&u("text")) || tn == Some(&u("varchar")) {
                if text(c, "operatorClass") != Some(&u("pg_catalog.text_ops"))
                    || text(get(c, "collation").unwrap_or(&Value::Null), "schema")
                        != Some(&u("pg_catalog"))
                    || text(get(c, "collation").unwrap_or(&Value::Null), "name") != Some(&u("C"))
                    || !matches!(
                        get(get(c, "collation").unwrap_or(&Value::Null), "deterministic"),
                        Some(Value::Bool(true))
                    )
                {
                    exact = false;
                    reasons.push(
                        "String comparator is not the qualified deterministic C-collation subset",
                    )
                } else {
                    reasons.push("C-collation equality is exact only for representable PostgreSQL strings; NUL and input/type coercions remain native restrictions")
                }
            } else {
                let allowed =
                    tn.and_then(|n| classes.iter().find(|(x, _)| n == &u(x)).map(|(_, y)| *y));
                if allowed.is_none_or(|op| {
                    text(c, "operatorClass") != Some(&u(&format!("pg_catalog.{op}")))
                        || get(c, "collation").is_some_and(|v| !matches!(v, Value::Null))
                }) {
                    exact = false;
                    reasons.push("Native type, operator class, domain or numeric refinement needs separate equality qualification")
                }
            }
        }
        equality = if exact {
            "exact-on-representable-values"
        } else if incompatible {
            "incompatible"
        } else {
            "unknown"
        };
        let reason = |s: &str| t(s);
        let path = format!("/supplement/indexes/{i}");
        residuals.push(obj(vec![("path",t(&path)),("value",copy_json(index,ctx)?),("outcome",t("unknown")),("reason",t("Native key names and enforcement observations do not establish authored stable key IDs, names or identity intent")),("recovery",t("Original native catalog and supplement retained; authored key intent is not inferred"))]));
        if enforcement != "immediate-unique-nonnull" {
            residuals.push(obj(vec![("path",t(&path)),("value",copy_json(index,ctx)?),("outcome",t(if enforcement=="unknown"{"unknown"}else{"not-expressible"})),("reason",reason(reasons.first().copied().unwrap_or("Native enforcement is not established"))),("recovery",t("Original native catalog and supplement retained; authored key intent is not inferred"))]))
        }
        let compvalue = Value::Array(
            components
                .iter()
                .take(key_count)
                .map(|v| copy_json(v, ctx))
                .collect::<Result<Vec<_>, _>>()?,
        );
        residuals.push(obj(vec![("path",t(&format!("{path}/components"))),("value",compvalue),("outcome",t(if equality=="incompatible"{"not-expressible"}else{"unknown"})),("reason",t(if exact{"Comparator agreement covers native representable stored values only; widths, NUL, input coercions and remaining native domain restrictions are not erased"}else{"Exact core tuple equality is not established for these native comparators/refinements"})),("recovery",t("Original native catalog and supplement retained; authored key intent is not inferred"))]));
        observations.push(obj(vec![
            ("identity", copy_json(identity, ctx)?),
            (
                "nativePath",
                copy_json(get(matched, "indexPath").unwrap_or(&Value::Null), ctx)?,
            ),
            ("fields", Value::Array(fields)),
            (
                "primary",
                copy_json(get(index, "primary").unwrap_or(&Value::Bool(false)), ctx)?,
            ),
            ("enforcement", t(enforcement)),
            ("equality", t(equality)),
            ("authorIntent", t("unknown")),
            ("provenance", t("inferred")),
            ("scope", t("relation-with-descendants")),
            (
                "reasons",
                Value::Array(reasons.into_iter().map(t).collect()),
            ),
        ]));
    }
    let outcome = if residuals
        .iter()
        .any(|x| text(x, "outcome") == Some(&u("not-expressible")))
    {
        "not-expressible"
    } else {
        "unknown"
    };
    set(&mut result, "outcome", t(outcome))?;
    let mode = text(request, "mode") == Some(&u("strict"));
    let blocked = conflict || mode && !residuals.is_empty();
    set(
        &mut result,
        "status",
        t(if blocked { "blocked" } else { "classified" }),
    )?;
    set(
        &mut result,
        "observations",
        Value::Array(observations.clone()),
    )?;
    set(&mut result, "residuals", Value::Array(residuals.clone()))?;
    let mut diagnostics = Vec::new();
    for r in &residuals {
        diagnostics.push(obj(vec![
            ("code", t("POSTGRESQL_KEY_RESIDUAL")),
            (
                "path",
                copy_json(get(r, "path").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                "message",
                copy_json(get(r, "reason").unwrap_or(&Value::Null), ctx)?,
            ),
            ("severity", t(if blocked { "error" } else { "warning" })),
        ]));
    }
    set(&mut result, "diagnostics", Value::Array(diagnostics))?;
    if !blocked {
        let mut target = copy_json(source, ctx)?;
        let vocab = get_mut_object(&mut target, "vocabularies")?;
        if get(vocab, CLASSIFICATION_EXT).is_none() {
            set(
                vocab,
                CLASSIFICATION_EXT,
                obj(vec![("version", t("1.0.0"))]),
            )?
        }
        let extensions = get_mut_object(&mut target, "extensions")?;
        set(
            extensions,
            CLASSIFICATION_EXT,
            obj(vec![
                ("origin", t("classified")),
                ("binding", copy_json(get(&result, "binding").unwrap(), ctx)?),
                ("profile", t("captured-stored-values")),
                (
                    "nativeSource",
                    copy_json(get(request, "nativeSource").unwrap(), ctx)?,
                ),
                (
                    "supplement",
                    copy_json(get(request, "supplement").unwrap(), ctx)?,
                ),
                ("observations", Value::Array(observations)),
            ]),
        )?;
        validate_doc(&target, rt, ctx)?;
        set(&mut result, "target", target)?
    }
    validate(&result, &rt.result, ctx, "POSTGRESQL_KEY_RESULT")?;
    Ok(result)
}
fn get_mut_object<'a>(v: &'a mut Value, k: &str) -> Result<&'a mut Value, EngineError> {
    if get(v, k).is_none() {
        set(v, k, Value::Object(vec![]))?;
    }
    get_mut(v, k).ok_or_else(|| err("POSTGRESQL_KEY_TARGET", "", "Object required"))
}
fn get_mut<'a>(v: &'a mut Value, k: &str) -> Option<&'a mut Value> {
    if let Value::Object(m) = v {
        m.iter_mut().find(|(x, _)| x == &u(k)).map(|(_, v)| v)
    } else {
        None
    }
}
pub fn prepare_key_parser_requests(
    source: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    parser_queries(source, request, &rt, ctx)
}
pub fn correlate_catalog(
    source: &Value,
    request: &Value,
    parser_responses: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let capture = pg::catalog_from_document(source, ctx)?;
    if capture.state() != &u("captured") {
        return Err(err(
            "POSTGRESQL_KEY_CORRELATION",
            "/state",
            "Modified catalog cannot establish observation correspondence",
        ));
    }
    let rt = runtime(ctx)?;
    let correlation = correlate_keys(source, request, parser_responses, &rt, ctx)?;
    validate(
        &correlation,
        &rt.correlation,
        ctx,
        "POSTGRESQL_KEY_CORRELATION",
    )?;
    Ok(correlation)
}
pub fn prepare_catalog_correlation(
    source: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let capture = pg::catalog_from_document(source, ctx)?;
    if capture.state() != &u("captured") {
        return Err(err(
            "POSTGRESQL_KEY_CORRELATION",
            "",
            "Modified catalog cannot establish observation correspondence",
        ));
    }
    let rt = runtime(ctx)?;
    parser_queries(source, request, &rt, ctx)
}
pub fn classify_keys(
    source: &Value,
    request: &Value,
    parser_responses: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let r = runtime(ctx)?;
    classify_inner(
        &copy_json(source, ctx)?,
        &copy_json(request, ctx)?,
        parser_responses,
        &r,
        ctx,
    )
}
pub fn verify_keys(
    receipt: &Value,
    current: &Value,
    parser_responses: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let r = runtime(ctx)?;
    validate(receipt, &r.result, ctx, "POSTGRESQL_KEY_RECEIPT")?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(err(
            "POSTGRESQL_KEY_RECEIPT",
            "/status",
            "Expected classified receipt",
        ));
    }
    let expected = classify_inner(
        get(receipt, "source")
            .ok_or_else(|| err("POSTGRESQL_KEY_RECEIPT", "/source", "Source required"))?,
        get(receipt, "request")
            .ok_or_else(|| err("POSTGRESQL_KEY_RECEIPT", "/request", "Request required"))?,
        parser_responses,
        &r,
        ctx,
    )?;
    if !equal(receipt, &expected, ctx)? {
        return Err(err(
            "POSTGRESQL_KEY_RECEIPT",
            "",
            "Receipt differs from retained native evidence",
        ));
    }
    if !equal(
        current,
        get(receipt, "target")
            .ok_or_else(|| err("POSTGRESQL_KEY_RECEIPT", "/target", "Target required"))?,
        ctx,
    )? {
        return Err(err(
            "POSTGRESQL_KEY_STALE",
            "",
            "Target changed; recompute from retained native sources",
        ));
    }
    copy_json(receipt, ctx)
}
pub fn recover_keys(
    receipt: &Value,
    current: &Value,
    parser_responses: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let checked = verify_keys(receipt, current, parser_responses, ctx)?;
    let request = get(&checked, "request").unwrap_or(&Value::Null);
    Ok(obj(vec![
        (
            "nativeSource",
            copy_json(get(request, "nativeSource").unwrap_or(&Value::Null), ctx)?,
        ),
        (
            "supplement",
            copy_json(get(request, "supplement").unwrap_or(&Value::Null), ctx)?,
        ),
    ]))
}

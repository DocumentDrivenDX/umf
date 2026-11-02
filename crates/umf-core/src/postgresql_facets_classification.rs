// SPDX-License-Identifier: MIT OR Apache-2.0
//! PostgreSQL value-domain facet classification. Parser results are responses
//! to SQL requests prepared from the retained supplement; interpretation,
//! catalog correspondence, author reconciliation, and receipts are Rust-owned.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    facets, postgresql_catalog as pg,
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::collections::{BTreeMap, BTreeSet};

const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/postgresql-facet-classification.schema.json");
const FACET_SCHEMA: &str = include_str!("../../../spec/core/facet-operation-v3.schema.json");
const NATIVE_SCHEMA: &str = include_str!("../../../spec/core/native-json.schema.json");
const SUPPLEMENT_SCHEMA: &str =
    include_str!("../../../spec/extensions/postgresql-catalog/facet-constraints-v1.schema.json");
const CATALOG_PACKAGE: &str =
    include_str!("../../../spec/extensions/postgresql-catalog/package.json");
const FACET_PACKAGE: &str = include_str!("../../../spec/extensions/postgresql-facets/package.json");
const EXT: &str = "umf.postgresql.facets";
const BINDING_SUBSET: &str = "Scalar catalog-column facets with explicit stored/new non-null value scope, verified CHECKs and retained native refinements; no native equivalence";
const RECOVERY: &str = "Retain original native archive and authored facets; interpretation does not replace native meaning";

fn u(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (u(k), v)).collect())
}
fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(x, _)| x == &u(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn get_mut<'a>(v: &'a mut Value, k: &str) -> Option<&'a mut Value> {
    if let Value::Object(m) = v {
        m.iter_mut().find(|(x, _)| x == &u(k)).map(|(_, v)| v)
    } else {
        None
    }
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
fn read_json(s: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&s.encode_utf16().collect::<Vec<_>>(), Format::Json, ctx)
}
fn set(v: &mut Value, k: &str, value: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("POSTGRESQL_FACET_TARGET", "", "Expected an object"));
    };
    if let Some((_, old)) = m.iter_mut().find(|(x, _)| x == &u(k)) {
        *old = value
    } else {
        m.push((u(k), value));
    }
    Ok(())
}
fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canon(v: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
        match v {
            Value::Array(xs) => {
                let mut out = Vec::with_capacity(xs.len());
                for x in xs {
                    c.charge_work(1, Utf16::default())?;
                    out.push(canon(x, c)?);
                }
                Ok(Value::Array(out))
            }
            Value::Object(fields) => {
                let mut out = Vec::with_capacity(fields.len());
                for (k, v) in fields {
                    c.charge_work(k.len().saturating_add(1), Utf16::default())?;
                    out.push((k.clone(), canon(v, c)?));
                }
                out.sort_by(|a, b| a.0.cmp(&b.0));
                Ok(Value::Object(out))
            }
            _ => copy_json(v, c),
        }
    }
    Ok(canon(a, ctx)? == canon(b, ctx)?)
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
            "Value does not match the pinned PostgreSQL facet classification schema",
        ))
    }
}
struct Runtime {
    engine: Engine,
    registry: Registry,
    result: CompiledSchema,
    request: CompiledSchema,
    supplement_schema: Value,
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
fn runtime(ctx: &mut Context<'_>) -> Result<Runtime, EngineError> {
    let core = |s: &str, c: &mut Context<'_>| read_json(s, c);
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
    let mut registry = Registry::new();
    for source in [CATALOG_PACKAGE, FACET_PACKAGE] {
        let package = read_json(source, ctx)?;
        registry.register(&package, None, engine.package_schema(), &resources, ctx)?;
    }
    let mut schemas = resources;
    schemas.entries.push((
        u("urn:umf:core:facet-operation:3.0.0"),
        read_json(FACET_SCHEMA, ctx)?,
    ));
    schemas.entries.push((
        u("urn:umf:native-json:0.1.0"),
        read_json(NATIVE_SCHEMA, ctx)?,
    ));
    let supplement = read_json(SUPPLEMENT_SCHEMA, ctx)?;
    let sid = text(&supplement, "$id")
        .ok_or_else(|| {
            err(
                "POSTGRESQL_FACET_SCHEMA",
                "",
                "Supplement schema id missing",
            )
        })?
        .clone();
    schemas.entries.push((sid, supplement));
    let schema = read_json(RESULT_SCHEMA, ctx)?;
    let id = text(&schema, "$id")
        .ok_or_else(|| err("POSTGRESQL_FACET_SCHEMA", "", "Result schema id missing"))?
        .clone();
    schemas.entries.push((id, schema.clone()));
    let result = CompiledSchema::compile(&schema, &schemas, ctx)?;
    let request_schema = get(
        get(&schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| err("POSTGRESQL_FACET_SCHEMA", "", "Request schema missing"))?;
    let request = CompiledSchema::compile(request_schema, &schemas, ctx)?;
    Ok(Runtime {
        engine,
        registry,
        result,
        request,
        supplement_schema: read_json(SUPPLEMENT_SCHEMA, ctx)?,
    })
}
fn validate_document(
    source: &Value,
    rt: &Runtime,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut caps = NoCallbacks;
    let report = rt
        .engine
        .validate_document(source, &rt.registry, &mut caps, ctx)?;
    if text(source, "umf") != Some(&u("0.10.0")) || !report.valid {
        return Err(err(
            "POSTGRESQL_FACET_SOURCE",
            "",
            "Valid core 0.10.0 source required; migrate explicitly",
        ));
    }
    Ok(())
}
fn parser_queries(
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<(Utf16, Utf16)>, EngineError> {
    let supplement = text(request, "supplement").ok_or_else(|| {
        err(
            "POSTGRESQL_FACET_REQUEST",
            "/supplement",
            "Facet supplement required",
        )
    })?;
    let catalog = pg::inspect_facet_catalog(supplement, ctx)?;
    let constraints = array(&catalog, "constraints").ok_or_else(|| {
        err(
            "POSTGRESQL_FACET_CATALOG",
            "/constraints",
            "CHECK observations are missing",
        )
    })?;
    let mut queries = Vec::with_capacity(constraints.len());
    for (index, constraint) in constraints.iter().enumerate() {
        let expression = text(constraint, "expression").ok_or_else(|| {
            err(
                "POSTGRESQL_FACET_CATALOG",
                "/constraints",
                "CHECK expression is missing",
            )
        })?;
        let mut sql = Vec::with_capacity(7 + expression.len());
        sql.extend("SELECT ".encode_utf16());
        sql.extend(expression.units());
        ctx.charge_text(sql.len(), Utf16::default())?;
        let id = Utf16::from(format!("constraint-{index}"));
        queries.push((id, Utf16::new(sql)));
    }
    Ok(queries)
}

/// The host parses only the SQL Rust prepared from the retained CHECK source.
/// Correlation and predicate interpretation remain inside the native catalog kernel.
pub fn prepare_parser_requests(
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    validate(request, &rt.request, ctx, "POSTGRESQL_FACET_REQUEST")?;
    let queries = parser_queries(request, ctx)?;
    let mut rows = Vec::with_capacity(queries.len());
    for (id, sql) in queries {
        rows.push(obj(vec![
            ("id", Value::String(id)),
            ("sql", Value::String(sql)),
        ]));
    }
    Ok(obj(vec![("queries", Value::Array(rows))]))
}

struct PreparedParser {
    trees: BTreeMap<Utf16, Value>,
}
impl crate::parser_backend_protocol::PostgresqlParserBackend for PreparedParser {
    fn identity(&self) -> &'static str {
        crate::parser_backend_protocol::PARSER_BACKEND_IDENTITY
    }
    fn parse(&self, sql: &Utf16, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        let tree = self.trees.get(sql).ok_or_else(|| {
            err(
                "POSTGRESQL_BACKEND_RESPONSE",
                "",
                "Parser response does not match prepared SQL",
            )
        })?;
        copy_json(tree, ctx)
    }
    fn deparse(&self, _tree: &Value, _ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
        Err(err(
            "POSTGRESQL_BACKEND_RESPONSE",
            "",
            "Deparse is not part of facet classification",
        ))
    }
    fn codec_round_trip(
        &self,
        _tree: &Value,
        _ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        Err(err(
            "POSTGRESQL_BACKEND_RESPONSE",
            "",
            "Codec round-trip is not part of facet classification",
        ))
    }
}

fn correlate_from_parser(
    source: &Value,
    request: &Value,
    parser: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let queries = parser_queries(request, ctx)?;
    let responses = array(parser, "responses").ok_or_else(|| {
        err(
            "POSTGRESQL_BACKEND_RESPONSE",
            "/responses",
            "Prepared parser responses are required",
        )
    })?;
    if responses.len() != queries.len() {
        return Err(err(
            "POSTGRESQL_BACKEND_RESPONSE",
            "/responses",
            "Parser response count differs from prepared CHECKs",
        ));
    }
    let mut trees = BTreeMap::new();
    for ((expected_id, expected_sql), response) in queries.iter().zip(responses) {
        let id = text(response, "id").ok_or_else(|| {
            err(
                "POSTGRESQL_BACKEND_RESPONSE",
                "/responses/id",
                "Parser response id is required",
            )
        })?;
        let sql = text(response, "sql").ok_or_else(|| {
            err(
                "POSTGRESQL_BACKEND_RESPONSE",
                "/responses/sql",
                "Prepared SQL is required",
            )
        })?;
        let tree = get(response, "ast").ok_or_else(|| {
            err(
                "POSTGRESQL_BACKEND_RESPONSE",
                "/responses/ast",
                "Parser AST is required",
            )
        })?;
        if id != expected_id
            || sql != expected_sql
            || trees
                .insert(expected_sql.clone(), copy_json(tree, ctx)?)
                .is_some()
        {
            return Err(err(
                "POSTGRESQL_BACKEND_RESPONSE",
                "/responses",
                "Parser response does not match the ordered prepared CHECK requests",
            ));
        }
    }
    let backend = PreparedParser { trees };
    pg::correlate_facet_catalog_with_backend(
        source,
        text(request, "supplement").ok_or_else(|| {
            err(
                "POSTGRESQL_FACET_REQUEST",
                "/supplement",
                "Facet supplement required",
            )
        })?,
        text(request, "datumFormat").ok_or_else(|| {
            err(
                "POSTGRESQL_FACET_REQUEST",
                "/datumFormat",
                "Datum format required",
            )
        })?,
        &backend,
        ctx,
    )
}
fn pointer(base: &Utf16, suffix: &str, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let tail = suffix.encode_utf16().collect::<Vec<_>>();
    ctx.charge_work(base.len().saturating_add(tail.len()), Utf16::default())?;
    let mut out = base.units().to_vec();
    out.extend(tail);
    Ok(Utf16::new(out))
}
fn outcome(v: &str) -> Value {
    t(v)
}
fn binding() -> Value {
    obj(vec![
        ("id", t(EXT)),
        ("version", t("1.0.0")),
        ("nativeVersion", t("17.4")),
        ("subset", t(BINDING_SUBSET)),
    ])
}
fn observation(
    concept: &str,
    ideal: &Utf16,
    native: &Utf16,
    interpretation: &str,
    outcome: &str,
    basis: &str,
) -> Value {
    obj(vec![
        ("concept", t(concept)),
        ("idealPath", Value::String(ideal.clone())),
        ("nativePath", Value::String(native.clone())),
        ("interpretation", t(interpretation)),
        ("outcome", t(outcome)),
        ("basis", t(basis)),
    ])
}
fn residual(
    path: &Utf16,
    ideal: &Utf16,
    value: &Value,
    reason: &str,
    outcome: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(obj(vec![
        ("path", Value::String(path.clone())),
        ("targetPath", Value::String(ideal.clone())),
        ("value", copy_json(value, ctx)?),
        ("reason", t(reason)),
        ("outcome", outcome_value(outcome)),
        ("binding", binding()),
        ("recovery", t(RECOVERY)),
    ]))
}
fn outcome_value(s: &str) -> Value {
    t(s)
}
fn tagged_members(v: &Value) -> Option<&Value> {
    if text(v, "kind") == Some(&u("object")) {
        get(v, "members")
    } else {
        None
    }
}
fn native_string(v: &Value) -> Option<&Utf16> {
    if text(v, "kind") == Some(&u("string")) {
        text(v, "value")
    } else {
        None
    }
}
fn escaped_segment(segment: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let mut out = Vec::with_capacity(segment.len());
    for unit in segment.units() {
        match *unit {
            0x7e => out.extend([0x7e, 0x30]),
            0x2f => out.extend([0x7e, 0x31]),
            other => out.push(other),
        }
    }
    ctx.charge_work(out.len().saturating_add(1), Utf16::default())?;
    let mut path = vec![0x2f];
    path.extend(out);
    Ok(Utf16::new(path))
}
fn child_path(base: &Utf16, segment: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let escaped = escaped_segment(segment, ctx)?;
    let mut out = base.units().to_vec();
    out.extend(escaped.units());
    ctx.charge_work(out.len(), Utf16::default())?;
    Ok(Utf16::new(out))
}
fn collect_unknown(
    node: &Value,
    rule: &Value,
    path: &Utf16,
    schema: &Value,
    depth: usize,
    out: &mut Vec<(Utf16, Value)>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if depth > ctx.limits().max_depth {
        return Err(err(
            "LIMIT",
            "",
            "Facet supplement exceeds the configured traversal depth",
        ));
    }
    if let Some(reference) = text(rule, "$ref") {
        let prefix = u("#/$defs/");
        if reference.units().starts_with(prefix.units()) {
            let suffix = Utf16::new(reference.units()[prefix.len()..].to_vec());
            if let Some(definitions) = get(schema, "$defs") {
                if let Some((_, definition)) = match definitions {
                    Value::Object(entries) => entries.iter().find(|(key, _)| key == &suffix),
                    _ => None,
                } {
                    return collect_unknown(node, definition, path, schema, depth + 1, out, ctx);
                }
            }
        }
    }
    if let Some(Value::Array(branches)) = get(rule, "anyOf") {
        let kind = text(node, "kind");
        let selected = branches.iter().find(|branch| {
            let branch_type = text(branch, "type");
            if kind == Some(&u("null")) {
                branch_type == Some(&u("null"))
            } else {
                branch_type != Some(&u("null"))
            }
        });
        if let Some(branch) = selected {
            return collect_unknown(node, branch, path, schema, depth + 1, out, ctx);
        }
    }
    match text(node, "kind") {
        Some(kind) if kind == &u("object") => {
            let members = tagged_members(node).unwrap_or(&Value::Null);
            if let (Some(Value::Object(actual)), Some(Value::Object(properties))) =
                (Some(members), get(rule, "properties"))
            {
                for (name, value) in actual {
                    ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
                    let next = child_path(path, name, ctx)?;
                    if let Some((_, member_rule)) = properties.iter().find(|(key, _)| key == name) {
                        collect_unknown(value, member_rule, &next, schema, depth + 1, out, ctx)?;
                    } else {
                        out.push((next, copy_json(value, ctx)?));
                    }
                }
            }
        }
        Some(kind) if kind == &u("array") => {
            if let (Some(items), Some(item_rule)) = (array(node, "items"), get(rule, "items")) {
                for (index, item) in items.iter().enumerate() {
                    let next = child_path(path, &u(&index.to_string()), ctx)?;
                    collect_unknown(item, item_rule, &next, schema, depth + 1, out, ctx)?;
                }
            }
        }
        _ => {}
    }
    Ok(())
}
fn integer(s: &Utf16) -> Option<i128> {
    let v = s.to_utf8().ok()?;
    if v.is_empty() || v.len() > 4000 {
        return None;
    }
    let (negative, digits) = if let Some(x) = v.strip_prefix('-') {
        (true, x)
    } else {
        (false, v.as_str())
    };
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) || digits.len() > 38 {
        return None;
    }
    let n = digits.parse::<i128>().ok()?;
    if negative {
        Some(-n)
    } else {
        Some(n)
    }
}
fn metered_equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    equal(a, b, ctx)
}
fn classify_inner(
    source: &Value,
    request: &Value,
    parser: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    validate(request, &rt.request, ctx, "POSTGRESQL_FACET_REQUEST")?;
    validate_document(source, &rt, ctx)?;
    let correlation = correlate_from_parser(source, request, parser, ctx)?;
    let archive = pg::export_document(source, ctx)?;
    let native_source = text(request, "nativeSource").ok_or_else(|| {
        err(
            "POSTGRESQL_FACET_REQUEST",
            "/nativeSource",
            "Native source required",
        )
    })?;
    let captured = pg::PostgresqlCatalogCapture::import(native_source, ctx)?;
    if captured.export(ctx)? != archive {
        return Err(err(
            "POSTGRESQL_FACET_ARCHIVE",
            "/nativeSource",
            "Original native source differs from retained catalog",
        ));
    }
    if text(&correlation, "nativeSupplement") != text(request, "supplement")
        || text(&correlation, "nativeCatalog") != Some(&archive)
        || !matches!(get(&correlation, "authenticated"), Some(Value::Bool(false)))
    {
        return Err(err(
            "POSTGRESQL_FACET_CATALOG",
            "/supplement",
            "Parser correlation does not match retained catalog and supplement",
        ));
    }
    let column = text(request, "column")
        .ok_or_else(|| err("POSTGRESQL_FACET_REQUEST", "/column", "Column required"))?;
    let metadata = captured
        .columns(ctx)?
        .into_iter()
        .find(|c| &c.path == column)
        .ok_or_else(|| err("POSTGRESQL_FACET_COLUMN", "/column", "Column not captured"))?;
    let modules = array(source, "modules")
        .ok_or_else(|| err("POSTGRESQL_FACET_SOURCE", "/modules", "Modules required"))?;
    let mi = modules
        .iter()
        .position(|m| text(m, "id") == Some(&u("postgresql.columns")))
        .ok_or_else(|| {
            err(
                "POSTGRESQL_FACET_COLUMN",
                "/modules",
                "Derived Field module missing",
            )
        })?;
    let elements = array(&modules[mi], "elements").ok_or_else(|| {
        err(
            "POSTGRESQL_FACET_COLUMN",
            "/elements",
            "Derived Field elements missing",
        )
    })?;
    let ei = elements
        .iter()
        .position(|e| text(e, "id") == text(&metadata.element, "id"))
        .ok_or_else(|| {
            err(
                "POSTGRESQL_FACET_COLUMN",
                "/elements",
                "Derived Field missing",
            )
        })?;
    let element = &elements[ei];
    let ideal = pointer(
        &pointer(
            &pointer(&u("/modules"), &format!("/{mi}/elements/{ei}"), ctx)?,
            "/facets",
            ctx,
        )?,
        "",
        ctx,
    )?;
    let members = tagged_members(&metadata.native_column).ok_or_else(|| {
        err(
            "POSTGRESQL_FACET_COLUMN",
            "/nativeColumn",
            "Native column members missing",
        )
    })?;
    let native_type_path = child_path(&metadata.path, &u("nativeType"), ctx)?;
    let mut facets = obj(vec![]);
    let mut observations = Vec::new();
    let mut residuals = Vec::new();
    let mut blocked = false;
    let add_loss = |path: Utf16,
                    value: &Value,
                    reason: &str,
                    kind: &str,
                    concept: &str,
                    facets: &mut Vec<Value>,
                    observations: &mut Vec<Value>,
                    ctx: &mut Context<'_>|
     -> Result<(), EngineError> {
        facets.push(residual(&path, &ideal, value, reason, kind, ctx)?);
        observations.push(observation(
            concept,
            &ideal,
            &path,
            if kind == "not-expressible" {
                "unsupported"
            } else {
                "unknown"
            },
            kind,
            reason,
        ));
        Ok(())
    };
    if text(element, "kind") != Some(&u("field"))
        || text(element, "cardinality").is_some_and(|v| v != &u("one") && v != &u("unspecified"))
        || array(element, "references").is_some_and(|refs| {
            refs.iter()
                .any(|r| text(r, "role") == Some(&u("record-type")))
        })
    {
        blocked = true;
        add_loss(
            ideal.clone(),
            element,
            "Facet classification requires a scalar Field",
            "not-expressible",
            "native",
            &mut residuals,
            &mut observations,
            ctx,
        )?;
    }
    if get(get(element, "extensions").unwrap_or(&Value::Null), EXT).is_some() {
        blocked = true;
        add_loss(
            ideal.clone(),
            get(get(element, "extensions").unwrap_or(&Value::Null), EXT).unwrap(),
            "Existing binding cannot be overwritten",
            "not-expressible",
            "native",
            &mut residuals,
            &mut observations,
            ctx,
        )?;
    }
    if get(get(source, "vocabularies").unwrap_or(&Value::Null), EXT)
        .is_some_and(|v| text(v, "version") != Some(&u("1.0.0")))
    {
        blocked = true;
        add_loss(
            ideal.clone(),
            get(get(source, "vocabularies").unwrap_or(&Value::Null), EXT).unwrap(),
            "Incompatible facet vocabulary",
            "not-expressible",
            "native",
            &mut residuals,
            &mut observations,
            ctx,
        )?;
    }
    let native_ty = get(members, "nativeType")
        .cloned()
        .unwrap_or_else(|| obj(vec![("kind", t("null"))]));
    let ty = pg::inspect_facet_type(&native_ty, ctx)?;
    let meaning = get(&ty, "meaning").unwrap_or(&Value::Null);
    let profile = text(request, "profile")
        .and_then(|s| s.to_utf8().ok())
        .unwrap_or_default();
    let obligation = text(request, "obligation")
        .and_then(|s| s.to_utf8().ok())
        .unwrap_or_default();
    let matches = array(&correlation, "matches").ok_or_else(|| {
        err(
            "POSTGRESQL_FACET_CATALOG",
            "/matches",
            "Parser correlation omitted matched catalog checks",
        )
    })?;
    let mut selected = Vec::new();
    let schema = Some(&metadata.schema);
    let relation = Some(&metadata.relation);
    for m in matches {
        let id = get(m, "identity").unwrap_or(&Value::Null);
        if text(id, "schema") != schema || text(id, "relation") != relation {
            continue;
        }
        let cols = array(m, "columns").unwrap_or(&[]);
        if !cols.is_empty() && !cols.iter().any(|c| text(c, "path") == Some(column)) {
            continue;
        }
        selected.push(m);
    }
    let mut terms = Vec::<&Value>::new();
    for m in &selected {
        let inspection = get(m, "inspection").unwrap_or(&Value::Null);
        if text(inspection, "state") != Some(&u("verified-expression"))
            || (profile == "stored-value"
                && matches!(get(inspection,"valueScope"),Some(Value::String(v)) if v==&u("new-values-only")))
        {
            add_loss(
                u("/supplement/constraints"),
                get(inspection, "native").unwrap_or(&Value::Null),
                "Constraint meaning or enforcement scope is not qualified for the requested values",
                "unknown",
                "native",
                &mut residuals,
                &mut observations,
                ctx,
            )?;
        } else {
            terms.extend(array(inspection, "terms").unwrap_or(&[]));
        }
    }
    let family = text(meaning, "family")
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let mut used = BTreeSet::<usize>::new();
    if profile == "unresolved" {
        add_loss(
            native_type_path.clone(),
            &native_ty,
            "No stored/new value scope selected",
            "unknown",
            "native",
            &mut residuals,
            &mut observations,
            ctx,
        )?;
    } else if text(&ty, "state") != Some(&u("observed")) {
        add_loss(
            native_type_path.clone(),
            get(&ty, "native").unwrap_or(&native_ty),
            text(&ty, "reason")
                .and_then(|v| v.to_utf8().ok())
                .as_deref()
                .unwrap_or("Native type is outside the qualified facet subset"),
            "not-expressible",
            "native",
            &mut residuals,
            &mut observations,
            ctx,
        )?;
    } else if family == "integer" {
        let bits = get(meaning, "signedBits").and_then(|v| {
            if let Value::Number(n) = v {
                Some(*n as u32)
            } else {
                None
            }
        });
        let Some(bits) = bits.filter(|b| *b > 0 && *b <= 64) else {
            add_loss(
                native_type_path.clone(),
                &native_ty,
                "Integer width is outside supported catalog bounds",
                "not-expressible",
                "integerWidth",
                &mut residuals,
                &mut observations,
                ctx,
            )?;
            return finish(
                source,
                request,
                &rt,
                &metadata,
                mi,
                ei,
                ideal,
                facets,
                observations,
                residuals,
                blocked,
                ctx,
            );
        };
        let mut min = -(1_i128 << (bits - 1));
        let mut max = (1_i128 << (bits - 1)) - 1;
        for (i, term) in terms.iter().enumerate() {
            if text(term, "kind") != Some(&u("bound")) {
                continue;
            }
            let lit = text(term, "literal").and_then(integer);
            let Some(n) = lit else { continue };
            match text(term, "operator") {
                Some(op) if op == &u(">=") => {
                    min = min.max(n);
                    used.insert(i);
                }
                Some(op) if op == &u("<=") => {
                    max = max.min(n);
                    used.insert(i);
                }
                _ => {}
            }
        }
        let mut width = None;
        for b in 1..=bits {
            for signed in [true, false] {
                let lo = if signed { -(1_i128 << (b - 1)) } else { 0 };
                let hi = if signed {
                    (1_i128 << (b - 1)) - 1
                } else {
                    (1_i128 << b) - 1
                };
                if min == lo && max == hi {
                    width = Some((b, signed));
                }
            }
        }
        if let Some((b, signed)) = width {
            facets = obj(vec![(
                "integerWidth",
                obj(vec![
                    ("bits", Value::Number(b as f64)),
                    ("signed", Value::Bool(signed)),
                ]),
            )]);
            observations.push(observation("integerWidth",&ideal,&native_type_path,"inferred","exact","Qualified non-null integer carrier and applicable CHECK bounds form the canonical width domain"));
        } else {
            add_loss(
                native_type_path.clone(),
                &obj(vec![
                    ("min", t(&min.to_string())),
                    ("max", t(&max.to_string())),
                ]),
                "Effective integer interval is empty or not a canonical core width domain",
                "not-expressible",
                "integerWidth",
                &mut residuals,
                &mut observations,
                ctx,
            )?;
        }
    } else if family == "decimal" {
        let precision = get(meaning, "precision").and_then(|v| {
            if let Value::Number(n) = v {
                Some(*n as i64)
            } else {
                None
            }
        });
        let scale = get(meaning, "scale").and_then(|v| {
            if let Value::Number(n) = v {
                Some(*n as i64)
            } else {
                None
            }
        });
        let mut pair = None;
        for (i, lo) in terms.iter().enumerate() {
            if text(lo, "kind") != Some(&u("bound")) || text(lo, "operator") != Some(&u(">=")) {
                continue;
            }
            for (j, hi) in terms.iter().enumerate() {
                if text(hi, "kind") != Some(&u("bound")) || text(hi, "operator") != Some(&u("<=")) {
                    continue;
                }
                let low = text(lo, "literal").and_then(|v| v.to_utf8().ok());
                let high = text(hi, "literal").and_then(|v| v.to_utf8().ok());
                let Some((low, high)) = low.zip(high) else {
                    continue;
                };
                if low != format!("-{high}") {
                    continue;
                }
                let Some((p, s)) = decimal_shape(&high) else {
                    continue;
                };
                if p > 1000 || p < 1 {
                    continue;
                }
                let native_pair = precision == Some(p as i64) && scale == Some(s as i64);
                let guard = terms.iter().enumerate().find(|(_, t)| {
                    text(t, "kind") == Some(&u("scale"))
                        && text(t, "scale") == Some(&u(&s.to_string()))
                });
                if native_pair || precision.is_none() && guard.is_some() {
                    pair = Some((p, s));
                    used.insert(i);
                    used.insert(j);
                    if let Some((k, _)) = guard {
                        used.insert(k);
                    }
                    break;
                }
            }
        }
        if let Some((p, s)) = pair {
            facets = obj(vec![
                ("precision", Value::Number(p as f64)),
                ("scale", Value::Number(s as f64)),
            ]);
            observations.push(observation("decimal",&ideal,&native_type_path,"inferred","exact","Finite symmetric decimal bounds plus qualified native scale or truncation equality establish the non-null coefficient domain"));
        } else if precision.is_some() || !terms.is_empty() {
            add_loss(native_type_path.clone(),&obj(vec![("native",native_ty.clone()),("terms",Value::Array(terms.iter().map(|v|(*v).clone()).collect()))]),"Native numeric precision/scale, special values and predicates do not establish a qualified finite core coefficient domain","not-expressible","decimal",&mut residuals,&mut observations,ctx)?;
        }
    } else if family == "string" || family == "binary" {
        let mut max = get(meaning, "declaredMaxCharacters").and_then(|v| {
            if let Value::Number(n) = v {
                Some(*n as u64)
            } else {
                None
            }
        });
        for (i, term) in terms.iter().enumerate() {
            if text(term, "kind") != Some(&u("length")) {
                continue;
            }
            let unit = text(term, "unit");
            if (family == "string" && unit != Some(&u("unicode-scalar")))
                || (family == "binary" && unit != Some(&u("byte")))
            {
                continue;
            }
            let Some(n) = text(term, "max")
                .and_then(integer)
                .filter(|n| *n >= 0 && *n <= 9_007_199_254_740_991)
            else {
                continue;
            };
            max = Some(max.map_or(n as u64, |old| old.min(n as u64)));
            used.insert(i);
        }
        if let Some(max) = max {
            facets = obj(vec![(
                "length",
                obj(vec![
                    ("max", Value::Number(max as f64)),
                    (
                        "unit",
                        t(if family == "string" {
                            "unicode-scalar"
                        } else {
                            "byte"
                        }),
                    ),
                ]),
            )]);
            observations.push(observation("length",&ideal,&native_type_path,"inferred","exact","Native carrier and applicable length predicates establish this non-null upper bound"));
        }
        if family == "string" {
            if max != Some(0) {
                add_loss(native_type_path.clone(),&native_ty,"PostgreSQL character values exclude NUL; a Unicode-scalar bound alone does not retain this restriction","not-expressible","length",&mut residuals,&mut observations,ctx)?;
            }
            if text(meaning, "padding") != Some(&u("none")) {
                add_loss(native_type_path.clone(),&native_ty,"Native character padding and trailing-space semantics remain outside the core length facet","not-expressible","length",&mut residuals,&mut observations,ctx)?;
            }
        }
    }
    for (i, term) in terms.iter().enumerate() {
        if !used.contains(&i) {
            add_loss(
                u("/supplement/constraints"),
                term,
                "Additional native predicate remains outside the interpreted facet domain",
                "unknown",
                "native",
                &mut residuals,
                &mut observations,
                ctx,
            )?;
        }
    }
    if obligation == "exact-input" {
        let reason = if family == "float" && get(meaning, "bits") == Some(&Value::Number(32.0)) {
            "Binary64 1.0000000000000002 narrows to binary32 1.0"
        } else if family == "decimal"
            && matches!(get(meaning, "coercesScale"), Some(Value::Bool(true)))
        {
            "Native numeric scale conversion can round before CHECK evaluation"
        } else {
            "Catalog value-domain evidence does not establish exact conversion of arbitrary SQL input expressions"
        };
        let out = if reason.starts_with("Binary64") || reason.starts_with("Native numeric") {
            "approximated"
        } else {
            "unknown"
        };
        add_loss(
            native_type_path.clone(),
            &native_ty,
            reason,
            out,
            "conversion",
            &mut residuals,
            &mut observations,
            ctx,
        )?;
    }
    let known = [
        "name",
        "position",
        "type",
        "nativeType",
        "notNull",
        "identity",
        "generated",
        "collation",
        "default",
        "comment",
        "storage",
        "compression",
        "acl",
    ];
    if let Value::Object(m) = members {
        for (k, v) in m {
            let key = k.to_utf8().unwrap_or_default();
            if !known.contains(&key.as_str()) {
                let path = child_path(&metadata.path, k, ctx)?;
                add_loss(
                    path,
                    v,
                    "Unknown column metadata remains native",
                    "unknown",
                    "native",
                    &mut residuals,
                    &mut observations,
                    ctx,
                )?;
            }
        }
    }
    if let Some(native_type) = get(members, "nativeType") {
        if let Some(type_members) = tagged_members(native_type) {
            let known_type = [
                "schema",
                "name",
                "kind",
                "category",
                "dimensions",
                "modifier",
            ];
            if let Value::Object(entries) = type_members {
                for (name, value) in entries {
                    let decoded = name.to_utf8().ok();
                    if !decoded.as_deref().is_some_and(|v| known_type.contains(&v)) {
                        let base = native_type_path.clone();
                        add_loss(
                            child_path(&base, name, ctx)?,
                            value,
                            "Unknown type refinement remains native",
                            "unknown",
                            "native",
                            &mut residuals,
                            &mut observations,
                            ctx,
                        )?;
                    }
                }
            }
        }
    }
    let mut unknown = Vec::new();
    if let Some(root) = get(&correlation, "root") {
        collect_unknown(
            root,
            &rt.supplement_schema,
            &u("/supplement"),
            &rt.supplement_schema,
            0,
            &mut unknown,
            ctx,
        )?;
    }
    for (path, value) in unknown {
        add_loss(
            path,
            &value,
            "Unknown supplement content remains native",
            "unknown",
            "native",
            &mut residuals,
            &mut observations,
            ctx,
        )?;
    }
    if let Some(author) = get(request, "author") {
        let mut caps = NoCallbacks;
        let verified = facets::verify_core_facet_declaration(
            author,
            source,
            &rt.engine,
            &rt.registry,
            &mut caps,
            ctx,
        );
        match verified {
            Ok(v) => {
                let identity = get(&v, "identity").unwrap_or(&Value::Null);
                if text(identity, "module") != Some(&u("postgresql.columns"))
                    || text(identity, "element") != text(element, "id")
                {
                    blocked = true;
                    add_loss(
                        ideal.clone(),
                        identity,
                        "Author receipt identifies a different Field",
                        "not-expressible",
                        "native",
                        &mut residuals,
                        &mut observations,
                        ctx,
                    )?;
                } else {
                    let inspection = facets::inspect_core_facets(
                        source,
                        identity,
                        &rt.engine,
                        &rt.registry,
                        &mut caps,
                        ctx,
                    )?;
                    let meaning = get(&inspection, "meaning").unwrap_or(&Value::Null);
                    let interpreted = get(meaning, "interpreted").unwrap_or(&Value::Null);
                    for key in ["length", "precision", "scale", "integerWidth"] {
                        if let Some(declared) = get(interpreted, key) {
                            if let Some(observed) = get(&facets, key) {
                                if !equal(declared, observed, ctx)? {
                                    blocked = true;
                                    add_loss(ideal.clone(),&obj(vec![("declared",copy_json(declared,ctx)?),("observed",copy_json(observed,ctx)?)]),&format!("Authored {key} conflicts with native interpretation; neither may be overwritten"),"not-expressible","native",&mut residuals,&mut observations,ctx)?;
                                }
                            } else {
                                add_loss(pointer(&ideal,&format!("/{key}"),ctx)?,declared,"Authored bound is retained but not established by the selected native consumer","unknown","native",&mut residuals,&mut observations,ctx)?;
                            }
                        }
                    }
                    if text(meaning, "state") == Some(&u("partial")) {
                        add_loss(ideal.clone(),get(meaning,"facets").unwrap_or(&Value::Null),"Unknown authored facet qualifiers remain attached and cannot establish native enforcement","unknown","native",&mut residuals,&mut observations,ctx)?;
                    }
                }
            }
            Err(e) if e.is_control_failure() || e.code == "LIMIT" || e.code == "CAPACITY" => {
                return Err(e)
            }
            Err(e) => {
                blocked = true;
                add_loss(
                    ideal.clone(),
                    &Value::Null,
                    &format!("Author provenance is invalid or stale: {}", e.code),
                    "not-expressible",
                    "native",
                    &mut residuals,
                    &mut observations,
                    ctx,
                )?;
            }
        }
    } else if get(element, "facets").is_some() {
        blocked = true;
        add_loss(
            ideal.clone(),
            get(element, "facets").unwrap(),
            "Existing facets require verified author provenance before classification",
            "not-expressible",
            "native",
            &mut residuals,
            &mut observations,
            ctx,
        )?;
    }
    finish(
        source,
        request,
        &rt,
        &metadata,
        mi,
        ei,
        ideal,
        facets,
        observations,
        residuals,
        blocked,
        ctx,
    )
}
fn decimal_shape(s: &str) -> Option<(u32, u32)> {
    let (whole, fraction) = s.split_once('.').unwrap_or((s, ""));
    let canonical = if whole == "0" {
        !fraction.is_empty() && fraction.bytes().all(|b| b == b'9')
    } else {
        !whole.is_empty() && whole.bytes().all(|b| b == b'9') && fraction.bytes().all(|b| b == b'9')
    };
    if !canonical {
        return None;
    }
    let precision = (if whole == "0" { 0 } else { whole.len() }) + fraction.len();
    Some((precision as u32, fraction.len() as u32))
}
fn finish(
    source: &Value,
    request: &Value,
    rt: &Runtime,
    metadata: &pg::PostgresqlColumnMetadata,
    mi: usize,
    ei: usize,
    ideal: Utf16,
    facets: Value,
    observations: Vec<Value>,
    residuals: Vec<Value>,
    blocked: bool,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let strict_refusal = text(request, "mode") == Some(&u("strict")) && !residuals.is_empty();
    let is_blocked = blocked || strict_refusal;
    let outcome = if residuals
        .iter()
        .any(|r| text(r, "outcome") == Some(&u("unknown")))
    {
        "unknown"
    } else if residuals
        .iter()
        .any(|r| text(r, "outcome") == Some(&u("not-expressible")))
    {
        "not-expressible"
    } else if residuals.is_empty() {
        "exact"
    } else {
        "approximated"
    };
    let mut diagnostics = Vec::with_capacity(residuals.len());
    for residual in &residuals {
        let path = get(residual, "path")
            .ok_or_else(|| err("POSTGRESQL_FACET_RESULT", "/residuals/path", "Path missing"))?;
        let message = get(residual, "reason").ok_or_else(|| {
            err(
                "POSTGRESQL_FACET_RESULT",
                "/residuals/reason",
                "Reason missing",
            )
        })?;
        let conflict =
            matches!(path, Value::String(value) if value.units().starts_with(ideal.units()));
        diagnostics.push(obj(vec![
            (
                "code",
                t(if conflict {
                    "POSTGRESQL_FACET_CONFLICT"
                } else {
                    "POSTGRESQL_FACET_UNRESOLVED"
                }),
            ),
            ("path", copy_json(path, ctx)?),
            ("message", copy_json(message, ctx)?),
            ("severity", t(if is_blocked { "error" } else { "warning" })),
        ]));
    }
    let mut result = obj(vec![
        ("operation", t("classify-postgresql-facets")),
        ("version", t("1.0.0")),
        (
            "status",
            t(if is_blocked { "blocked" } else { "classified" }),
        ),
        ("outcome", t(outcome)),
        ("source", copy_json(source, ctx)?),
        ("request", copy_json(request, ctx)?),
        ("binding", binding()),
        (
            "mapping",
            obj(vec![
                ("origin", t("classified")),
                ("idealPath", Value::String(ideal.clone())),
                (
                    "nativePath",
                    Value::String(text(request, "column").unwrap().clone()),
                ),
                ("nativeFragment", copy_json(&metadata.native_column, ctx)?),
                ("facets", copy_json(&facets, ctx)?),
                ("observations", Value::Array(observations)),
            ]),
        ),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    if !is_blocked {
        let mut target = copy_json(source, ctx)?;
        // Admit the extension package before borrowing the selected module.
        let vocabularies = get_mut(&mut target, "vocabularies").ok_or_else(|| {
            err(
                "POSTGRESQL_FACET_TARGET",
                "/vocabularies",
                "Vocabularies missing",
            )
        })?;
        if get(vocabularies, EXT).is_none() {
            set(vocabularies, EXT, obj(vec![("version", t("1.0.0"))]))?;
        }
        let native_supplement = copy_json(
            get(request, "supplement").ok_or_else(|| {
                err(
                    "POSTGRESQL_FACET_REQUEST",
                    "/supplement",
                    "Supplement required",
                )
            })?,
            ctx,
        )?;
        let profile = copy_json(
            get(request, "profile")
                .ok_or_else(|| err("POSTGRESQL_FACET_REQUEST", "/profile", "Profile required"))?,
            ctx,
        )?;
        let datum_format = copy_json(
            get(request, "datumFormat").ok_or_else(|| {
                err(
                    "POSTGRESQL_FACET_REQUEST",
                    "/datumFormat",
                    "Datum format required",
                )
            })?,
            ctx,
        )?;
        let obligation = copy_json(
            get(request, "obligation").ok_or_else(|| {
                err(
                    "POSTGRESQL_FACET_REQUEST",
                    "/obligation",
                    "Obligation required",
                )
            })?,
            ctx,
        )?;
        let report_observations = copy_json(
            get(get(&result, "mapping").unwrap(), "observations").unwrap(),
            ctx,
        )?;
        let report_outcome = copy_json(get(&result, "outcome").unwrap(), ctx)?;
        let meta = obj(vec![
            ("origin", t("classified")),
            ("nativeSupplement", native_supplement),
            (
                "binding",
                obj(vec![("id", t(EXT)), ("version", t("1.0.0"))]),
            ),
            ("profile", profile),
            ("datumFormat", datum_format),
            ("obligation", obligation),
            ("outcome", report_outcome),
            ("observations", report_observations),
        ]);
        let modules = get_mut(&mut target, "modules")
            .and_then(|v| match v {
                Value::Array(a) => Some(a),
                _ => None,
            })
            .ok_or_else(|| err("POSTGRESQL_FACET_TARGET", "/modules", "Modules missing"))?;
        let elements = get_mut(&mut modules[mi], "elements")
            .and_then(|v| match v {
                Value::Array(a) => Some(a),
                _ => None,
            })
            .ok_or_else(|| err("POSTGRESQL_FACET_TARGET", "/elements", "Elements missing"))?;
        let selected = &mut elements[ei];
        if get(request, "author").is_none()
            && !matches!(&facets, Value::Object(fields) if fields.is_empty())
        {
            set(selected, "facets", copy_json(&facets, ctx)?)?;
        }
        let extensions = get_mut(selected, "extensions").ok_or_else(|| {
            err(
                "POSTGRESQL_FACET_TARGET",
                "/extensions",
                "Extensions missing",
            )
        })?;
        set(extensions, EXT, meta)?;
        validate_document(&target, rt, ctx)?;
        set(&mut result, "target", target)?;
    }
    validate(&result, &rt.result, ctx, "POSTGRESQL_FACET_RESULT")?;
    Ok(result)
}

pub fn classify(
    source: &Value,
    request: &Value,
    parser: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    classify_inner(
        &copy_json(source, ctx)?,
        &copy_json(request, ctx)?,
        &copy_json(parser, ctx)?,
        ctx,
    )
}
pub fn verify(
    receipt: &Value,
    current: &Value,
    parser: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    validate(receipt, &rt.result, ctx, "POSTGRESQL_FACET_RECEIPT")?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(err(
            "POSTGRESQL_FACET_RECEIPT",
            "/status",
            "Expected complete classified receipt",
        ));
    }
    let expected = classify_inner(
        get(receipt, "source").unwrap(),
        get(receipt, "request").unwrap(),
        parser,
        ctx,
    )?;
    if !equal(receipt, &expected, ctx)? {
        return Err(err(
            "POSTGRESQL_FACET_RECEIPT",
            "",
            "Receipt disagrees with retained native source and selected profile",
        ));
    }
    if !equal(
        current,
        get(receipt, "target")
            .ok_or_else(|| err("POSTGRESQL_FACET_RECEIPT", "/target", "Target required"))?,
        ctx,
    )? {
        return Err(err(
            "POSTGRESQL_FACET_STALE",
            "",
            "Target changed after classification",
        ));
    }
    copy_json(receipt, ctx)
}
pub fn recover(
    receipt: &Value,
    current: &Value,
    parser: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let verified = verify(receipt, current, parser, ctx)?;
    let req = get(&verified, "request").unwrap();
    Ok(obj(vec![
        (
            "nativeSource",
            Value::String(text(req, "nativeSource").unwrap().clone()),
        ),
        (
            "supplement",
            Value::String(text(req, "supplement").unwrap().clone()),
        ),
    ]))
}

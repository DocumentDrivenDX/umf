// SPDX-License-Identifier: MIT OR Apache-2.0
//! Loss-aware projection of explicitly authored core relationships to PostgreSQL.
use crate::{
    binding_inspection::BindingInspectionResources,
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};

const CORE: &str = include_str!("../../../spec/core/schema.json");
const REL_OP: &str = include_str!("../../../spec/core/relationship-operation.schema.json");
const LAYOUT: &str =
    include_str!("../../../spec/projections/postgresql-relationship-layout.schema.json");
const LAYOUT_RESULT: &str =
    include_str!("../../../spec/projections/postgresql-relationship-layout-result.schema.json");
const RESULT: &str =
    include_str!("../../../spec/core/relationship-postgresql-projection.schema.json");
const RECOVERY: &str = "Verified retained receipt recovers logical and physical authoring and emitted PostgreSQL SQL; imported native syntax does not establish authored relationship intent";

struct Runtime {
    engine: Engine,
    registry: Registry,
}
struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}
fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn s(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(a, b)| (k(a), b)).collect())
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(x, _)| x == &k(n)).map(|(_, v)| v)
    } else {
        None
    }
}
fn arr(v: Option<&Value>) -> &[Value] {
    if let Some(Value::Array(a)) = v {
        a
    } else {
        &[]
    }
}
fn text(v: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(x)) = v {
        Some(x)
    } else {
        None
    }
}
fn eq(v: Option<&Value>, x: &str) -> bool {
    text(v).is_some_and(|t| t.units().iter().copied().eq(x.encode_utf16()))
}
fn strv(v: Option<&Value>, code: &str, path: &str) -> Result<String, EngineError> {
    text(v)
        .ok_or_else(|| err(code, "Expected text", path))?
        .to_utf8()
        .map_err(|_| err(code, "Invalid UTF-16 text", path))
}
fn err(code: &str, msg: &str, path: &str) -> EngineError {
    EngineError::new(code, k(path), msg)
}
fn parse(src: &str, c: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&src.encode_utf16().collect::<Vec<_>>(), Format::Json, c)
}
fn runtime(c: &mut Context<'_>) -> Result<Arc<Runtime>, EngineError> {
    static CACHE: OnceLock<Arc<Runtime>> = OnceLock::new();
    if c.profile() == crate::context::ResourceProfile::Cooperative
        && c.limits() == crate::context::Limits::ordinary()
    {
        if let Some(x) = CACHE.get() {
            return Ok(x.clone());
        }
    }
    let engine = Engine::new(
        ResourceSet::new(
            parse(CORE, c)?,
            parse(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                c,
            )?,
            parse(
                include_str!("../../../spec/core/extension-package.schema.json"),
                c,
            )?,
            parse(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                c,
            )?,
            parse(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                c,
            )?,
        ),
        c,
    )?;
    let out = Arc::new(Runtime {
        engine,
        registry: Registry::new(),
    });
    if c.profile() == crate::context::ResourceProfile::Cooperative
        && c.limits() == crate::context::Limits::ordinary()
    {
        let _ = CACHE.set(out.clone());
    }
    Ok(out)
}
fn validate(
    v: &Value,
    schema: &Value,
    rt: &Runtime,
    c: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    let mut resources = rt.engine.schema_resources_with_context(c)?;
    for (uri, raw) in [
        ("urn:umf:core:relationship-operation:1.0.0", REL_OP),
        ("urn:umf:postgresql:relationship-layout:1.0.0", LAYOUT),
        (
            "urn:umf:postgresql:relationship-layout-result:1.0.0",
            LAYOUT_RESULT,
        ),
    ] {
        resources.entries.push((k(uri), parse(raw, c)?));
    }
    let compiled = CompiledSchema::compile(schema, &resources, c)?;
    if compiled.validate_codegen_errors(v, c)?.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "Value does not match the pinned relationship projection schema",
            "",
        ))
    }
}
fn canonical(v: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
    c.charge_work(1, Utf16::default())?;
    match v {
        Value::Array(xs) => Ok(Value::Array(
            xs.iter()
                .map(|x| canonical(x, c))
                .collect::<Result<_, _>>()?,
        )),
        Value::Object(xs) => {
            let mut out = Vec::with_capacity(xs.len());
            for (a, b) in xs {
                out.push((a.clone(), canonical(b, c)?));
            }
            out.sort_by(|a, b| a.0.cmp(&b.0));
            Ok(Value::Object(out))
        }
        Value::String(x) => {
            c.charge_work(x.len(), Utf16::default())?;
            Ok(Value::String(x.clone()))
        }
        _ => Ok(v.clone()),
    }
}
fn same(a: &Value, b: &Value, c: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(canonical(a, c)? == canonical(b, c)?)
}
fn set(v: &mut Value, n: &str, x: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("RELATIONSHIP_POSTGRESQL_RESULT", "Expected object", ""));
    };
    if let Some((_, old)) = m.iter_mut().find(|(a, _)| a == &k(n)) {
        *old = x
    } else {
        m.push((k(n), x));
    }
    Ok(())
}
fn loss(
    origin: &str,
    path: &str,
    value: &Value,
    reason: &str,
    outcome: &str,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(obj(vec![
        ("source", s(origin)),
        ("path", s(path)),
        ("value", copy_json(value, c)?),
        ("reason", s(reason)),
        ("outcome", s(outcome)),
    ]))
}
fn qualified(v: &str) -> Result<String, EngineError> {
    v.split('.')
        .map(quote)
        .collect::<Result<Vec<_>, _>>()
        .map(|x| x.join("."))
}
fn quote(v: &str) -> Result<String, EngineError> {
    if v.is_empty() || v.contains('\0') {
        return Err(err(
            "RELATIONSHIP_POSTGRESQL_IDENTIFIER",
            "Invalid PostgreSQL identifier",
            "/request/policy",
        ));
    }
    Ok(format!("\"{}\"", v.replace('"', "\"\"")))
}
fn id(v: &Value, names: &[&str]) -> String {
    names
        .iter()
        .map(|n| {
            text(get(v, n))
                .map(|x| {
                    x.units()
                        .iter()
                        .map(|u| format!("{u:04x}"))
                        .collect::<String>()
                })
                .unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join("\u{1f}")
}
fn pointer(name: &Utf16) -> String {
    let mut out = String::new();
    for unit in name.units() {
        match *unit as u8 {
            b'~' => out.push_str("~0"),
            b'/' => out.push_str("~1"),
            x if *unit < 128 => out.push(x as char),
            _ => out.push('\u{fffd}'),
        }
    }
    out
}
fn locate<'a>(doc: &'a Value, reference: &Value) -> Option<(&'a Value, String)> {
    let module = text(get(reference, "module"))?;
    let element = text(get(reference, "element"))?;
    let modules = arr(get(doc, "modules"));
    for (mi, m) in modules.iter().enumerate() {
        if text(get(m, "id")) == Some(module) {
            for (ei, e) in arr(get(m, "elements")).iter().enumerate() {
                if text(get(e, "id")) == Some(element) {
                    return Some((e, format!("/modules/{mi}/elements/{ei}")));
                }
            }
        }
    }
    None
}
fn residual_append(
    result: &mut Value,
    origin: &str,
    path: &str,
    value: &Value,
    reason: &str,
    outcome: &str,
    c: &mut Context<'_>,
) -> Result<(), EngineError> {
    let row = loss(origin, path, value, reason, outcome, c)?;
    let Value::Object(fields) = result else {
        return Err(err(
            "RELATIONSHIP_POSTGRESQL_RESULT",
            "Expected result object",
            "",
        ));
    };
    let (_, residuals) = fields
        .iter_mut()
        .find(|(name, _)| name == &k("residuals"))
        .ok_or_else(|| {
            err(
                "RELATIONSHIP_POSTGRESQL_RESULT",
                "Residual list is missing",
                "/residuals",
            )
        })?;
    let Value::Array(rows) = residuals else {
        return Err(err(
            "RELATIONSHIP_POSTGRESQL_RESULT",
            "Expected residual list",
            "/residuals",
        ));
    };
    rows.push(row);
    Ok(())
}
fn block(
    result: &mut Value,
    path: &str,
    value: &Value,
    reason: &str,
    c: &mut Context<'_>,
) -> Result<(), EngineError> {
    set(result, "status", s("blocked"))?;
    residual_append(result, "policy", path, value, reason, "not-expressible", c)
}
fn result_diagnostics(result: &mut Value, c: &mut Context<'_>) -> Result<(), EngineError> {
    let blocked = eq(get(result, "status"), "blocked");
    let mut rows = arr(get(result, "layout").and_then(|x| get(x, "diagnostics"))).to_vec();
    rows.extend(arr(get(result, "residuals")).iter().map(|r| {
        obj(vec![
            ("code", s("RELATIONSHIP_POSTGRESQL_RESIDUAL")),
            ("path", get(r, "path").cloned().unwrap_or(Value::Null)),
            ("message", get(r, "reason").cloned().unwrap_or(Value::Null)),
            ("severity", s(if blocked { "error" } else { "warning" })),
        ])
    }));
    set(result, "diagnostics", Value::Array(rows))?;
    let _ = c;
    Ok(())
}

fn prepare_inner(
    source_in: &Value,
    binding_in: &Value,
    authors_in: &Value,
    request_in: &Value,
    rt: &Runtime,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(source_in, c)?;
    let physical = copy_json(binding_in, c)?;
    let authors = copy_json(authors_in, c)?;
    let request = copy_json(request_in, c)?;
    let result_schema = parse(RESULT, c)?;
    let req_schema = get(get(&result_schema, "properties").unwrap(), "request").unwrap();
    validate(
        &request,
        req_schema,
        rt,
        c,
        "RELATIONSHIP_POSTGRESQL_REQUEST",
    )?;
    let validation = rt
        .engine
        .validate_document(&source, &rt.registry, &mut NoCapabilities, c)?;
    if !validation.valid || !eq(get(&source, "umf"), "0.10.0") {
        return Err(err(
            "RELATIONSHIP_POSTGRESQL_SOURCE",
            "Valid core 0.10.0 document required",
            "/source",
        ));
    }
    if text(get(&request, "profile")).is_none_or(|x| x != &k("new-keyed-tables")) {
        return Err(err(
            "RELATIONSHIP_POSTGRESQL_REQUEST",
            "Unsupported relationship profile",
            "/request/profile",
        ));
    }
    let policy = get(&request, "policy").ok_or_else(|| {
        err(
            "RELATIONSHIP_POSTGRESQL_REQUEST",
            "Policy required",
            "/request/policy",
        )
    })?;
    let resources = BindingInspectionResources::new(c)?;
    let layout = crate::postgresql_relationship_layout::validate_postgresql_relationship_layout(
        &resources, &source, &physical, policy, "report", c,
    )?;
    let mut out = obj(vec![
        ("operation", s("project-relationships-postgresql")),
        ("version", s("1.0.0")),
        ("status", s("projected")),
        ("source", copy_json(&source, c)?),
        ("physicalBinding", copy_json(&physical, c)?),
        ("authors", copy_json(&authors, c)?),
        ("request", copy_json(&request, c)?),
        (
            "binding",
            get(&result_schema, "properties")
                .and_then(|x| get(x, "binding"))
                .and_then(|x| get(x, "const"))
                .cloned()
                .unwrap_or(Value::Null),
        ),
        ("layout", copy_json(&layout, c)?),
        ("mappings", Value::Array(Vec::new())),
        ("residuals", Value::Array(Vec::new())),
        ("diagnostics", Value::Array(Vec::new())),
    ]);
    residual_append(&mut out,"logical","",&source,"Only explicitly inventoried new table columns, Keys and homogeneous relationship carriers are emitted; all other logical and native meanings remain retained","not-expressible",c)?;
    for row in arr(get(&layout, "residuals")) {
        residual_append(
            &mut out,
            text(get(row, "source"))
                .and_then(|x| x.to_utf8().ok())
                .as_deref()
                .unwrap_or("policy"),
            text(get(row, "path"))
                .and_then(|x| x.to_utf8().ok())
                .as_deref()
                .unwrap_or("/policy"),
            get(row, "value").unwrap_or(&Value::Null),
            &text(get(row, "reason"))
                .and_then(|x| x.to_utf8().ok())
                .unwrap_or_else(|| "Layout residual".into()),
            "unknown",
            c,
        )?;
    }
    let mut impossible = eq(get(&layout, "status"), "blocked");
    let layouts = arr(get(policy, "relationshipLayouts"));
    if arr(Some(&authors)).len() != layouts.len() {
        return Err(err(
            "RELATIONSHIP_POSTGRESQL_AUTHORS",
            "Exactly one verified declaration per requested relationship layout required",
            "/authors",
        ));
    }
    let mut seen = std::collections::HashSet::new();
    for author in arr(Some(&authors)) {
        if !eq(get(author, "operation"), "declare-core-relationship") {
            return Err(err(
                "RELATIONSHIP_POSTGRESQL_AUTHORS",
                "Explicit relationship declaration required",
                "/authors",
            ));
        }
        let target = get(author, "target").ok_or_else(|| {
            err(
                "RELATIONSHIP_POSTGRESQL_AUTHORS",
                "Declaration target required",
                "/authors",
            )
        })?;
        crate::core_relationships::verify_core_relationship_operation(
            author,
            target,
            &rt.engine,
            &rt.registry,
            &mut NoCapabilities,
            c,
        )?;
        let ident = get(author, "identity").ok_or_else(|| {
            err(
                "RELATIONSHIP_POSTGRESQL_AUTHORS",
                "Declaration identity required",
                "/authors",
            )
        })?;
        let reqid = get(author, "request")
            .and_then(|x| get(x, "id"))
            .ok_or_else(|| {
                err(
                    "RELATIONSHIP_POSTGRESQL_AUTHORS",
                    "Declaration request id required",
                    "/authors",
                )
            })?;
        let identity = obj(vec![
            (
                "module",
                get(ident, "module").cloned().unwrap_or(Value::Null),
            ),
            ("id", reqid.clone()),
        ]);
        let key = id(&identity, &["module", "id"]);
        if !seen.insert(key.clone())
            || !layouts.iter().any(|l| {
                id(
                    get(l, "relationship").unwrap_or(&Value::Null),
                    &["module", "id"],
                ) == key
            })
            || !same(
                get(target, "id").unwrap_or(&Value::Null),
                get(&source, "id").unwrap_or(&Value::Null),
                c,
            )?
        {
            return Err(err(
                "RELATIONSHIP_POSTGRESQL_AUTHORS",
                "Duplicate or mismatched declaration",
                "/authors",
            ));
        }
        let current = crate::core_relationships::lookup_core_relationship(
            &source,
            &identity,
            &rt.engine,
            &rt.registry,
            &mut NoCapabilities,
            c,
        )?;
        let previous = crate::core_relationships::lookup_core_relationship(
            target,
            &identity,
            &rt.engine,
            &rt.registry,
            &mut NoCapabilities,
            c,
        )?;
        if !same(
            get(&current, "relationship").unwrap_or(&Value::Null),
            get(&previous, "relationship").unwrap_or(&Value::Null),
            c,
        )? {
            return Err(err(
                "RELATIONSHIP_POSTGRESQL_STALE",
                "Relationship changed since declaration",
                "/authors",
            ));
        }
        let current_relationship = get(&current, "relationship").unwrap_or(&Value::Null);
        let mut endpoint_refs = arr(get(current_relationship, "source"))
            .iter()
            .chain(arr(get(current_relationship, "target")))
            .collect::<Vec<_>>();
        if let Some(association) = get(current_relationship, "associationRecord") {
            endpoint_refs.push(association);
        }
        for endpoint in endpoint_refs {
            let (current_record, _) = locate(&source, endpoint).ok_or_else(|| {
                err(
                    "RELATIONSHIP_POSTGRESQL_STALE",
                    "Missing endpoint",
                    "/source",
                )
            })?;
            let (authored_record, _) = locate(target, endpoint).ok_or_else(|| {
                err(
                    "RELATIONSHIP_POSTGRESQL_STALE",
                    "Missing authored endpoint",
                    "/authors",
                )
            })?;
            if !same(current_record, authored_record, c)? {
                return Err(err(
                    "RELATIONSHIP_POSTGRESQL_STALE",
                    "Endpoint Record or Key changed since declaration",
                    "/authors",
                ));
            }
            for member in arr(get(current_record, "members")) {
                let (current_field, _) = locate(&source, member).ok_or_else(|| {
                    err(
                        "RELATIONSHIP_POSTGRESQL_STALE",
                        "Missing endpoint Record member Field",
                        "/source",
                    )
                })?;
                let (authored_field, _) = locate(target, member).ok_or_else(|| {
                    err(
                        "RELATIONSHIP_POSTGRESQL_STALE",
                        "Missing authored endpoint Record member Field",
                        "/authors",
                    )
                })?;
                if !same(current_field, authored_field, c)? {
                    return Err(err(
                        "RELATIONSHIP_POSTGRESQL_STALE",
                        "Endpoint member Field changed since declaration",
                        "/authors",
                    ));
                }
            }
        }
    }
    for row in arr(get(&physical, "extensions")
        .and_then(|x| get(x, "umf.binding"))
        .and_then(|x| get(x, "indexes")))
    {
        residual_append(
            &mut out,
            "binding",
            "/extensions/umf.binding/indexes",
            row,
            "Physical indexes are outside this relationship generator",
            "not-expressible",
            c,
        )?;
    }
    for (i, row) in arr(get(&physical, "extensions")
        .and_then(|x| get(x, "umf.binding"))
        .and_then(|x| get(x, "fields")))
    .iter()
    .enumerate()
    {
        if !eq(get(row, "storage"), "column") {
            residual_append(
                &mut out,
                "binding",
                &format!("/extensions/umf.binding/fields/{i}"),
                row,
                "Embedded fields remain retained; the profile emits scalar keyed tables",
                "not-expressible",
                c,
            )?;
        }
    }
    if !eq(get(policy, "targetVersion"), "17.4") {
        impossible = true;
        block(
            &mut out,
            "/request/policy/targetVersion",
            get(policy, "targetVersion").unwrap_or(&Value::Null),
            "Only PostgreSQL 17.4 is qualified",
            c,
        )?;
    }
    for l in layouts {
        let relid = get(l, "relationship").unwrap_or(&Value::Null);
        let found = crate::core_relationships::lookup_core_relationship(
            &source,
            relid,
            &rt.engine,
            &rt.registry,
            &mut NoCapabilities,
            c,
        )?;
        let rel = get(&found, "relationship").unwrap_or(&Value::Null);
        if eq(get(l, "storage"), "edge") {
            impossible = true;
            block(
                &mut out,
                "/request/policy/relationshipLayouts",
                l,
                "Conditioned edge storage is outside the new keyed-table profile",
                c,
            )?;
        }
        for (name, val) in match rel {
            Value::Object(xs) => xs
                .iter()
                .map(|(k, v)| (k.to_utf8().unwrap_or_default(), v))
                .collect::<Vec<_>>(),
            _ => Vec::new(),
        } {
            residual_append(
                &mut out,
                "logical",
                "/relationship",
                val,
                &format!(
                    "Authored {name} obligation is not guaranteed by native FK existence checks"
                ),
                "approximated",
                c,
            )?;
        }
    }
    if impossible || eq(get(&request, "mode"), "strict") {
        set(&mut out, "status", s("blocked"))?;
        result_diagnostics(&mut out, c)?;
        return Ok(out);
    }
    // The detailed SQL candidate is emitted only after the complete layout and author checks pass.
    let candidate = build_candidate(&source, policy, c)?;
    let mut mappings = Vec::new();
    for l in layouts {
        let relref = get(l, "relationship").unwrap_or(&Value::Null);
        let looked = crate::core_relationships::lookup_core_relationship(
            &source,
            relref,
            &rt.engine,
            &rt.registry,
            &mut NoCapabilities,
            c,
        )?;
        let mut constraints = Vec::new();
        if eq(get(l, "storage"), "junction") {
            constraints.push(get(l, "sourceConstraint").cloned().unwrap_or(Value::Null));
        }
        constraints.push(get(l, "targetConstraint").cloned().unwrap_or(Value::Null));
        mappings.push(obj(vec![
            ("relationship", copy_json(relref, c)?),
            (
                "idealPath",
                get(&looked, "path").cloned().unwrap_or(Value::Null),
            ),
            (
                "carrierTable",
                get(l, "carrierTable").cloned().unwrap_or(Value::Null),
            ),
            ("constraints", Value::Array(constraints)),
            (
                "targetKey",
                get(l, "targetKey")
                    .and_then(|x| get(x, "key"))
                    .cloned()
                    .unwrap_or(Value::Null),
            ),
            ("outcome", s("approximated")),
        ]));
    }
    set(&mut out, "mappings", Value::Array(mappings))?;
    set(
        &mut out,
        "candidateSource",
        Value::String(Utf16::from(candidate)),
    )?;
    result_diagnostics(&mut out, c)?;
    Ok(out)
}
fn build_candidate(
    source: &Value,
    policy: &Value,
    c: &mut Context<'_>,
) -> Result<String, EngineError> {
    let mut tables: Vec<(String, Vec<String>)> = Vec::new();
    let mut table_names = std::collections::HashSet::new();
    for f in arr(get(policy, "fieldLayouts")) {
        let table = strv(
            get(f, "table"),
            "RELATIONSHIP_POSTGRESQL_POLICY",
            "/request/policy/fieldLayouts",
        )?;
        let column = strv(
            get(f, "column"),
            "RELATIONSHIP_POSTGRESQL_POLICY",
            "/request/policy/fieldLayouts",
        )?;
        let sql_type = strv(
            get(f, "sqlType"),
            "RELATIONSHIP_POSTGRESQL_POLICY",
            "/request/policy/fieldLayouts",
        )?;
        let nullable =
            eq(get(f, "nullable"), "true") || matches!(get(f, "nullable"), Some(Value::Bool(true)));
        let collation = if eq(get(f, "collation"), "C") {
            " COLLATE pg_catalog.\"C\""
        } else {
            ""
        };
        let row = tables.iter_mut().find(|(name, _)| name == &table);
        let def = format!(
            "{} {}{}{}",
            quote(&column)?,
            sql_type,
            collation,
            if nullable { "" } else { " NOT NULL" }
        );
        if let Some((_, cols)) = row {
            cols.push(def)
        } else {
            tables.push((table.clone(), vec![def]));
            table_names.insert(table);
        }
    }
    let mut sql = String::new();
    for layout in arr(get(policy, "relationshipLayouts")) {
        if eq(get(layout, "storage"), "junction") {
            let table = strv(
                get(layout, "carrierTable"),
                "RELATIONSHIP_POSTGRESQL_POLICY",
                "/request/policy/relationshipLayouts",
            )?;
            if !tables.iter().any(|(n, _)| n == &table) {
                let mut defs = Vec::new();
                for component in arr(get(layout, "sourceComponents"))
                    .iter()
                    .chain(arr(get(layout, "targetComponents")))
                {
                    let name = strv(
                        get(component, "carrierColumn"),
                        "RELATIONSHIP_POSTGRESQL_POLICY",
                        "/request/policy/relationshipLayouts",
                    )?;
                    let ty = strv(
                        get(component, "sqlType"),
                        "RELATIONSHIP_POSTGRESQL_POLICY",
                        "/request/policy/relationshipLayouts",
                    )?;
                    let coll = if eq(get(component, "collation"), "C") {
                        " COLLATE pg_catalog.\"C\""
                    } else {
                        ""
                    };
                    let nullable = matches!(get(component, "nullable"), Some(Value::Bool(true)));
                    defs.push(format!(
                        "{} {}{}{}",
                        quote(&name)?,
                        ty,
                        coll,
                        if nullable { "" } else { " NOT NULL" }
                    ));
                }
                tables.push((table, defs));
            }
        }
    }
    let schemas: std::collections::BTreeSet<String> = tables
        .iter()
        .filter_map(|(t, _)| t.split_once('.').map(|(schema, _)| schema.to_owned()))
        .collect();
    for schema in schemas {
        sql.push_str(&format!(
            "CREATE SCHEMA IF NOT EXISTS {};\n",
            quote(&schema)?
        ));
    }
    for (table, columns) in &tables {
        if columns.is_empty() || columns.len() > 1600 {
            return Err(err(
                "RELATIONSHIP_POSTGRESQL_POLICY",
                "PostgreSQL table requires 1..1600 columns",
                "/request/policy/fieldLayouts",
            ));
        }
        sql.push_str(&format!(
            "CREATE TABLE {} (\n  {}\n);\n",
            qualified(table)?,
            columns.join(",\n  ")
        ));
    }
    for key in arr(get(policy, "keyLayouts")) {
        let table = strv(
            get(key, "table"),
            "RELATIONSHIP_POSTGRESQL_POLICY",
            "/request/policy/keyLayouts",
        )?;
        let constraint = strv(
            get(key, "constraint"),
            "RELATIONSHIP_POSTGRESQL_POLICY",
            "/request/policy/keyLayouts",
        )?;
        let record_ref = get(key, "record").unwrap_or(&Value::Null);
        let record = locate(source, record_ref).map(|x| x.0).ok_or_else(|| {
            err(
                "RELATIONSHIP_POSTGRESQL_POLICY",
                "Key record unresolved",
                "/request/policy/keyLayouts",
            )
        })?;
        let kid = text(get(key, "key")).ok_or_else(|| {
            err(
                "RELATIONSHIP_POSTGRESQL_POLICY",
                "Key id required",
                "/request/policy/keyLayouts",
            )
        })?;
        let keydef = arr(get(record, "keys"))
            .iter()
            .find(|k| text(get(k, "id")) == Some(kid))
            .ok_or_else(|| {
                err(
                    "RELATIONSHIP_POSTGRESQL_POLICY",
                    "Key unresolved",
                    "/request/policy/keyLayouts",
                )
            })?;
        let columns = arr(get(key, "components"))
            .iter()
            .map(|x| {
                strv(
                    get(x, "column"),
                    "RELATIONSHIP_POSTGRESQL_POLICY",
                    "/request/policy/keyLayouts",
                )
                .and_then(|n| quote(&n))
            })
            .collect::<Result<Vec<_>, _>>()?;
        if columns.is_empty() || columns.len() > 32 {
            return Err(err(
                "RELATIONSHIP_POSTGRESQL_POLICY",
                "PostgreSQL Key requires 1..32 columns",
                "/request/policy/keyLayouts",
            ));
        }
        sql.push_str(&format!(
            "ALTER TABLE {} ADD CONSTRAINT {} {} ({}) NOT DEFERRABLE;\n",
            qualified(&table)?,
            quote(&constraint)?,
            if matches!(get(keydef, "primary"), Some(Value::Bool(true))) {
                "PRIMARY KEY"
            } else {
                "UNIQUE"
            },
            columns.join(", ")
        ));
    }
    let keymap: HashMap<String, &Value> = arr(get(policy, "keyLayouts"))
        .iter()
        .map(|x| {
            (
                id(
                    &obj(vec![
                        (
                            "module",
                            get(get(x, "record").unwrap_or(&Value::Null), "module")
                                .cloned()
                                .unwrap_or(Value::Null),
                        ),
                        (
                            "element",
                            get(get(x, "record").unwrap_or(&Value::Null), "element")
                                .cloned()
                                .unwrap_or(Value::Null),
                        ),
                        ("key", get(x, "key").cloned().unwrap_or(Value::Null)),
                    ]),
                    &["module", "element", "key"],
                ),
                x,
            )
        })
        .collect();
    for l in arr(get(policy, "relationshipLayouts")) {
        let carrier = strv(
            get(l, "carrierTable"),
            "RELATIONSHIP_POSTGRESQL_POLICY",
            "/request/policy/relationshipLayouts",
        )?;
        let target = get(l, "targetKey").unwrap_or(&Value::Null);
        let target_layout = keymap
            .get(&id(target, &["module", "element", "key"]))
            .ok_or_else(|| {
                err(
                    "RELATIONSHIP_POSTGRESQL_POLICY",
                    "Target key layout missing",
                    "/request/policy/relationshipLayouts",
                )
            })?;
        let tcols = arr(get(target_layout, "components"))
            .iter()
            .map(|x| {
                strv(
                    get(x, "column"),
                    "RELATIONSHIP_POSTGRESQL_POLICY",
                    "/request/policy/relationshipLayouts",
                )
                .and_then(|n| quote(&n))
            })
            .collect::<Result<Vec<_>, _>>()?;
        let target_table = strv(
            get(target_layout, "table"),
            "RELATIONSHIP_POSTGRESQL_POLICY",
            "/request/policy/relationshipLayouts",
        )?;
        let target_constraint = strv(
            get(l, "targetConstraint"),
            "RELATIONSHIP_POSTGRESQL_POLICY",
            "/request/policy/relationshipLayouts",
        )?;
        let carriercols = arr(get(l, "targetComponents"))
            .iter()
            .map(|x| {
                strv(
                    get(x, "carrierColumn"),
                    "RELATIONSHIP_POSTGRESQL_POLICY",
                    "/request/policy/relationshipLayouts",
                )
                .and_then(|n| quote(&n))
            })
            .collect::<Result<Vec<_>, _>>()?;
        sql.push_str(&format!("ALTER TABLE {} ADD CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {} ({}) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION NOT DEFERRABLE;\n",qualified(&carrier)?,quote(&target_constraint)?,carriercols.join(", "),qualified(&target_table)?,tcols.join(", ")));
        if eq(get(l, "storage"), "junction") {
            let source_key = get(l, "sourceKey").unwrap_or(&Value::Null);
            let source_layout = keymap
                .get(&id(source_key, &["module", "element", "key"]))
                .ok_or_else(|| {
                    err(
                        "RELATIONSHIP_POSTGRESQL_POLICY",
                        "Source key layout missing",
                        "/request/policy/relationshipLayouts",
                    )
                })?;
            let sourcecols = arr(get(l, "sourceComponents"))
                .iter()
                .map(|x| {
                    strv(
                        get(x, "carrierColumn"),
                        "RELATIONSHIP_POSTGRESQL_POLICY",
                        "/request/policy/relationshipLayouts",
                    )
                    .and_then(|n| quote(&n))
                })
                .collect::<Result<Vec<_>, _>>()?;
            let scolumns = arr(get(source_layout, "components"))
                .iter()
                .map(|x| {
                    strv(
                        get(x, "column"),
                        "RELATIONSHIP_POSTGRESQL_POLICY",
                        "/request/policy/relationshipLayouts",
                    )
                    .and_then(|n| quote(&n))
                })
                .collect::<Result<Vec<_>, _>>()?;
            let stable = strv(
                get(source_layout, "table"),
                "RELATIONSHIP_POSTGRESQL_POLICY",
                "/request/policy/relationshipLayouts",
            )?;
            let scon = strv(
                get(l, "sourceConstraint"),
                "RELATIONSHIP_POSTGRESQL_POLICY",
                "/request/policy/relationshipLayouts",
            )?;
            sql.push_str(&format!("ALTER TABLE {} ADD CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {} ({}) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION NOT DEFERRABLE;\n",qualified(&carrier)?,quote(&scon)?,sourcecols.join(", "),qualified(&stable)?,scolumns.join(", ")));
        }
    }
    let _ = (table_names, c);
    Ok(sql)
}

fn complete_inner(
    source: &Value,
    binding: &Value,
    authors: &Value,
    request: &Value,
    candidate_source: &Value,
    candidate_archive: &Value,
    native_source: &Value,
    target_archive: &Value,
    rt: &Runtime,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut prepared = prepare_inner(source, binding, authors, request, rt, c)?;
    if !eq(get(&prepared, "status"), "projected") {
        return Ok(prepared);
    }
    let expected = get(&prepared, "candidateSource").ok_or_else(|| {
        err(
            "RELATIONSHIP_POSTGRESQL_RESULT",
            "Rust candidate missing",
            "",
        )
    })?;
    if expected != candidate_source {
        return Err(err(
            "RELATIONSHIP_POSTGRESQL_ARCHIVE",
            "Host candidate differs from Rust generated SQL",
            "/candidateSource",
        ));
    }
    let imported = crate::postgresql_sql_runtime::get_postgresql_source(candidate_archive, c)?;
    if &imported != candidate_source {
        return Err(err(
            "RELATIONSHIP_POSTGRESQL_ARCHIVE",
            "Candidate archive does not retain generated SQL",
            "/candidateArchive",
        ));
    }
    let final_source = crate::postgresql_sql_runtime::get_postgresql_source(target_archive, c)?;
    if &final_source != native_source || native_source != candidate_source {
        return Err(err(
            "RELATIONSHIP_POSTGRESQL_ARCHIVE",
            "Target source differs from generated SQL candidate",
            "/nativeSource",
        ));
    }
    let candidate_tree = crate::postgresql_sql_runtime::get_postgresql_node(
        candidate_archive,
        &Utf16::default(),
        c,
    )?;
    let target_tree =
        crate::postgresql_sql_runtime::get_postgresql_node(target_archive, &Utf16::default(), c)?;
    if !same(&candidate_tree, &target_tree, c)? {
        return Err(err(
            "RELATIONSHIP_POSTGRESQL_ARCHIVE",
            "Candidate and final target parse trees differ",
            "/targetArchive",
        ));
    }
    set(&mut prepared, "target", copy_json(target_archive, c)?)?;
    set(&mut prepared, "nativeSql", copy_json(native_source, c)?)?;
    remove(&mut prepared, "candidateSource");
    validate(
        &prepared,
        &parse(RESULT, c)?,
        rt,
        c,
        "RELATIONSHIP_POSTGRESQL_RESULT",
    )?;
    Ok(prepared)
}
fn remove(v: &mut Value, name: &str) {
    if let Value::Object(m) = v {
        m.retain(|(k, _)| k != &Utf16::from(name));
    }
}
pub fn prepare_project_relationships_to_postgresql(
    source: &Value,
    binding: &Value,
    authors: &Value,
    request: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    prepare_inner(source, binding, authors, request, &rt, c)
}
pub fn complete_project_relationships_to_postgresql(
    source: &Value,
    binding: &Value,
    authors: &Value,
    request: &Value,
    candidate_source: &Value,
    candidate_archive: &Value,
    native_source: &Value,
    target_archive: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    complete_inner(
        source,
        binding,
        authors,
        request,
        candidate_source,
        candidate_archive,
        native_source,
        target_archive,
        &rt,
        c,
    )
}
pub fn block_project_relationships_to_postgresql(
    source: &Value,
    binding: &Value,
    authors: &Value,
    request: &Value,
    path: &Value,
    message: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    let mut r = prepare_inner(source, binding, authors, request, &rt, c)?;
    if !eq(get(&r, "status"), "projected") {
        return Ok(r);
    }
    set(&mut r, "status", s("blocked"))?;
    let p = text(Some(path))
        .and_then(|x| x.to_utf8().ok())
        .unwrap_or_else(|| "/policy".into());
    let m = text(Some(message))
        .and_then(|x| x.to_utf8().ok())
        .unwrap_or_else(|| "PostgreSQL parser/deparser/codec rejected generated SQL".into());
    residual_append(&mut r, "policy", &p, request, &m, "not-expressible", c)?;
    result_diagnostics(&mut r, c)?;
    remove(&mut r, "candidateSource");
    validate(
        &r,
        &parse(RESULT, c)?,
        &rt,
        c,
        "RELATIONSHIP_POSTGRESQL_RESULT",
    )?;
    Ok(r)
}

fn verify_inner(
    receipt: &Value,
    current: &Value,
    candidate_source: &Value,
    candidate_archive: &Value,
    rt: &Runtime,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    validate(
        receipt,
        &parse(RESULT, c)?,
        rt,
        c,
        "RELATIONSHIP_POSTGRESQL_RECEIPT",
    )?;
    if !eq(get(receipt, "status"), "projected") {
        return Err(err(
            "RELATIONSHIP_POSTGRESQL_RECEIPT",
            "Successful projection receipt required",
            "",
        ));
    }
    let source = get(receipt, "source").unwrap();
    let binding = get(receipt, "physicalBinding").unwrap();
    let authors = get(receipt, "authors").unwrap();
    let request = get(receipt, "request").unwrap();
    let native_source = get(receipt, "nativeSql").unwrap();
    let target = get(receipt, "target").unwrap();
    let expected = complete_inner(
        source,
        binding,
        authors,
        request,
        candidate_source,
        candidate_archive,
        native_source,
        target,
        rt,
        c,
    )?;
    if !same(&expected, receipt, c)? {
        return Err(err(
            "RELATIONSHIP_POSTGRESQL_RECEIPT",
            "Receipt differs from the completed retained projection",
            "",
        ));
    }
    if crate::postgresql_sql_runtime::get_postgresql_source(current, c)? != *native_source
        || !same(
            &crate::postgresql_sql_runtime::get_postgresql_node(current, &Utf16::default(), c)?,
            &crate::postgresql_sql_runtime::get_postgresql_node(target, &Utf16::default(), c)?,
            c,
        )?
    {
        return Err(err(
            "RELATIONSHIP_POSTGRESQL_STALE",
            "Current PostgreSQL source or syntax tree differs from retained target",
            "/current",
        ));
    }
    copy_json(receipt, c)
}

pub fn verify_relationships_postgresql_projection(
    receipt: &Value,
    current: &Value,
    candidate_source: &Value,
    candidate_archive: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    verify_inner(
        receipt,
        current,
        candidate_source,
        candidate_archive,
        &rt,
        c,
    )
}
pub fn recover_relationships_postgresql_ideal(
    receipt: &Value,
    current: &Value,
    candidate_source: &Value,
    candidate_archive: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let r = verify_relationships_postgresql_projection(
        receipt,
        current,
        candidate_source,
        candidate_archive,
        c,
    )?;
    copy_json(get(&r, "source").unwrap(), c)
}
pub fn recover_relationships_postgresql_native(
    receipt: &Value,
    current: &Value,
    candidate_source: &Value,
    candidate_archive: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let r = verify_relationships_postgresql_projection(
        receipt,
        current,
        candidate_source,
        candidate_archive,
        c,
    )?;
    copy_json(get(&r, "nativeSql").unwrap(), c)
}

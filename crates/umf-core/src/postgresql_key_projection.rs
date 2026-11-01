// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned projection of authored core Keys to PostgreSQL constraints.
use crate::{
    context::Context,
    core_keys,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use num_bigint::BigInt;
use num_traits::{One, Zero};
use std::sync::{Arc, OnceLock};

const CORE: &str = include_str!("../../../spec/core/schema.json");
const KEY_OPERATION: &str = include_str!("../../../spec/core/key-operation-v2.schema.json");
const RESULT: &str = include_str!("../../../spec/core/key-postgresql-projection.schema.json");
const RECOVERY: &str = "Recover authored source from retained receipt; native import alone does not recover authored identity";
const SUBSET: &str = "Authored keys on a newly created ordinary table; explicit NOT DEFERRABLE primary/alternate constraints and NOT NULL, deterministic C text equality, checked facets; stored representable values only, no input coercion, descendant or deployed-state guarantee";

fn k(v: &str) -> Utf16 {
    Utf16::from(v)
}
fn s(v: &str) -> Value {
    Value::string_utf8(v)
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(a, b)| (k(a), b)).collect())
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
    if let Some(Value::String(s)) = v {
        Some(s)
    } else {
        None
    }
}
fn text_is(v: Option<&Value>, expected: &str) -> bool {
    text(v).is_some_and(|actual| actual == &k(expected))
}
fn utf8(v: Option<&Value>, code: &str, path: &str) -> Result<String, EngineError> {
    text(v)
        .ok_or_else(|| err(code, "Expected a string", path))?
        .to_utf8()
        .map_err(|_| err(code, "Expected valid Unicode", path))
}
fn err(code: &str, message: impl Into<String>, path: &str) -> EngineError {
    EngineError::new(code, k(path), message.into())
}
fn parse(v: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&v.encode_utf16().collect::<Vec<_>>(), Format::Json, ctx)
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
struct Runtime {
    engine: Engine,
    registry: Registry,
}
fn runtime(ctx: &mut Context<'_>) -> Result<Arc<Runtime>, EngineError> {
    static CACHE: OnceLock<Arc<Runtime>> = OnceLock::new();
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        if let Some(r) = CACHE.get() {
            return Ok(r.clone());
        }
    }
    let engine = Engine::new(
        ResourceSet::new(
            parse(CORE, ctx)?,
            parse(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            parse(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            parse(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            parse(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                ctx,
            )?,
        ),
        ctx,
    )?;
    let value = Arc::new(Runtime {
        engine,
        registry: Registry::new(),
    });
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        let _ = CACHE.set(value.clone());
    }
    Ok(value)
}
fn result_schema(
    rt: &Runtime,
    ctx: &mut Context<'_>,
) -> Result<(CompiledSchema, CompiledSchema), EngineError> {
    let schema = parse(RESULT, ctx)?;
    let mut resources = rt.engine.schema_resources_with_context(ctx)?;
    resources.entries.push((
        k("urn:umf:core:key-operation:2.0.0"),
        parse(KEY_OPERATION, ctx)?,
    ));
    let result = CompiledSchema::compile(&schema, &resources, ctx)?;
    let req = get(
        get(&schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| err("KEY_POSTGRESQL_RESULT", "Request schema missing", ""))?;
    Ok((result, CompiledSchema::compile(req, &resources, ctx)?))
}
fn valid(
    schema: &CompiledSchema,
    value: &Value,
    code: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let errors = schema.validate(value, ctx)?;
    if errors.is_empty() {
        Ok(())
    } else {
        Err(EngineError::new(
            code,
            errors[0].instance_path.clone(),
            "Value does not match its pinned schema",
        ))
    }
}
fn same(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canon(v: &Value, c: &mut Context<'_>, d: usize) -> Result<Value, EngineError> {
        if d > c.limits().max_depth {
            return Err(err(
                "RESOURCE_LIMIT",
                "Receipt comparison depth exceeded",
                "",
            ));
        }
        c.charge_work(1, k("/receipt"))?;
        match v {
            Value::Array(items) => {
                let mut o = Vec::with_capacity(items.len());
                for x in items {
                    o.push(canon(x, c, d + 1)?);
                }
                Ok(Value::Array(o))
            }
            Value::Object(items) => {
                let mut o = Vec::with_capacity(items.len());
                for (n, x) in items {
                    o.push((n.clone(), canon(x, c, d + 1)?));
                }
                o.sort_by(|a, b| a.0.cmp(&b.0));
                Ok(Value::Object(o))
            }
            _ => copy_json(v, c),
        }
    }
    Ok(canon(a, ctx, 0)? == canon(b, ctx, 0)?)
}
fn any_same(values: &[Value], needle: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    for value in values {
        if same(value, needle, ctx)? {
            return Ok(true);
        }
    }
    Ok(false)
}
fn pointer_key(key: &Utf16) -> Utf16 {
    let mut o = Vec::new();
    for u in key.units() {
        match *u {
            0x7e => o.extend([0x7e, 0x30]),
            0x2f => o.extend([0x7e, 0x31]),
            x => o.push(x),
        }
    }
    Utf16::new(o)
}
fn pointer_path(base: &str, key: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_work(key.len(), k(base))?;
    let mut o = base.encode_utf16().collect::<Vec<_>>();
    o.push(b'/' as u16);
    o.extend_from_slice(pointer_key(key).units());
    Ok(Utf16::new(o))
}
fn residual(
    out: &mut Vec<Value>,
    path: impl Into<Utf16>,
    value: &Value,
    reason: &str,
    outcome: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    out.push(obj(vec![
        ("path", Value::String(path.into())),
        ("value", copy_json(value, ctx)?),
        ("reason", s(reason)),
        ("outcome", s(outcome)),
        ("recovery", s(RECOVERY)),
    ]));
    Ok(())
}
fn diagnostics(
    residuals: &[Value],
    blocked: bool,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut out = Vec::new();
    for r in residuals {
        ctx.charge_work(1, k("/diagnostics"))?;
        out.push(obj(vec![
            ("code", s("KEY_POSTGRESQL_LOSS")),
            (
                "path",
                copy_json(get(r, "path").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                "message",
                copy_json(get(r, "reason").unwrap_or(&Value::Null), ctx)?,
            ),
            ("severity", s(if blocked { "error" } else { "warning" })),
        ]));
    }
    Ok(Value::Array(out))
}
fn quote_identifier(
    value: &Utf16,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let text = value.to_utf8().map_err(|_| {
        err(
            "POSTGRESQL_FIELD_IDENTIFIER",
            "Expected valid Unicode identifier",
            path,
        )
    })?;
    if text.is_empty() || text.contains('\0') || text.as_bytes().len() > 63 {
        return Err(err(
            "POSTGRESQL_FIELD_IDENTIFIER",
            "Expected nonempty PostgreSQL identifier of at most 63 UTF-8 bytes",
            path,
        ));
    }
    ctx.charge_work(text.len(), k(path))?;
    Ok(format!("\"{}\"", text.replace('"', "\"\"")))
}
fn native_type(name: &str) -> Option<(&'static str, &'static str)> {
    Some(match name {
        "boolean" => ("bool", "boolean"),
        "smallint" => ("int2", "integer"),
        "integer" => ("int4", "integer"),
        "bigint" => ("int8", "integer"),
        "numeric" => ("numeric", "decimal"),
        "real" => ("float4", "float"),
        "double precision" => ("float8", "float"),
        "text" => ("text", "string"),
        "bytea" => ("bytea", "binary"),
        "date" => ("date", "date"),
        "time" => ("time", "time"),
        "time with time zone" => ("timetz", "time"),
        "timestamp" => ("timestamp", "timestamp"),
        "timestamp with time zone" => ("timestamptz", "timestamp"),
        _ => return None,
    })
}
fn identity_equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(same(
        get(a, "module").unwrap_or(&Value::Null),
        get(b, "module").unwrap_or(&Value::Null),
        ctx,
    )? && same(
        get(a, "element").unwrap_or(&Value::Null),
        get(b, "element").unwrap_or(&Value::Null),
        ctx,
    )?)
}
fn path_for<'a>(
    source: &'a Value,
    module: &Utf16,
    element: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(usize, usize, &'a Value, String), EngineError> {
    let modules = arr(get(source, "modules"));
    let mut mi = None;
    for (i, m) in modules.iter().enumerate() {
        ctx.charge_work(1, k("/modules"))?;
        if text(get(m, "id")) == Some(module) {
            mi = Some(i);
            break;
        }
    }
    let mi = mi.ok_or_else(|| {
        err(
            "KEY_POSTGRESQL_REFERENCE",
            "Unresolved module identity",
            "/record/module",
        )
    })?;
    let elements = arr(get(&modules[mi], "elements"));
    let mut ei = None;
    for (i, e) in elements.iter().enumerate() {
        ctx.charge_work(1, k("/modules"))?;
        if text(get(e, "id")) == Some(element) {
            ei = Some(i);
            break;
        }
    }
    let ei = ei.ok_or_else(|| {
        err(
            "KEY_POSTGRESQL_REFERENCE",
            "Unresolved element identity",
            "/record/element",
        )
    })?;
    Ok((
        mi,
        ei,
        &elements[ei],
        format!("/modules/{mi}/elements/{ei}"),
    ))
}
fn key_lookup(
    source: &Value,
    record: &Value,
    id: &Value,
    rt: &Runtime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let identity = obj(vec![
        (
            "module",
            copy_json(get(record, "module").unwrap_or(&Value::Null), ctx)?,
        ),
        (
            "element",
            copy_json(get(record, "element").unwrap_or(&Value::Null), ctx)?,
        ),
        ("key", copy_json(id, ctx)?),
    ]);
    let mut caps = NoCapabilities;
    core_keys::lookup_core_key(source, &identity, &rt.engine, &rt.registry, &mut caps, ctx)
}

fn set(v: &mut Value, name: &str, value: Value) -> Result<(), EngineError> {
    if let Value::Object(m) = v {
        if let Some((_, slot)) = m.iter_mut().find(|(key, _)| key == &k(name)) {
            *slot = value;
            return Ok(());
        }
        m.push((k(name), value));
        Ok(())
    } else {
        Err(err("KEY_POSTGRESQL_RESULT", "Expected an object", ""))
    }
}
fn text_owned(v: Option<&Value>) -> Option<String> {
    text(v).and_then(|x| x.to_utf8().ok())
}
fn number_u64(v: Option<&Value>) -> Option<u64> {
    match v {
        Some(Value::Number(n))
            if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 && *n <= 9_007_199_254_740_991.0 =>
        {
            Some(*n as u64)
        }
        _ => None,
    }
}
fn checked(
    schema: &CompiledSchema,
    value: &Value,
    code: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let errors = schema.validate(value, ctx)?;
    if errors.is_empty() {
        Ok(())
    } else {
        Err(EngineError::new(
            code,
            errors[0].instance_path.clone(),
            "Value does not match its pinned schema",
        ))
    }
}
fn schemas(
    rt: &Runtime,
    ctx: &mut Context<'_>,
) -> Result<(CompiledSchema, CompiledSchema), EngineError> {
    let root = parse(RESULT, ctx)?;
    let mut resources = rt.engine.schema_resources_with_context(ctx)?;
    resources.entries.push((
        k("urn:umf:core:key-operation:2.0.0"),
        parse(KEY_OPERATION, ctx)?,
    ));
    let result = CompiledSchema::compile(&root, &resources, ctx)?;
    let request = get(get(&root, "properties").unwrap_or(&Value::Null), "request")
        .ok_or_else(|| err("KEY_POSTGRESQL_SCHEMA", "Request schema is missing", ""))?;
    Ok((result, CompiledSchema::compile(request, &resources, ctx)?))
}
fn project(
    source_in: &Value,
    authors_in: &Value,
    request_in: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    let (result_schema, request_schema) = schemas(&rt, ctx)?;
    let source = copy_json(source_in, ctx)?;
    let authors = copy_json(authors_in, ctx)?;
    let request = copy_json(request_in, ctx)?;
    checked(&request_schema, &request, "KEY_POSTGRESQL_REQUEST", ctx)?;
    if !text_is(get(&source, "umf"), "0.10.0") {
        return Err(err(
            "KEY_POSTGRESQL_SOURCE",
            "Valid explicit core 0.10.0 required",
            "/umf",
        ));
    }
    let mut caps = NoCapabilities;
    let validation = rt
        .engine
        .validate_document(&source, &rt.registry, &mut caps, ctx)?;
    if !validation.valid {
        return Err(err(
            "KEY_POSTGRESQL_SOURCE",
            "Valid explicit core 0.10.0 required",
            "/",
        ));
    }
    let record = get(&request, "record").ok_or_else(|| {
        err(
            "KEY_POSTGRESQL_RECORD",
            "Record identity is required",
            "/request/record",
        )
    })?;
    let rid = obj(vec![
        (
            "module",
            copy_json(get(record, "module").unwrap_or(&Value::Null), ctx)?,
        ),
        (
            "element",
            copy_json(get(record, "element").unwrap_or(&Value::Null), ctx)?,
        ),
    ]);
    let module = text(get(&rid, "module")).ok_or_else(|| {
        err(
            "KEY_POSTGRESQL_RECORD",
            "Module id is required",
            "/request/record/module",
        )
    })?;
    let element = text(get(&rid, "element")).ok_or_else(|| {
        err(
            "KEY_POSTGRESQL_RECORD",
            "Element id is required",
            "/request/record/element",
        )
    })?;
    let (_, _, record_value, record_path) = path_for(&source, module, element, ctx)?;
    if !text_is(get(record_value, "kind"), "record") {
        return Err(err(
            "KEY_POSTGRESQL_RECORD",
            "Selected identity must name a Record",
            "/request/record",
        ));
    }
    let declared = arr(get(record_value, "keys"));
    let members = arr(get(record_value, "members"));
    if declared.is_empty() || members.is_empty() {
        return Err(err(
            "KEY_POSTGRESQL_RECORD",
            "Selected Record must have authored keys and explicit membership",
            "/request/record",
        ));
    }
    let author_values = match &authors {
        Value::Array(v) => v,
        _ => {
            return Err(err(
                "KEY_POSTGRESQL_AUTHORS",
                "Expected an array of key declarations",
                "/authors",
            ))
        }
    };
    if author_values.len() != declared.len() {
        return Err(err(
            "KEY_POSTGRESQL_AUTHORS",
            "Exactly one verified declaration for every current key is required",
            "/authors",
        ));
    }
    let mut seen = Vec::<Value>::new();
    for author in author_values {
        if !text_is(get(author, "operation"), "declare-core-key") {
            return Err(err(
                "KEY_POSTGRESQL_AUTHORS",
                "Expected key declarations",
                "/authors",
            ));
        }
        let target = get(author, "target").ok_or_else(|| {
            err(
                "KEY_POSTGRESQL_AUTHORS",
                "Target is missing",
                "/authors/target",
            )
        })?;
        core_keys::verify_core_key_operation(
            author,
            target,
            &rt.engine,
            &rt.registry,
            &mut caps,
            ctx,
        )?;
        let author_identity = get(author, "identity").ok_or_else(|| {
            err(
                "KEY_POSTGRESQL_AUTHORS",
                "Identity is missing",
                "/authors/identity",
            )
        })?;
        if !identity_equal(&rid, author_identity, ctx)?
            || !same(
                get(target, "id").unwrap_or(&Value::Null),
                get(&source, "id").unwrap_or(&Value::Null),
                ctx,
            )?
        {
            return Err(err(
                "KEY_POSTGRESQL_AUTHORS",
                "Mismatched source or Record identity",
                "/authors",
            ));
        }
        let id = get(get(author, "request").unwrap_or(&Value::Null), "id").ok_or_else(|| {
            err(
                "KEY_POSTGRESQL_AUTHORS",
                "Key request id is missing",
                "/authors/request/id",
            )
        })?;
        if any_same(&seen, id, ctx)? {
            return Err(err(
                "KEY_POSTGRESQL_AUTHORS",
                "Duplicate key declaration",
                "/authors",
            ));
        }
        seen.push(copy_json(id, ctx)?);
        let current = key_lookup(&source, &rid, id, &rt, ctx)?;
        let prior = key_lookup(target, &rid, id, &rt, ctx)?;
        if !same(
            get(&current, "key").unwrap_or(&Value::Null),
            get(&prior, "key").unwrap_or(&Value::Null),
            ctx,
        )? {
            return Err(err(
                "KEY_POSTGRESQL_STALE",
                "Key meaning changed since declaration",
                "/authors",
            ));
        }
        let key_fields = arr(get(get(&current, "key").unwrap_or(&Value::Null), "fields"));
        for component in key_fields {
            let module_id = text(get(component, "module")).ok_or_else(|| {
                err(
                    "KEY_POSTGRESQL_AUTHORS",
                    "Component module is missing",
                    "/authors",
                )
            })?;
            let element_id = text(get(component, "element")).ok_or_else(|| {
                err(
                    "KEY_POSTGRESQL_AUTHORS",
                    "Component element is missing",
                    "/authors",
                )
            })?;
            let (_, _, now, _) = path_for(&source, module_id, element_id, ctx)?;
            let (_, _, old, _) = path_for(target, module_id, element_id, ctx)?;
            if !same(now, old, ctx)? {
                return Err(err(
                    "KEY_POSTGRESQL_STALE",
                    "Key component changed since declaration",
                    "/authors",
                ));
            }
        }
        let target_record = path_for(target, module, element, ctx)?.2;
        let old_members = arr(get(target_record, "members"));
        for component in key_fields {
            let mut now = None;
            for member in members {
                if identity_equal(member, component, ctx)? {
                    now = Some(member);
                    break;
                }
            }
            let mut old = None;
            for member in old_members {
                if identity_equal(member, component, ctx)? {
                    old = Some(member);
                    break;
                }
            }
            let qualifiers_match = match now.zip(old) {
                Some((a, b)) => same(a, b, ctx)?,
                None => false,
            };
            if !qualifiers_match {
                return Err(err(
                    "KEY_POSTGRESQL_STALE",
                    "Key ownership qualifier changed since declaration",
                    "/authors",
                ));
            }
        }
    }
    let columns = arr(get(&request, "columns"));
    let mut mapped = Vec::<(Value, Value)>::new();
    let mut names = Vec::<Value>::new();
    for col in columns {
        let field = get(col, "field").ok_or_else(|| {
            err(
                "KEY_POSTGRESQL_COLUMNS",
                "Field identity is required",
                "/request/columns/field",
            )
        })?;
        let name = get(col, "name").ok_or_else(|| {
            err(
                "KEY_POSTGRESQL_COLUMNS",
                "Column name is required",
                "/request/columns/name",
            )
        })?;
        let mut duplicate_field = false;
        for (f, _) in &mapped {
            if identity_equal(f, field, ctx)? {
                duplicate_field = true;
                break;
            }
        }
        let duplicate_name = any_same(&names, name, ctx)?;
        let mut owned = false;
        for member in members {
            if identity_equal(member, field, ctx)? {
                owned = true;
                break;
            }
        }
        if duplicate_field || duplicate_name || !owned {
            return Err(err(
                "KEY_POSTGRESQL_COLUMNS",
                "Column identities and names must be unique and Record-owned",
                "/request/columns",
            ));
        }
        mapped.push((copy_json(field, ctx)?, copy_json(col, ctx)?));
        names.push(copy_json(name, ctx)?);
    }
    if mapped.len() != members.len() {
        return Err(err(
            "KEY_POSTGRESQL_COLUMNS",
            "Map every owned Field explicitly",
            "/request/columns",
        ));
    }
    let namespace = text_owned(get(&request, "namespace")).ok_or_else(|| {
        err(
            "KEY_POSTGRESQL_REQUEST",
            "Namespace is required",
            "/request/namespace",
        )
    })?;
    let table_name = text_owned(get(&request, "tableName")).ok_or_else(|| {
        err(
            "KEY_POSTGRESQL_REQUEST",
            "Table name is required",
            "/request/tableName",
        )
    })?;
    let ns = quote_identifier(&k(&namespace), "/request/namespace", ctx)?;
    let table = quote_identifier(&k(&table_name), "/request/tableName", ctx)?;
    let mut key_names = Vec::<(Value, Value)>::new();
    let mut constraint_names = Vec::<Value>::new();
    for item in arr(get(&request, "keyNames")) {
        let id = get(item, "keyId").ok_or_else(|| {
            err(
                "KEY_POSTGRESQL_NAMES",
                "Key id is required",
                "/request/keyNames",
            )
        })?;
        let name = get(item, "name").ok_or_else(|| {
            err(
                "KEY_POSTGRESQL_NAMES",
                "Constraint name is required",
                "/request/keyNames",
            )
        })?;
        quote_identifier(
            text(Some(name)).ok_or_else(|| {
                err(
                    "KEY_POSTGRESQL_NAMES",
                    "Name must be string",
                    "/request/keyNames",
                )
            })?,
            "/request/keyNames/name",
            ctx,
        )?;
        let mut duplicate_id = false;
        for (old, _) in &key_names {
            if same(old, id, ctx)? {
                duplicate_id = true;
                break;
            }
        }
        let duplicate_name = any_same(&constraint_names, name, ctx)?;
        let mut declared_key = false;
        for candidate in declared {
            if same(get(candidate, "id").unwrap_or(&Value::Null), id, ctx)? {
                declared_key = true;
                break;
            }
        }
        if duplicate_id
            || duplicate_name
            || same(
                name,
                get(&request, "tableName").unwrap_or(&Value::Null),
                ctx,
            )?
            || !declared_key
        {
            return Err(err(
                "KEY_POSTGRESQL_NAMES",
                "Bind each stable key ID to a distinct native constraint name",
                "/request/keyNames",
            ));
        }
        key_names.push((copy_json(id, ctx)?, copy_json(name, ctx)?));
        constraint_names.push(copy_json(name, ctx)?);
    }
    if key_names.len() != declared.len() {
        return Err(err(
            "KEY_POSTGRESQL_NAMES",
            "Missing native key name",
            "/request/keyNames",
        ));
    }
    let mut result = obj(vec![
        ("operation", s("project-keys-postgresql")),
        ("version", s("1.0.0")),
        ("status", s("projected")),
        ("source", copy_json(&source, ctx)?),
        ("authors", copy_json(&authors, ctx)?),
        ("request", copy_json(&request, ctx)?),
        (
            "binding",
            obj(vec![
                ("id", s("umf.postgresql.keys")),
                ("version", s("1.0.0")),
                ("nativeVersion", s("17.4")),
                ("subset", s(SUBSET)),
            ]),
        ),
        ("mappings", Value::Array(vec![])),
        ("residuals", Value::Array(vec![])),
        ("diagnostics", Value::Array(vec![])),
    ]);
    let mut residuals = Vec::new();
    let mut mappings = Vec::new();
    let mut definitions = Vec::<String>::new();
    let mut impossible = false;
    if columns.len() > 1600 {
        impossible = true;
        residual(&mut residuals, k("/request/columns"), &request, "Pinned PostgreSQL supports at most 1600 table columns; tuple-size limits still apply below that bound", "not-expressible", ctx)?;
    }
    residual(&mut residuals,k("/"),&source,"Only selected Record column carriers and key tuple declarations are emitted; all other metadata and unknown content remain in this retained source residual","not-expressible",ctx)?;
    for (i, (field, col)) in mapped.iter().enumerate() {
        let m = text(get(field, "module")).ok_or_else(|| {
            err(
                "KEY_POSTGRESQL_COLUMNS",
                "Module id missing",
                "/request/columns",
            )
        })?;
        let e = text(get(field, "element")).ok_or_else(|| {
            err(
                "KEY_POSTGRESQL_COLUMNS",
                "Element id missing",
                "/request/columns",
            )
        })?;
        let (_, _, f, path) = path_for(&source, m, e, ctx)?;
        let cname = text(get(col, "name"))
            .ok_or_else(|| err("KEY_POSTGRESQL_COLUMNS", "Name missing", "/request/columns"))?;
        let qname = quote_identifier(cname, &format!("/request/columns/{i}/name"), ctx)?;
        let column_name = cname.to_utf8().map_err(|_| {
            err(
                "KEY_POSTGRESQL_COLUMN_NAME",
                "Expected valid Unicode column name",
                "/request/columns/name",
            )
        })?;
        if ["tableoid", "xmin", "cmin", "xmax", "cmax", "ctid"].contains(&column_name.as_str()) {
            return Err(err(
                "KEY_POSTGRESQL_COLUMN_NAME",
                "Native system columns cannot name user Fields",
                "/request/columns/name",
            ));
        }
        let native = text_owned(get(col, "nativeType")).ok_or_else(|| {
            err(
                "KEY_POSTGRESQL_COLUMNS",
                "nativeType missing",
                "/request/columns",
            )
        })?;
        let (sql_type, family) = native_type(&native).ok_or_else(|| {
            err(
                "KEY_POSTGRESQL_COLUMNS",
                "Unsupported PostgreSQL carrier",
                "/request/columns/nativeType",
            )
        })?;
        let scalar = text_owned(get(f, "scalarType")).unwrap_or_default();
        let numeric_integer = native == "numeric" && scalar == "integer";
        let mut valid = text_is(get(f, "kind"), "field")
            && text_is(get(f, "cardinality"), "one")
            && get(f, "itemType").is_none()
            && arr(get(f, "references"))
                .iter()
                .all(|r| !text_is(get(r, "role"), "record-type"))
            && (scalar == family || numeric_integer);
        if !valid {
            impossible = true;
            residual(
                &mut residuals,
                k(&path),
                f,
                "Selected scalar carrier conflicts with Field family or shape",
                "not-expressible",
                ctx,
            )?;
            continue;
        }
        let mut sql = format!("{qname} pg_catalog.{sql_type}");
        if native == "text" {
            sql.push_str(" COLLATE pg_catalog.\"C\"");
        }
        let mut checks = Vec::<String>::new();
        if numeric_integer {
            checks.push(format!("{qname} NOT IN ('NaN'::pg_catalog.numeric, 'Infinity'::pg_catalog.numeric, '-Infinity'::pg_catalog.numeric)"));
            checks.push(format!(
                "{qname} OPERATOR(pg_catalog.=) pg_catalog.trunc({qname}, 0)"
            ));
        }
        let facets = get(f, "facets").unwrap_or(&Value::Null);
        if let Some(width) = get(facets, "integerWidth") {
            let bits = number_u64(get(width, "bits")).ok_or_else(|| {
                err(
                    "KEY_POSTGRESQL_FACET",
                    "integerWidth.bits must be a safe positive integer",
                    &format!("{path}/facets/integerWidth/bits"),
                )
            })?;
            let signed = get(width, "signed") == Some(&Value::Bool(true));
            let carrier_bits = match native.as_str() {
                "smallint" => Some(16u64),
                "integer" => Some(32),
                "bigint" => Some(64),
                _ => None,
            };
            if bits == 0
                || bits > 1024
                || !(numeric_integer
                    || carrier_bits.is_some_and(|n| bits <= if signed { n } else { n - 1 }))
            {
                impossible = true;
                residual(&mut residuals, k(&format!("{path}/facets/integerWidth")), width, "Selected carrier cannot honor this integer domain within the qualified checked subset", "not-expressible", ctx)?;
            } else {
                let min = if signed {
                    -(BigInt::one() << (bits as usize - 1))
                } else {
                    BigInt::zero()
                };
                let max =
                    (BigInt::one() << (bits as usize - if signed { 1 } else { 0 })) - BigInt::one();
                checks.push(format!("{qname} OPERATOR(pg_catalog.>=) {min}"));
                checks.push(format!("{qname} OPERATOR(pg_catalog.<=) {max}"));
            }
        }
        if let Some(precision) = number_u64(get(facets, "precision")) {
            let scale = number_u64(get(facets, "scale")).ok_or_else(|| {
                err(
                    "KEY_POSTGRESQL_FACET",
                    "Scale is required with precision",
                    &format!("{path}/facets/scale"),
                )
            })?;
            if native != "numeric" || precision > 1000 || scale > precision {
                impossible = true;
                residual(
                    &mut residuals,
                    k(&format!("{path}/facets")),
                    facets,
                    "Finite fixed-scale facets require checked numeric with precision at most 1000",
                    "not-expressible",
                    ctx,
                )?;
            } else {
                ctx.charge_work(precision as usize, k(&format!("{path}/facets/precision")))?;
                let whole = precision - scale;
                let max = format!(
                    "{}{}{}",
                    if whole == 0 { "0" } else { "" },
                    "9".repeat(whole as usize),
                    if scale == 0 {
                        String::new()
                    } else {
                        format!(".{}", "9".repeat(scale as usize))
                    }
                );
                checks.push(format!(
                    "{qname} OPERATOR(pg_catalog.>=) '-{max}'::pg_catalog.numeric"
                ));
                checks.push(format!(
                    "{qname} OPERATOR(pg_catalog.<=) '{max}'::pg_catalog.numeric"
                ));
                checks.push(format!(
                    "{qname} OPERATOR(pg_catalog.=) pg_catalog.trunc({qname}, {scale})"
                ));
            }
        }
        if let Some(length) = get(facets, "length") {
            let max = number_u64(get(length, "max")).unwrap_or(0);
            let unit = text_owned(get(length, "unit")).unwrap_or_default();
            if max > 0
                && max <= 10_485_760
                && ((native == "text" && unit == "unicode-scalar")
                    || (native == "bytea" && unit == "byte"))
            {
                let function = if unit == "byte" {
                    "octet_length"
                } else {
                    "char_length"
                };
                checks.push(format!(
                    "pg_catalog.{function}({qname}) OPERATOR(pg_catalog.<=) {max}"
                ));
            } else {
                impossible = true;
                residual(&mut residuals, k(&format!("{path}/facets/length")), length, "Selected carrier does not honor the length unit or bound within the qualified subset", "not-expressible", ctx)?;
            }
        }
        let nullability = text_owned(get(f, "nullability")).unwrap_or_else(|| "optional".into());
        if nullability != "required" {
            residual(&mut residuals,k(&format!("{path}/nullability")),get(f,"nullability").unwrap_or(&Value::Null),"SQL NULL does not establish absent-member availability; this binding guarantees only required key components","not-expressible",ctx)?;
        }
        if !checks.is_empty() {
            sql.push_str(&format!(" CHECK ({})", checks.join(" AND ")));
        }
        sql.push_str(if nullability == "required" {
            " NOT NULL"
        } else {
            " NULL"
        });
        definitions.push(sql);
        residual(&mut residuals,k(&path),f,"Native storage constraints do not establish exact conversion of arbitrary SQL expressions or all value-domain meaning","unknown",ctx)?;
    }
    for (ki, key) in declared.iter().enumerate() {
        let id = get(key, "id").unwrap_or(&Value::Null);
        let mut named = None;
        for entry in &key_names {
            if same(&entry.0, id, ctx)? {
                named = Some(entry);
                break;
            }
        }
        let named = named.ok_or_else(|| {
            err(
                "KEY_POSTGRESQL_NAMES",
                "Missing key name",
                "/request/keyNames",
            )
        })?;
        let constraint = text(Some(&named.1)).ok_or_else(|| {
            err(
                "KEY_POSTGRESQL_NAMES",
                "Invalid key name",
                "/request/keyNames",
            )
        })?;
        let constraint = quote_identifier(constraint, "/request/keyNames/name", ctx)?;
        let current = key_lookup(&source, &rid, id, &rt, ctx)?;
        let key_value = get(&current, "key").unwrap_or(&Value::Null);
        let fields = arr(get(key_value, "fields"));
        if fields.is_empty() {
            return Err(err(
                "KEY_POSTGRESQL_AUTHORS",
                "Key has no fields",
                "/authors",
            ));
        }
        let mut names_for_key = Vec::new();
        for rf in fields {
            let mut found = None;
            for entry in &mapped {
                if identity_equal(&entry.0, rf, ctx)? {
                    found = Some(entry);
                    break;
                }
            }
            let found = found.ok_or_else(|| {
                err(
                    "KEY_POSTGRESQL_COLUMNS",
                    "Key member is not mapped",
                    "/request/columns",
                )
            })?;
            names_for_key.push(quote_identifier(
                text(get(&found.1, "name")).ok_or_else(|| {
                    err(
                        "KEY_POSTGRESQL_COLUMNS",
                        "Column name invalid",
                        "/request/columns",
                    )
                })?,
                "/request/columns/name",
                ctx,
            )?);
        }
        let primary = get(key_value, "primary") == Some(&Value::Bool(true));
        let kind = if primary { "PRIMARY KEY" } else { "UNIQUE" };
        let at = definitions.len();
        definitions.push(format!(
            "CONSTRAINT {constraint} {kind} ({}) NOT DEFERRABLE",
            names_for_key.join(", ")
        ));
        let path =
            text_owned(get(&current, "path")).unwrap_or_else(|| format!("{record_path}/keys/{ki}"));
        let native_path = format!("/stmts/0/stmt/CreateStmt/tableElts/{at}/Constraint");
        let mut relevant = vec![path.clone()];
        for component in fields {
            let cm = text(get(component, "module")).ok_or_else(|| {
                err(
                    "KEY_POSTGRESQL_AUTHORS",
                    "Component module missing",
                    "/authors",
                )
            })?;
            let ce = text(get(component, "element")).ok_or_else(|| {
                err(
                    "KEY_POSTGRESQL_AUTHORS",
                    "Component element missing",
                    "/authors",
                )
            })?;
            let (_, _, _, field_path) = path_for(&source, cm, ce, ctx)?;
            relevant.push(format!("{field_path}/facets"));
            for (member_index, member) in members.iter().enumerate() {
                if identity_equal(member, component, ctx)? {
                    relevant.push(format!("{record_path}/members/{member_index}"));
                    break;
                }
            }
        }
        let mut unknown_equality = false;
        for diagnostic in &validation.diagnostics {
            let diagnostic_code = diagnostic.code.to_utf8().unwrap_or_default();
            let diagnostic_path = diagnostic.path.to_utf8().unwrap_or_default();
            if [
                "UNKNOWN_KEY_QUALIFIER",
                "UNKNOWN_FACET",
                "UNKNOWN_FACET_UNIT",
            ]
            .contains(&diagnostic_code.as_str())
                && relevant.iter().any(|prefix| {
                    diagnostic_path == *prefix || diagnostic_path.starts_with(&format!("{prefix}/"))
                })
            {
                unknown_equality = true;
                break;
            }
        }
        let mut mapped_field_names = Vec::new();
        for rf in fields {
            let mut found_name = None;
            for entry in &mapped {
                if identity_equal(&entry.0, rf, ctx)? {
                    found_name = get(&entry.1, "name")
                        .map(|n| copy_json(n, ctx))
                        .transpose()?;
                    break;
                }
            }
            mapped_field_names.push(found_name.unwrap_or(Value::Null));
        }
        mappings.push(obj(vec![
            ("keyId", copy_json(id, ctx)?),
            (
                "keyName",
                copy_json(get(key_value, "name").unwrap_or(&Value::Null), ctx)?,
            ),
            ("idealPath", s(&path)),
            ("nativePath", s(&native_path)),
            ("columns", Value::Array(mapped_field_names)),
            ("primary", Value::Bool(primary)),
            ("constraintName", copy_json(&named.1, ctx)?),
            ("origin", s("authored")),
            (
                "enforcement",
                s(if primary {
                    "primary-key-not-null"
                } else {
                    "unique-not-null"
                }),
            ),
            (
                "equality",
                s(if unknown_equality {
                    "unknown"
                } else {
                    "exact-on-representable-values"
                }),
            ),
            ("outcome", s("not-expressible")),
        ]));
        residual(
            &mut residuals,
            k(&path),
            key_value,
            "Native constraint names do not encode stable key IDs/names or author intent. Enforced uniqueness applies only to representable stored tuples in the created table; B-tree tuple limits may reject otherwise valid column values; descendants, later DDL and arbitrary input conversion are outside this guarantee",
            "not-expressible",
            ctx,
        )?;
        if unknown_equality {
            residual(
                &mut residuals,
                k(&path),
                key_value,
                "Selected key, component, membership or facet qualifiers leave equality unknown; native constraints express only the known assertions",
                "unknown",
                ctx,
            )?;
        }
        if fields.len() > 32 {
            impossible = true;
            residual(
                &mut residuals,
                k(&path),
                key_value,
                "Pinned PostgreSQL index keys support at most 32 columns",
                "not-expressible",
                ctx,
            )?;
        }
    }
    if impossible || text_is(get(&request, "mode"), "strict") {
        set(&mut result, "status", s("blocked"))?;
    } else {
        let sql = format!(
            "CREATE TABLE {ns}.{table} (\n  {}\n);\n",
            definitions.join(",\n  ")
        );
        set(&mut result, "nativeSql", s(&sql))?;
    }
    set(&mut result, "mappings", Value::Array(mappings))?;
    set(&mut result, "residuals", Value::Array(residuals.clone()))?;
    set(
        &mut result,
        "diagnostics",
        diagnostics(
            &residuals,
            impossible || text_is(get(&request, "mode"), "strict"),
            ctx,
        )?,
    )?;
    if text_is(get(&result, "status"), "blocked") {
        checked(&result_schema, &result, "KEY_POSTGRESQL_RESULT", ctx)?;
    }
    Ok(result)
}

pub fn prepare_keys_projection(
    source: &Value,
    authors: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    project(source, authors, request, ctx)
}
pub fn complete_keys_projection(
    prepared: &Value,
    target: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    let (schema, _) = schemas(&rt, ctx)?;
    let mut result = copy_json(prepared, ctx)?;
    let status = text(get(&result, "status")).and_then(|v| v.to_utf8().ok());
    if status.as_deref() != Some("projected") && status.as_deref() != Some("blocked") {
        return Err(err(
            "KEY_POSTGRESQL_RESULT",
            "Expected Rust-prepared projection result",
            "/prepared/status",
        ));
    }
    let source = get(&result, "source")
        .ok_or_else(|| err("KEY_POSTGRESQL_RESULT", "Source missing", "/source"))?;
    let authors = get(&result, "authors")
        .ok_or_else(|| err("KEY_POSTGRESQL_RESULT", "Authors missing", "/authors"))?;
    let request = get(&result, "request")
        .ok_or_else(|| err("KEY_POSTGRESQL_RESULT", "Request missing", "/request"))?;
    let recomputed = project(source, authors, request, ctx)?;
    if !same(&result, &recomputed, ctx)? {
        return Err(err(
            "KEY_POSTGRESQL_RESULT",
            "Prepared projection differs from Rust recomputation",
            "/prepared",
        ));
    }
    if status.as_deref() == Some("blocked") {
        checked(&schema, &result, "KEY_POSTGRESQL_RESULT", ctx)?;
        return Ok(result);
    }
    let native_sql = get(&result, "nativeSql").ok_or_else(|| {
        err(
            "KEY_POSTGRESQL_RESULT",
            "Prepared SQL missing",
            "/nativeSql",
        )
    })?;
    let request_id = get(request, "id")
        .ok_or_else(|| err("KEY_POSTGRESQL_REQUEST", "Target id missing", "/request/id"))?;
    if !same(get(target, "id").unwrap_or(&Value::Null), request_id, ctx)? {
        return Err(err(
            "KEY_POSTGRESQL_TARGET",
            "Target id differs from prepared request",
            "/target/id",
        ));
    }
    let report = crate::postgresql_sql_runtime::inspect_postgresql_sql(target, ctx)?;
    let mut unavailable = !matches!(get(&report, "valid"), Some(Value::Bool(true)));
    for diagnostic in arr(get(&report, "diagnostics")) {
        ctx.charge_work(1, k("/target"))?;
        if matches!(text(get(diagnostic, "code")), Some(code) if code == &k("POSTGRESQL_VERSION") || code == &k("POSTGRESQL_REPRESENTATION"))
        {
            unavailable = true;
        }
    }
    if unavailable {
        return Err(err(
            "KEY_POSTGRESQL_TARGET",
            "Parsed PostgreSQL target is invalid or not exportable",
            "/target",
        ));
    }
    let actual_sql = crate::postgresql_sql_runtime::get_postgresql_source(target, ctx)?;
    if text(Some(&actual_sql)) != text(Some(native_sql)) {
        return Err(err(
            "KEY_POSTGRESQL_TARGET",
            "Target SQL differs from Rust-prepared SQL",
            "/target",
        ));
    }
    set(&mut result, "target", copy_json(target, ctx)?)?;
    checked(&schema, &result, "KEY_POSTGRESQL_RESULT", ctx)?;
    Ok(result)
}

pub fn project_keys_with_backend(
    source: &Value,
    authors: &Value,
    request: &Value,
    backend: &dyn crate::parser_backend_protocol::PostgresqlParserBackend,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let prepared = prepare_keys_projection(source, authors, request, ctx)?;
    if text_is(get(&prepared, "status"), "blocked") {
        return Ok(prepared);
    }
    let sql = text(get(&prepared, "nativeSql")).ok_or_else(|| {
        err(
            "KEY_POSTGRESQL_RESULT",
            "Prepared SQL missing",
            "/nativeSql",
        )
    })?;
    let id = text(get(request, "id"))
        .ok_or_else(|| err("KEY_POSTGRESQL_REQUEST", "Target id missing", "/request/id"))?;
    let target = crate::postgresql_sql_runtime::import_postgresql_sql(sql, id, backend, ctx)?;
    complete_keys_projection(&prepared, &target, ctx)
}
pub fn verify_keys_projection(
    receipt: &Value,
    current: &Value,
    fresh: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    let (schema, _) = schemas(&rt, ctx)?;
    checked(&schema, receipt, "KEY_POSTGRESQL_RECEIPT", ctx)?;
    checked(&schema, fresh, "KEY_POSTGRESQL_RECEIPT", ctx)?;
    if !text_is(get(receipt, "status"), "projected")
        || get(receipt, "target").is_none()
        || get(fresh, "target").is_none()
    {
        return Err(err(
            "KEY_POSTGRESQL_RECEIPT",
            "Complete projected receipt required",
            "/status",
        ));
    }
    let source = get(receipt, "source")
        .ok_or_else(|| err("KEY_POSTGRESQL_RECEIPT", "Source missing", "/source"))?;
    let authors = get(receipt, "authors")
        .ok_or_else(|| err("KEY_POSTGRESQL_RECEIPT", "Authors missing", "/authors"))?;
    let request = get(receipt, "request")
        .ok_or_else(|| err("KEY_POSTGRESQL_RECEIPT", "Request missing", "/request"))?;
    let prepared = project(source, authors, request, ctx)?;
    let expected = complete_keys_projection(&prepared, get(fresh, "target").unwrap(), ctx)?;
    if !same(fresh, &expected, ctx)? || !same(receipt, fresh, ctx)? {
        return Err(err(
            "KEY_POSTGRESQL_RECEIPT",
            "Receipt differs from the fresh Rust projection",
            "/receipt",
        ));
    }
    if !same(current, get(receipt, "target").unwrap(), ctx)? {
        return Err(err(
            "KEY_POSTGRESQL_STALE",
            "Current native target changed since projection",
            "/target",
        ));
    }
    copy_json(receipt, ctx)
}
pub fn recover_keys_projection(
    receipt: &Value,
    current: &Value,
    fresh: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let verified = verify_keys_projection(receipt, current, fresh, ctx)?;
    copy_json(
        get(&verified, "source")
            .ok_or_else(|| err("KEY_POSTGRESQL_RECEIPT", "Source missing", "/source"))?,
        ctx,
    )
}

pub fn prepare_keys_recovery(receipt: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    let (schema, _) = schemas(&rt, ctx)?;
    checked(&schema, receipt, "KEY_POSTGRESQL_RECEIPT", ctx)?;
    if !text_is(get(receipt, "status"), "projected") {
        return Err(err(
            "KEY_POSTGRESQL_RECEIPT",
            "Successful projection receipt required",
            "/status",
        ));
    }
    Ok(Value::Bool(true))
}
pub fn recover_keys_with_backend(
    receipt: &Value,
    native_text: &Value,
    backend: &dyn crate::parser_backend_protocol::PostgresqlParserBackend,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    let (schema, _) = schemas(&rt, ctx)?;
    checked(&schema, receipt, "KEY_POSTGRESQL_RECEIPT", ctx)?;
    let source = get(receipt, "source")
        .ok_or_else(|| err("KEY_POSTGRESQL_RECEIPT", "Source missing", "/source"))?;
    let authors = get(receipt, "authors")
        .ok_or_else(|| err("KEY_POSTGRESQL_RECEIPT", "Authors missing", "/authors"))?;
    let request = get(receipt, "request")
        .ok_or_else(|| err("KEY_POSTGRESQL_RECEIPT", "Request missing", "/request"))?;
    let fresh = project_keys_with_backend(source, authors, request, backend, ctx)?;
    if !same(receipt, &fresh, ctx)? {
        return Err(err(
            "KEY_POSTGRESQL_RECEIPT",
            "Receipt differs from Rust recomputation",
            "/",
        ));
    }
    if text(Some(native_text)) != text(get(receipt, "nativeSql")) {
        return Err(err(
            "KEY_POSTGRESQL_STALE",
            "Native SQL differs from retained projection",
            "/nativeSql",
        ));
    }
    copy_json(source, ctx)
}

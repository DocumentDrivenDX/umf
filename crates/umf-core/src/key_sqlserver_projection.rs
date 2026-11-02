// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned projection of authored Record Key declarations to SQL Server DDL.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    registry::Registry,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};
const CORE: &str = include_str!("../../../spec/core/schema.json");
const KEY_OP: &str = include_str!("../../../spec/core/key-operation-v2.schema.json");
const RESULT: &str = include_str!("../../../spec/core/key-sqlserver-projection.schema.json");
const NATIVE_JSON: &str = include_str!("../../../spec/core/native-json.schema.json");
const RECOVERY:&str="Recover authored source from retained receipt; native import alone does not recover authored identity";
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
    if let Some(Value::Array(items)) = v {
        items
    } else {
        &[]
    }
}
fn text(v: Option<&Value>) -> Option<String> {
    if let Some(Value::String(x)) = v {
        x.to_utf8().ok()
    } else {
        None
    }
}
fn err(c: &str, m: &str, p: &str) -> EngineError {
    EngineError::new(c, k(p), m)
}
fn parse(v: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&v.encode_utf16().collect::<Vec<_>>(), Format::Json, ctx)
}
fn runtime(ctx: &mut Context<'_>) -> Result<Arc<Runtime>, EngineError> {
    static CACHE: OnceLock<Arc<Runtime>> = OnceLock::new();
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        if let Some(v) = CACHE.get() {
            return Ok(v.clone());
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
fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    fn compare(
        a: &Value,
        b: &Value,
        ctx: &mut Context<'_>,
        depth: usize,
    ) -> Result<bool, EngineError> {
        if depth > ctx.limits().max_depth {
            return Err(err("RESOURCE_LIMIT", "Comparison depth exceeded", ""));
        }
        ctx.charge_work(1, k(""))?;
        match a {
            Value::Array(left) => {
                let Value::Array(right) = b else {
                    return Ok(false);
                };
                if left.len() != right.len() {
                    return Ok(false);
                }
                for (x, y) in left.iter().zip(right) {
                    if !compare(x, y, ctx, depth + 1)? {
                        return Ok(false);
                    }
                }
                Ok(true)
            }
            Value::Object(left) => {
                let Value::Object(right) = b else {
                    return Ok(false);
                };
                if left.len() != right.len() {
                    return Ok(false);
                }
                let mut matched = vec![false; right.len()];
                for (name, value) in left {
                    ctx.charge_work(name.len().saturating_add(1), k(""))?;
                    let mut found = None;
                    for (index, (candidate, other)) in right.iter().enumerate() {
                        ctx.charge_work(candidate.len().saturating_add(1), k(""))?;
                        if !matched[index] && candidate == name {
                            found = Some((index, other));
                            break;
                        }
                    }
                    let Some((index, other)) = found else {
                        return Ok(false);
                    };
                    matched[index] = true;
                    if !compare(value, other, ctx, depth + 1)? {
                        return Ok(false);
                    }
                }
                Ok(true)
            }
            _ => Ok(a == b),
        }
    }
    compare(a, b, ctx, 0)
}
fn validate_schema(
    v: &Value,
    schema: &Value,
    rt: &Runtime,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    let mut resources = rt.engine.schema_resources_with_context(ctx)?;
    resources
        .entries
        .push((k("urn:umf:core:key-operation:2.0.0"), parse(KEY_OP, ctx)?));
    resources
        .entries
        .push((k("urn:umf:native-json:0.1.0"), parse(NATIVE_JSON, ctx)?));
    let compiled = crate::schema::CompiledSchema::compile(schema, &resources, ctx)?;
    if compiled.validate_codegen_errors(v, ctx)?.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "Value does not match the pinned projection schema",
            "",
        ))
    }
}
fn identity(module: &Value, element: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    Ok(obj(vec![
        ("module", copy_json(module, ctx)?),
        ("element", copy_json(element, ctx)?),
    ]))
}
fn key_identity(record: &Value, key: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let mut result = match record {
        Value::Object(_) => copy_json(record, ctx)?,
        _ => {
            return Err(err(
                "KEY_SQLSERVER_RECORD",
                "Record identity must be an object",
                "/request/record",
            ))
        }
    };
    if let Value::Object(m) = &mut result {
        m.push((k("key"), copy_json(key, ctx)?));
    }
    Ok(result)
}
fn same_ref(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(equal(
        get(a, "module").unwrap_or(&Value::Null),
        get(b, "module").unwrap_or(&Value::Null),
        ctx,
    )? && equal(
        get(a, "element").unwrap_or(&Value::Null),
        get(b, "element").unwrap_or(&Value::Null),
        ctx,
    )?)
}
fn contains_key_id(keys: &[Value], id: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    for key in keys {
        if equal(get(key, "id").unwrap_or(&Value::Null), id, ctx)? {
            return Ok(true);
        }
    }
    Ok(false)
}
fn lookup(
    source: &Value,
    record: &Value,
    key: &Value,
    rt: &Runtime,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    crate::core_keys::lookup_core_key(
        source,
        &key_identity(record, key, ctx)?,
        &rt.engine,
        &rt.registry,
        caps,
        ctx,
    )
}
fn locate(
    source: &Value,
    field: &Value,
    ctx: &mut Context<'_>,
) -> Result<(Value, String), EngineError> {
    let module = text(get(field, "module")).ok_or_else(|| {
        err(
            "KEY_AVRO_COLUMNS",
            "Field module is required",
            "/request/columns",
        )
    })?;
    let element = text(get(field, "element")).ok_or_else(|| {
        err(
            "KEY_AVRO_COLUMNS",
            "Field element is required",
            "/request/columns",
        )
    })?;
    let modules = match get(source, "modules") {
        Some(Value::Array(x)) => x,
        _ => {
            return Err(err(
                "KEY_AVRO_SOURCE",
                "Source modules are required",
                "/modules",
            ))
        }
    };
    for (mi, m) in modules.iter().enumerate() {
        if text(get(m, "id")).as_deref() == Some(module.as_str()) {
            if let Some(Value::Array(elements)) = get(m, "elements") {
                for (ei, e) in elements.iter().enumerate() {
                    if text(get(e, "id")).as_deref() == Some(element.as_str()) {
                        return Ok((copy_json(e, ctx)?, format!("/modules/{mi}/elements/{ei}")));
                    }
                }
            }
        }
    }
    Err(err(
        "KEY_AVRO_REFERENCE",
        "Unresolved Field identity",
        "/request/columns",
    ))
}
fn native_name(value: &str) -> bool {
    let mut bytes = value.bytes();
    matches!(bytes.next(), Some(b'A'..=b'Z' | b'a'..=b'z' | b'_'))
        && bytes.all(|b| b.is_ascii_alphanumeric() || b == b'_')
}
fn residual(
    path: &str,
    value: &Value,
    reason: &str,
    outcome: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(obj(vec![
        ("path", s(path)),
        ("value", copy_json(value, ctx)?),
        ("reason", s(reason)),
        ("outcome", s(outcome)),
        ("recovery", s(RECOVERY)),
    ]))
}
fn qident(value: &str, path: &str) -> Result<String, EngineError> {
    if value.is_empty()
        || value.encode_utf16().count() > 128
        || value.trim() != value
        || value.starts_with('#')
        || value.contains('\0')
    {
        return Err(err(
            "SQLSERVER_IDENTIFIER",
            "Expected permanent nonempty SQL identifier of at most 128 UTF-16 units",
            path,
        ));
    }
    Ok(format!("[{}]", value.replace(']', "]]")))
}
fn nfkc_upper(value: &str) -> String {
    // SQL Server's qualified case/width-insensitive collision profile.  Unicode
    // uppercase handles canonical case folding; compatibility characters that
    // SQL Server folds are checked explicitly here.
    value
        .chars()
        .flat_map(|c| match c {
            '\u{FF01}'..='\u{FF5E}' => char::from_u32(c as u32 - 0xFEE0)
                .unwrap_or(c)
                .to_uppercase()
                .collect::<Vec<_>>(),
            _ => c.to_uppercase().collect::<Vec<_>>(),
        })
        .collect()
}
fn reserve_identifier(
    used: &mut Vec<String>,
    name: &str,
    path: &str,
) -> Result<String, EngineError> {
    let quoted = qident(name, path)?;
    let normalized = nfkc_upper(name);
    if used.iter().any(|value| value == &normalized) {
        return Err(err(
            "KEY_SQLSERVER_NAMES",
            "Physical columns collide under the case/width-insensitive naming profile",
            path,
        ));
    }
    used.push(normalized);
    Ok(quoted)
}
fn diagnostic(code: &str, path: &str, message: &str, severity: &str) -> Value {
    obj(vec![
        ("code", s(code)),
        ("path", s(path)),
        ("message", s(message)),
        ("severity", s(severity)),
    ])
}
fn project_inner(
    source: Value,
    authors: Value,
    request: Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    let result_schema = parse(
        include_str!("../../../spec/core/key-sqlserver-projection.schema.json"),
        ctx,
    )?;
    let request_schema = get(
        get(&result_schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| err("KEY_SQLSERVER_REQUEST", "Request schema is missing", ""))?;
    validate_schema(&request, request_schema, &rt, ctx, "KEY_SQLSERVER_REQUEST")?;
    let mut caps = NoCapabilities;
    let validation = rt
        .engine
        .validate_document(&source, &rt.registry, &mut caps, ctx)?;
    if !validation.valid || text(get(&source, "umf")).as_deref() != Some("0.10.0") {
        return Err(err(
            "KEY_SQLSERVER_SOURCE",
            "Valid explicit core 0.10.0 required",
            "/source",
        ));
    }
    let record = get(&request, "record").ok_or_else(|| {
        err(
            "KEY_SQLSERVER_RECORD",
            "Record identity is required",
            "/request/record",
        )
    })?;
    let module = get(record, "module").cloned().ok_or_else(|| {
        err(
            "KEY_SQLSERVER_RECORD",
            "Record module is required",
            "/request/record/module",
        )
    })?;
    let element = get(record, "element").cloned().ok_or_else(|| {
        err(
            "KEY_SQLSERVER_RECORD",
            "Record element is required",
            "/request/record/element",
        )
    })?;
    let record_id = identity(&module, &element, ctx)?;
    let (record_value, record_path) = locate(&source, &record_id, ctx)?;
    if text(get(&record_value, "kind")).as_deref() != Some("record") {
        return Err(err(
            "KEY_SQLSERVER_RECORD",
            "Selected element must be a Record",
            "/request/record",
        ));
    }
    let declared = arr(get(&record_value, "keys"));
    let members = arr(get(&record_value, "members"));
    if declared.is_empty() || members.is_empty() {
        return Err(err(
            "KEY_SQLSERVER_RECORD",
            "Selected Record must have authored keys and explicit membership",
            "/request/record",
        ));
    }
    let author_values = match &authors {
        Value::Array(v) => v,
        _ => {
            return Err(err(
                "KEY_SQLSERVER_AUTHORS",
                "Expected array of key declarations",
                "/authors",
            ))
        }
    };
    if author_values.len() != declared.len() {
        return Err(err(
            "KEY_SQLSERVER_AUTHORS",
            "Exactly one verified declaration for every current key is required",
            "/authors",
        ));
    }
    let mut seen: Vec<Value> = Vec::new();
    for author in author_values {
        if text(get(author, "operation")).as_deref() != Some("declare-core-key") {
            return Err(err(
                "KEY_SQLSERVER_AUTHORS",
                "Expected key declarations",
                "/authors",
            ));
        }
        let target = get(author, "target").ok_or_else(|| {
            err(
                "KEY_SQLSERVER_AUTHORS",
                "Key target is required",
                "/authors/target",
            )
        })?;
        crate::core_keys::verify_core_key_operation(
            author,
            target,
            &rt.engine,
            &rt.registry,
            &mut caps,
            ctx,
        )?;
        let author_id = get(author, "identity").ok_or_else(|| {
            err(
                "KEY_SQLSERVER_AUTHORS",
                "Key identity is required",
                "/authors/identity",
            )
        })?;
        let author_identity = identity(
            get(author_id, "module").unwrap_or(&Value::Null),
            get(author_id, "element").unwrap_or(&Value::Null),
            ctx,
        )?;
        if !equal(&record_id, &author_identity, ctx)? {
            return Err(err(
                "KEY_SQLSERVER_AUTHORS",
                "Mismatched author identity",
                "/authors/identity",
            ));
        }
        let keyid = get(author, "request")
            .and_then(|r| get(r, "id"))
            .cloned()
            .ok_or_else(|| {
                err(
                    "KEY_SQLSERVER_AUTHORS",
                    "Key request ID is required",
                    "/authors/request/id",
                )
            })?;
        let mut duplicate = false;
        for prior in &seen {
            if equal(prior, &keyid, ctx)? {
                duplicate = true;
                break;
            }
        }
        if duplicate
            || !equal(
                get(target, "id").unwrap_or(&Value::Null),
                get(&source, "id").unwrap_or(&Value::Null),
                ctx,
            )?
        {
            return Err(err(
                "KEY_SQLSERVER_AUTHORS",
                "Duplicate or mismatched author identity",
                "/authors",
            ));
        }
        seen.push(keyid.clone());
        let current = lookup(&source, &record_id, &keyid, &rt, &mut caps, ctx)?;
        let prior = lookup(target, &record_id, &keyid, &rt, &mut caps, ctx)?;
        if !equal(
            get(&current, "key").unwrap_or(&Value::Null),
            get(&prior, "key").unwrap_or(&Value::Null),
            ctx,
        )? {
            return Err(err(
                "KEY_SQLSERVER_STALE",
                "Key meaning changed since declaration",
                "/authors",
            ));
        }
        for component in arr(get(get(&current, "key").unwrap_or(&Value::Null), "fields")) {
            let now = locate(&source, component, ctx)?.0;
            let old = locate(target, component, ctx)?.0;
            if !equal(&now, &old, ctx)? {
                return Err(err(
                    "KEY_SQLSERVER_STALE",
                    "Key component changed since declaration",
                    "/authors",
                ));
            }
        }
        let old_record = locate(target, &record_id, ctx)?.0;
        let old_members = arr(get(&old_record, "members"));
        for component in arr(get(get(&current, "key").unwrap_or(&Value::Null), "fields")) {
            let mut now = None;
            for member in members {
                if same_ref(member, component, ctx)? {
                    now = Some(member);
                    break;
                }
            }
            let mut old = None;
            for member in old_members {
                if same_ref(member, component, ctx)? {
                    old = Some(member);
                    break;
                }
            }
            let ownership_matches = if let (Some(a), Some(b)) = (now, old) {
                equal(a, b, ctx)?
            } else {
                false
            };
            if !ownership_matches {
                return Err(err(
                    "KEY_SQLSERVER_STALE",
                    "Key ownership qualifier changed since declaration",
                    "/authors",
                ));
            }
        }
    }
    let columns = arr(get(&request, "columns"));
    let mut mapped: Vec<(Value, Value)> = Vec::new();
    let mut names = Vec::<String>::new();
    for column in columns {
        let field = get(column, "field")
            .ok_or_else(|| {
                err(
                    "KEY_SQLSERVER_COLUMNS",
                    "Column field identity is required",
                    "/request/columns",
                )
            })?
            .clone();
        let name = text(get(column, "name")).ok_or_else(|| {
            err(
                "KEY_SQLSERVER_COLUMNS",
                "Column name is required",
                "/request/columns/name",
            )
        })?;
        let _ = qident(&name, "/request/columns/name")?;
        let mut already_mapped = false;
        for (mapped_field, _) in &mapped {
            if equal(mapped_field, &field, ctx)? {
                already_mapped = true;
                break;
            }
        }
        let mut is_member = false;
        for member in members {
            if same_ref(member, &field, ctx)? {
                is_member = true;
                break;
            }
        }
        if already_mapped || names.iter().any(|n| n == &name) || !is_member {
            return Err(err(
                "KEY_SQLSERVER_COLUMNS",
                "Column identities and names must be unique and owned by the selected Record",
                "/request/columns",
            ));
        }
        mapped.push((field, s(&name)));
        names.push(name);
    }
    if mapped.len() != members.len() {
        return Err(err(
            "KEY_SQLSERVER_COLUMNS",
            "Map every owned Field explicitly",
            "/request/columns",
        ));
    }
    let mode = text(get(&request, "mode")).unwrap_or_default();
    let mut residuals=vec![residual("/",&source,"Only selected Record column carriers and key tuple declarations are emitted; all other metadata, native extensions, relationships and unknown content remain in this source residual","unknown",ctx)?];
    let namespace = text(get(&request, "namespace")).ok_or_else(|| {
        err(
            "KEY_SQLSERVER_REQUEST",
            "Namespace is required",
            "/request/namespace",
        )
    })?;
    let table = text(get(&request, "tableName")).ok_or_else(|| {
        err(
            "KEY_SQLSERVER_REQUEST",
            "Table name is required",
            "/request/tableName",
        )
    })?;
    let namespace = qident(&namespace, "/request/namespace")?;
    let table = qident(&table, "/request/tableName")?;
    let mut physical_names = Vec::<String>::new();
    for column in columns {
        let name = text(get(column, "name")).unwrap_or_default();
        let _ = reserve_identifier(&mut physical_names, &name, "/request/columns/name")?;
    }
    let key_names = arr(get(&request, "keyNames"));
    let mut native_names = Vec::<(Value, String)>::new();
    let mut constraint_names = Vec::<String>::new();
    for entry in key_names {
        let id = get(entry, "keyId").cloned().unwrap_or(Value::Null);
        let name = text(get(entry, "name")).ok_or_else(|| {
            err(
                "KEY_SQLSERVER_NAMES",
                "Native Key name is required",
                "/request/keyNames",
            )
        })?;
        let _ = qident(&name, "/request/keyNames/name")?;
        let normalized = nfkc_upper(&name);
        let mut already_named = false;
        for (previous_id, _) in &native_names {
            if equal(previous_id, &id, ctx)? {
                already_named = true;
                break;
            }
        }
        if already_named
            || constraint_names.iter().any(|x| x == &normalized)
            || !contains_key_id(declared, &id, ctx)?
        {
            return Err(err(
                "KEY_SQLSERVER_NAMES",
                "Bind each stable key ID once to a distinct constraint name",
                "/request/keyNames",
            ));
        }
        native_names.push((id, name));
        constraint_names.push(normalized);
    }
    if native_names.len() != declared.len() {
        return Err(err(
            "KEY_SQLSERVER_NAMES",
            "Missing native key name",
            "/request/keyNames",
        ));
    }
    let mut impossible = false;
    let mut definitions = Vec::<String>::new();
    let mut physical: Vec<(Value, Vec<String>, usize)> = Vec::new();
    let mut mappings = Vec::<Value>::new();
    let keyed: Vec<Value> = declared
        .iter()
        .flat_map(|key| arr(get(key, "fields")).iter().cloned())
        .collect();
    for column in columns {
        let field = get(column, "field").unwrap();
        let (element, path) = locate(&source, field, ctx)?;
        let name = text(get(column, "name")).unwrap_or_default();
        let quoted = qident(&name, &format!("{}/name", path))?;
        let native = text(get(column, "nativeType")).unwrap_or_default();
        let scalar = text(get(&element, "scalarType")).unwrap_or_default();
        let family = match native.as_str() {
            "bit" => "boolean",
            "tinyint" | "smallint" | "int" | "bigint" => "integer",
            "decimal" => "decimal",
            "real" | "float" => "float",
            "nvarchar" => "string",
            "varbinary" => "binary",
            "date" => "date",
            "time" => "time",
            "datetime2" | "datetimeoffset" => "timestamp",
            _ => "",
        };
        let numeric_integer = native == "decimal" && scalar == "integer";
        if text(get(&element, "kind")).as_deref() != Some("field")
            || (scalar != family && !numeric_integer)
            || text(get(&element, "cardinality")).as_deref() != Some("one")
            || get(&element, "itemType").is_some()
            || arr(get(&element, "references"))
                .iter()
                .any(|r| text(get(r, "role")).as_deref() == Some("record-type"))
        {
            impossible = true;
            residuals.push(residual(
                &path,
                &element,
                "Selected scalar carrier conflicts with Field family or shape",
                "not-expressible",
                ctx,
            )?);
            continue;
        }
        let facets = get(&element, "facets");
        let mut checks = Vec::<String>::new();
        let mut sqltype = native.clone();
        let mut bytes = match native.as_str() {
            "bit" | "tinyint" => 1,
            "smallint" => 2,
            "int" | "real" => 4,
            "bigint" | "float" | "datetime2" => 8,
            "decimal" => 17,
            "date" => 3,
            "time" => 5,
            "datetimeoffset" => 10,
            _ => 0,
        };
        let variable = native == "nvarchar" || native == "varbinary";
        if variable {
            let size = get(column, "nativeSize").and_then(|v| {
                if let Value::Number(n) = v {
                    Some(*n as usize)
                } else {
                    None
                }
            });
            let max = if native == "nvarchar" { 4000 } else { 8000 };
            if size.is_none_or(|n| n == 0 || n > max) {
                impossible = true;
                residuals.push(residual(&path,&element,"Explicit bounded nativeSize is required: at most 4000 UTF-16 units or 8000 bytes","not-expressible",ctx)?);
                continue;
            }
            let size = size.unwrap();
            bytes = size * if native == "nvarchar" { 2 } else { 1 };
            sqltype = format!("{}({})", native, size);
            if native == "nvarchar" {
                sqltype.push_str(" COLLATE Latin1_General_100_CI_AS_SC");
            }
        } else if get(column, "nativeSize").is_some() || get(column, "encoding").is_some() {
            impossible = true;
            residuals.push(residual(
                &path,
                column,
                "Size and binary-plus-length encoding apply only to string/binary carriers",
                "not-expressible",
                ctx,
            )?);
            continue;
        }
        if native == "decimal" {
            if numeric_integer {
                sqltype = "decimal(38,0)".into();
            } else {
                let precision = get(facets.unwrap_or(&Value::Null), "precision").and_then(|v| {
                    if let Value::Number(n) = v {
                        Some(*n as usize)
                    } else {
                        None
                    }
                });
                let scale = get(facets.unwrap_or(&Value::Null), "scale").and_then(|v| {
                    if let Value::Number(n) = v {
                        Some(*n as usize)
                    } else {
                        None
                    }
                });
                if let (Some(p), Some(sc)) = (precision, scale) {
                    if p == 0 || p > 38 || sc > p {
                        impossible = true;
                        residuals.push(residual(&path,&element,"Decimal carrier requires explicit precision and scale within 38 digits","not-expressible",ctx)?);
                        continue;
                    }
                    sqltype = format!("decimal({p},{sc})");
                    bytes = if p <= 9 {
                        5
                    } else if p <= 19 {
                        9
                    } else if p <= 28 {
                        13
                    } else {
                        17
                    };
                } else {
                    impossible = true;
                    residuals.push(residual(
                        &path,
                        &element,
                        "Decimal carrier requires explicit precision and scale within 38 digits",
                        "not-expressible",
                        ctx,
                    )?);
                    continue;
                }
            }
        }
        if let Some(width) = get(facets.unwrap_or(&Value::Null), "integerWidth") {
            let bits = get(width, "bits")
                .and_then(|v| {
                    if let Value::Number(n) = v {
                        Some(*n as u32)
                    } else {
                        None
                    }
                })
                .unwrap_or(0);
            let signed = get(width, "signed") == Some(&Value::Bool(true));
            if bits == 0 || bits > 127 {
                impossible = true;
                residuals.push(residual(
                    &format!("{path}/facets/integerWidth"),
                    width,
                    "Integer width exceeds the qualified 38-digit native domain",
                    "not-expressible",
                    ctx,
                )?);
            } else {
                let min = if signed { -(1i128 << (bits - 1)) } else { 0 };
                let max = if signed {
                    (1i128 << (bits - 1)) - 1
                } else if bits == 127 {
                    i128::MAX
                } else {
                    (1i128 << bits) - 1
                };
                let native_range = match native.as_str() {
                    "tinyint" => Some((0i128, 255i128)),
                    "smallint" => Some((-32768, 32767)),
                    "int" => Some((i32::MIN as i128, i32::MAX as i128)),
                    "bigint" => Some((i64::MIN as i128, i64::MAX as i128)),
                    "decimal" if numeric_integer => {
                        Some((-(10i128.pow(38)) + 1, 10i128.pow(38) - 1))
                    }
                    _ => None,
                };
                if native_range.is_none_or(|(lo, hi)| min < lo || max > hi) {
                    impossible = true;
                    residuals.push(residual(
                        &format!("{path}/facets/integerWidth"),
                        width,
                        "Selected native carrier cannot contain the authored integer domain",
                        "not-expressible",
                        ctx,
                    )?);
                } else {
                    checks.push(format!("{quoted} >= {min}"));
                    checks.push(format!("{quoted} <= {max}"));
                }
            }
        }
        if let Some(length) = get(facets.unwrap_or(&Value::Null), "length") {
            let max = get(length, "max")
                .and_then(|v| {
                    if let Value::Number(n) = v {
                        Some(*n as usize)
                    } else {
                        None
                    }
                })
                .unwrap_or(0);
            let unit = text(get(length, "unit")).unwrap_or_default();
            if native == "varbinary" && unit == "byte" {
                checks.push(format!("DATALENGTH({quoted}) <= {max}"));
            } else if native == "nvarchar" && unit == "unicode-scalar" {
                checks.push(format!(
                    "LEN(CONVERT(nvarchar(max),{quoted})+N'x')-1 <= {max}"
                ));
            } else {
                impossible = true;
                residuals.push(residual(
                    &format!("{path}/facets/length"),
                    length,
                    "Selected carrier does not honor the stated length unit",
                    "not-expressible",
                    ctx,
                )?);
            }
        }
        if get(facets.unwrap_or(&Value::Null), "precision").is_some() && native != "decimal" {
            impossible = true;
            residuals.push(residual(
                &format!("{path}/facets"),
                facets.unwrap(),
                "Precision and scale require decimal storage",
                "not-expressible",
                ctx,
            )?);
        }
        let required = text(get(&element, "nullability")).as_deref() == Some("required");
        if !required {
            residuals.push(residual(
                &format!("{path}/nullability"),
                get(&element, "nullability").unwrap_or(&Value::Null),
                "SQL NULL does not establish absent-member availability",
                "not-expressible",
                ctx,
            )?);
        }
        definitions.push(format!(
            "{quoted} {sqltype} {}{}",
            if required { "NOT NULL" } else { "NULL" },
            if checks.is_empty() {
                String::new()
            } else {
                format!(" CHECK ({})", checks.join(" AND "))
            }
        ));
        let mut is_key = false;
        for reference in &keyed {
            if same_ref(reference, field, ctx)? {
                is_key = true;
                break;
            }
        }
        let encoding = get(column, "encoding");
        if variable && is_key && encoding.is_none() {
            impossible = true;
            residuals.push(residual(&path,&element,"String/binary key components require explicit binary-plus-length physical columns; direct native equality collapses padding","not-expressible",ctx)?);
        }
        if let Some(enc) = encoding {
            let bytes_name = text(get(enc, "bytesColumn")).unwrap_or_default();
            let len_name = text(get(enc, "lengthColumn")).unwrap_or_default();
            let bytes_quoted = reserve_identifier(
                &mut physical_names,
                &bytes_name,
                "/request/columns/encoding/bytesColumn",
            )?;
            let len_quoted = reserve_identifier(
                &mut physical_names,
                &len_name,
                "/request/columns/encoding/lengthColumn",
            )?;
            if !required {
                impossible = true;
                residuals.push(residual(
                    &path,
                    &element,
                    "Computed required key encoding requires a required source Field",
                    "not-expressible",
                    ctx,
                )?);
            }
            definitions.push(format!(
                "{bytes_quoted} AS CONVERT(varbinary({bytes}),{quoted}) PERSISTED NOT NULL"
            ));
            definitions.push(format!(
                "{len_quoted} AS DATALENGTH({quoted}) PERSISTED NOT NULL"
            ));
            physical.push((field.clone(), vec![bytes_name, len_name], bytes + 4));
        } else {
            physical.push((field.clone(), vec![name.clone()], bytes));
        }
        residuals.push(residual(&path,&element,"Native bounds, UTF-16 validity, decimal rounding and other SQL input conversions remain residuals; stored-value equality does not establish exact conversion or full ideal domain coverage","unknown",ctx)?);
    }
    if physical_names.len() > 1024 || declared.len() > 999 {
        impossible = true;
        residuals.push(residual(
            "/request",
            &request,
            "Qualified table/index count limit exceeded",
            "not-expressible",
            ctx,
        )?);
    }
    let session = obj(vec![
        ("ANSI_NULLS", s("ON")),
        ("QUOTED_IDENTIFIER", s("ON")),
        ("ANSI_PADDING", s("ON")),
        ("ANSI_WARNINGS", s("ON")),
        ("ARITHABORT", s("ON")),
        ("CONCAT_NULL_YIELDS_NULL", s("ON")),
        ("NUMERIC_ROUNDABORT", s("OFF")),
    ]);
    residuals.push(residual("/requiredSessionOptions",&session,"Required session options must also hold for subsequent writes to indexed computed columns; generated DDL does not configure future callers","unknown",ctx)?);
    for key in declared {
        let id = get(key, "id").cloned().unwrap_or(Value::Null);
        let current = lookup(&source, &record_id, &id, &rt, &mut caps, ctx)?;
        let fields = arr(get(get(&current, "key").unwrap_or(&Value::Null), "fields"));
        let mut columns_ideal = Vec::with_capacity(fields.len());
        for field in fields {
            let mut name = None;
            for (id, candidate) in &mapped {
                if same_ref(id, field, ctx)? {
                    name = Some(candidate.clone());
                    break;
                }
            }
            columns_ideal.push(name.unwrap_or(Value::Null));
        }
        let mut native_columns = Vec::<String>::new();
        let mut byte_total = 0usize;
        for field in fields {
            for (id, cols, bytes) in &physical {
                if same_ref(id, field, ctx)? {
                    native_columns.extend(cols.iter().cloned());
                    byte_total += *bytes;
                    break;
                }
            }
        }
        let primary = get(key, "primary") == Some(&Value::Bool(true));
        let mut relevant = vec![text(get(&current, "path")).unwrap_or_default()];
        for field in fields {
            let field_path = locate(&source, field, ctx)?.1;
            relevant.push(format!("{field_path}/facets"));
            for (member_index, member) in members.iter().enumerate() {
                if same_ref(member, field, ctx)? {
                    relevant.push(format!("{record_path}/members/{member_index}"));
                    break;
                }
            }
        }
        let unknown_equality = validation.diagnostics.iter().any(|diagnostic| {
            let code = diagnostic.code.to_utf8().ok();
            let path = diagnostic.path.to_utf8().ok();
            matches!(
                code.as_deref(),
                Some("UNKNOWN_KEY_QUALIFIER" | "UNKNOWN_FACET" | "UNKNOWN_FACET_UNIT")
            ) && path.is_some_and(|path| {
                relevant
                    .iter()
                    .any(|base| path == base.as_str() || path.starts_with(&format!("{base}/")))
            })
        });
        if native_columns.len() > 32 || byte_total > if primary { 900 } else { 1700 } {
            impossible = true;
            residuals.push(residual(&text(get(&current,"path")).unwrap_or_default(),key,"Expanded physical key exceeds the qualified 32-column or primary/alternate byte budget","not-expressible",ctx)?);
        }
        let mut constraint = String::new();
        for (keyid, native_name) in &native_names {
            if equal(keyid, &id, ctx)? {
                constraint = native_name.clone();
                break;
            }
        }
        let quoted_constraint = qident(&constraint, "/request/keyNames/name")?;
        definitions.push(format!(
            "CONSTRAINT {quoted_constraint} {} NONCLUSTERED ({}) WITH (IGNORE_DUP_KEY=OFF)",
            if primary { "PRIMARY KEY" } else { "UNIQUE" },
            native_columns
                .iter()
                .map(|n| qident(n, "/request/columns/name"))
                .collect::<Result<Vec<_>, _>>()?
                .join(", ")
        ));
        mappings.push(obj(vec![
            ("keyId", id.clone()),
            ("keyName", get(key, "name").cloned().unwrap_or(Value::Null)),
            (
                "idealPath",
                get(&current, "path").cloned().unwrap_or(Value::Null),
            ),
            ("nativePath", s("/sql")),
            ("columns", Value::Array(columns_ideal)),
            (
                "nativeColumns",
                Value::Array(native_columns.iter().map(|n| s(n)).collect()),
            ),
            ("primary", Value::Bool(primary)),
            ("constraintName", s(&constraint)),
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
        residuals.push(residual(&text(get(&current,"path")).unwrap_or_default(),key,"Native constraints do not carry stable UMF key IDs, names or author intent; known equality covers representable stored values only","not-expressible",ctx)?);
    }
    let status = if impossible || mode == "strict" {
        "blocked"
    } else {
        "projected"
    };
    let native_sql = if status == "projected" {
        let opts = [
            ("ANSI_NULLS", "ON"),
            ("QUOTED_IDENTIFIER", "ON"),
            ("ANSI_PADDING", "ON"),
            ("ANSI_WARNINGS", "ON"),
            ("ARITHABORT", "ON"),
            ("CONCAT_NULL_YIELDS_NULL", "ON"),
            ("NUMERIC_ROUNDABORT", "OFF"),
        ];
        Some(format!(
            "{}\nCREATE TABLE {}.{} (\n  {}\n);\n",
            opts.iter()
                .map(|(k, v)| format!("SET {k} {v};"))
                .collect::<Vec<_>>()
                .join("\n"),
            namespace,
            table,
            definitions.join(",\n  ")
        ))
    } else {
        None
    };
    let diagnostics = residuals
        .iter()
        .map(|r| {
            diagnostic(
                "KEY_SQLSERVER_LOSS",
                &text(get(r, "path")).unwrap_or_default(),
                &text(get(r, "reason")).unwrap_or_default(),
                if status == "blocked" {
                    "error"
                } else {
                    "warning"
                },
            )
        })
        .collect();
    let mut result = obj(vec![
        ("operation", s("project-keys-sqlserver")),
        ("version", s("1.0.0")),
        ("status", s(status)),
        ("source", source),
        ("authors", authors),
        ("request", request),
        ("binding", obj(vec![("id",s("umf.sqlserver.keys")),("version",s("1.0.0")),("nativeVersion",s("16.0.4295.3")),("subset",s("Authored keys on a newly created ordinary table; explicit primary/alternate nonclustered constraints, required components, persisted binary-plus-length text/binary encoding and required session options; stored representable values only, no exact input conversion or deployed-state guarantee"))])),
        ("requiredSessionOptions", session),
        ("mappings", Value::Array(mappings)),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    if let Some(sql) = native_sql {
        if let Value::Object(m) = &mut result {
            m.push((k("nativeSql"), s(&sql)));
            m.push((
                k("target"),
                obj(vec![("format", s("sqlserver-ddl")), ("sql", s(&sql))]),
            ));
        }
    }
    validate_schema(
        &result,
        &parse(RESULT, ctx)?,
        &rt,
        ctx,
        "KEY_SQLSERVER_RESULT",
    )?;
    Ok(result)
}
pub fn project_keys_to_sqlserver(
    source: &Value,
    authors: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    project_inner(
        copy_json(source, ctx)?,
        copy_json(authors, ctx)?,
        copy_json(request, ctx)?,
        ctx,
    )
}
pub fn verify_keys_sqlserver_projection(
    receipt: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    validate_schema(
        receipt,
        &parse(RESULT, ctx)?,
        &rt,
        ctx,
        "KEY_SQLSERVER_RECEIPT",
    )?;
    if text(get(receipt, "status")).as_deref() != Some("projected") {
        return Err(err(
            "KEY_SQLSERVER_RECEIPT",
            "Expected complete successful projection receipt",
            "/receipt/status",
        ));
    }
    let expected = project_inner(
        copy_json(
            get(receipt, "source").ok_or_else(|| {
                err(
                    "KEY_SQLSERVER_RECEIPT",
                    "Source is missing",
                    "/receipt/source",
                )
            })?,
            ctx,
        )?,
        copy_json(
            get(receipt, "authors").ok_or_else(|| {
                err(
                    "KEY_SQLSERVER_RECEIPT",
                    "Authors are missing",
                    "/receipt/authors",
                )
            })?,
            ctx,
        )?,
        copy_json(
            get(receipt, "request").ok_or_else(|| {
                err(
                    "KEY_SQLSERVER_RECEIPT",
                    "Request is missing",
                    "/receipt/request",
                )
            })?,
            ctx,
        )?,
        ctx,
    )?;
    if !equal(receipt, &expected, ctx)? {
        return Err(err(
            "KEY_SQLSERVER_RECEIPT",
            "Receipt differs from retained author/source/request",
            "/receipt",
        ));
    }
    if !equal(get(receipt, "target").unwrap_or(&Value::Null), current, ctx)?
        || !equal(
            get(receipt, "nativeSql").unwrap_or(&Value::Null),
            get(current, "sql").unwrap_or(&Value::Null),
            ctx,
        )?
    {
        return Err(err(
            "KEY_SQLSERVER_STALE",
            "Native representation changed since projection",
            "/current",
        ));
    }
    Ok(copy_json(receipt, ctx)?)
}
pub fn recover_keys_sqlserver_ideal(
    receipt: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let verified = verify_keys_sqlserver_projection(receipt, current, ctx)?;
    copy_json(
        get(&verified, "source").ok_or_else(|| {
            err(
                "KEY_SQLSERVER_RECEIPT",
                "Source is missing",
                "/receipt/source",
            )
        })?,
        ctx,
    )
}

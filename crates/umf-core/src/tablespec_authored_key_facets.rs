// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned authored Key and Facet projections to the pinned TableSpec adapter.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    tablespec_adapter::{TableSpecFormat, TableSpecRuntime},
    value::{copy_json, Utf16, Value},
};

const KEY_SCHEMA: &str = include_str!("../../../spec/core/key-tablespec-projection.schema.json");
const FACET_SCHEMA: &str =
    include_str!("../../../spec/core/facets-tablespec-projection.schema.json");
const KEY_AUTHOR_SCHEMA: &str = include_str!("../../../spec/core/key-operation-v2.schema.json");
const FACET_AUTHOR_SCHEMA: &str = include_str!("../../../spec/core/facet-operation-v3.schema.json");
const KIND_AUTHOR_SCHEMA: &str = include_str!("../../../spec/core/kind-operation-v6.schema.json");
const KEY_RECOVERY: &str = "Recover authored source from retained receipt; native import alone does not recover authored identity";
const FACET_RECOVERY: &str = "Recover source meaning with retained projection receipt; native-only import does not recover author intent";

fn u(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (u(k), v)).collect())
}
fn get<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(k, _)| k == &u(key)).map(|(_, v)| v)
    } else {
        None
    }
}
fn set(v: &mut Value, key: &str, value: Value) {
    if let Value::Object(m) = v {
        if let Some((_, old)) = m.iter_mut().find(|(k, _)| k == &u(key)) {
            *old = value
        } else {
            m.push((u(key), value));
        }
    }
}
fn arr(v: Option<&Value>) -> &[Value] {
    if let Some(Value::Array(a)) = v {
        a
    } else {
        &[]
    }
}
fn text(v: Option<&Value>) -> Option<String> {
    if let Some(Value::String(s)) = v {
        s.to_utf8().ok()
    } else {
        None
    }
}
fn err(code: &str, message: impl Into<String>, path: &str) -> EngineError {
    EngineError::new(code, u(path), message.into())
}
fn copy(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    copy_json(v, ctx)
}
fn read(src: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let units = src.encode_utf16().collect::<Vec<_>>();
    ctx.charge_text(units.len(), u(""))?;
    serialization::read_json_value(&units, Format::Json, ctx)
}
fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canonical(v: &Value, ctx: &mut Context<'_>, depth: usize) -> Result<Value, EngineError> {
        if depth > ctx.limits().max_depth {
            return Err(err("LIMIT", "Canonicalization depth exceeded", ""));
        }
        ctx.charge_work(1, u(""))?;
        match v {
            Value::Array(xs) => Ok(Value::Array(
                xs.iter()
                    .map(|x| canonical(x, ctx, depth + 1))
                    .collect::<Result<_, _>>()?,
            )),
            Value::Object(xs) => {
                let mut out = Vec::with_capacity(xs.len());
                for (k, x) in xs {
                    ctx.charge_work(k.len().saturating_add(1), u(""))?;
                    out.push((k.clone(), canonical(x, ctx, depth + 1)?));
                }
                out.sort_by(|a, b| a.0.cmp(&b.0));
                Ok(Value::Object(out))
            }
            _ => copy_json(v, ctx),
        }
    }
    Ok(canonical(a, ctx, 0)? == canonical(b, ctx, 0)?)
}
fn schema_pair(
    root_src: &str,
    authors: &[(&str, &str)],
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<(CompiledSchema, CompiledSchema, Value), EngineError> {
    let root = read(root_src, ctx)?;
    let mut resources: SchemaResources = engine.schema_resources_with_context(ctx)?;
    for (id, src) in authors {
        resources.entries.push((u(id), read(src, ctx)?));
    }
    let compiled = CompiledSchema::compile(&root, &resources, ctx)?;
    let request =
        get(get(&root, "properties").unwrap_or(&Value::Null), "request").ok_or_else(|| {
            err(
                "TABLESPEC_AUTHORED_SCHEMA",
                "Projection request schema missing",
                "",
            )
        })?;
    let binding = copy(
        get(get(&root, "properties").unwrap_or(&Value::Null), "binding")
            .and_then(|v| get(v, "const"))
            .unwrap_or(&Value::Null),
        ctx,
    )?;
    Ok((
        compiled,
        CompiledSchema::compile(request, &resources, ctx)?,
        binding,
    ))
}
fn validate(
    v: &Value,
    schema: &CompiledSchema,
    code: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if schema.validate(v, ctx)?.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "Value does not satisfy pinned TableSpec projection schema",
            "",
        ))
    }
}
fn diagnostics(
    residuals: &[Value],
    status: &str,
    code: &str,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let mut out = Vec::new();
    for r in residuals {
        out.push(obj(vec![
            ("code", t(code)),
            ("path", copy(get(r, "path").unwrap_or(&Value::Null), ctx)?),
            (
                "message",
                copy(get(r, "reason").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                "severity",
                t(if status == "blocked" {
                    "error"
                } else {
                    "warning"
                }),
            ),
        ]));
    }
    Ok(out)
}
fn push_loss(
    out: &mut Vec<Value>,
    path: String,
    value: &Value,
    reason: &str,
    outcome: &str,
    recovery: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_text(path.encode_utf16().count(), u(""))?;
    out.push(obj(vec![
        ("path", Value::String(Utf16::from(path))),
        ("value", copy(value, ctx)?),
        ("reason", t(reason)),
        ("outcome", t(outcome)),
        ("recovery", t(recovery)),
    ]));
    Ok(())
}
fn native_text(v: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let compact = serialization::stringify_compact_metered(v, ctx)?;
    ctx.charge_work(compact.units().len().saturating_add(1), u(""))?;
    let mut units = compact.units().to_vec();
    units.push(10);
    Ok(Utf16::new(units))
}
fn key_native_text(v: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let compact = serialization::stringify_compact_metered(v, ctx)?;
    ctx.charge_work(compact.units().len(), u(""))?;
    Ok(compact)
}
fn pointer(s: &str) -> String {
    s.replace('~', "~0").replace('/', "~1")
}
fn identity_equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
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
fn find_identity<'a>(
    items: &'a [(Value, Value)],
    identity: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a (Value, Value)>, EngineError> {
    for item in items {
        if identity_equal(&item.0, identity, ctx)? {
            return Ok(Some(item));
        }
    }
    Ok(None)
}
fn find_member<'a>(
    items: &'a [Value],
    identity: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    for item in items {
        if identity_equal(item, identity, ctx)? {
            return Ok(Some(item));
        }
    }
    Ok(None)
}
fn locate<'a>(
    source: &'a Value,
    identity: &Value,
    ctx: &mut Context<'_>,
) -> Result<(usize, usize, &'a Value, String), EngineError> {
    let module = text(get(identity, "module"))
        .ok_or_else(|| err("KEY_TABLESPEC_REFERENCE", "Module identity required", ""))?;
    let element = text(get(identity, "element"))
        .ok_or_else(|| err("KEY_TABLESPEC_REFERENCE", "Element identity required", ""))?;
    for (mi, m) in arr(get(source, "modules")).iter().enumerate() {
        ctx.charge_work(1, u("/modules"))?;
        if text(get(m, "id")).as_deref() == Some(&module) {
            for (ei, e) in arr(get(m, "elements")).iter().enumerate() {
                ctx.charge_work(1, u("/elements"))?;
                if text(get(e, "id")).as_deref() == Some(&element) {
                    return Ok((mi, ei, e, format!("/modules/{mi}/elements/{ei}")));
                }
            }
        }
    }
    Err(err(
        "KEY_TABLESPEC_REFERENCE",
        "Unresolved explicit element identity",
        "",
    ))
}
fn find_key(
    source: &Value,
    record: &Value,
    key_id: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut fields = if let Value::Object(m) = record {
        m.clone()
    } else {
        vec![]
    };
    fields.retain(|(k, _)| k != &u("key"));
    fields.push((u("key"), copy(key_id, ctx)?));
    crate::core_keys::lookup_core_key(source, &Value::Object(fields), engine, registry, caps, ctx)
}
fn core_key_author(
    author: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let target = get(author, "target").ok_or_else(|| {
        err(
            "KEY_TABLESPEC_AUTHORS",
            "Key declaration target is required",
            "/authors/target",
        )
    })?;
    crate::core_keys::verify_core_key_operation(author, target, engine, registry, caps, ctx)
}
fn core_facet_author(
    author: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let target = get(author, "target").ok_or_else(|| {
        err(
            "FACETS_TABLESPEC_AUTHOR",
            "Declaration target is required",
            "/author/target",
        )
    })?;
    crate::facets::verify_core_facet_declaration(author, target, engine, registry, caps, ctx)
}
fn core_kind_author(
    author: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let target = get(author, "target").ok_or_else(|| {
        err(
            "FACETS_TABLESPEC_AUTHOR",
            "Declaration target is required",
            "/author/target",
        )
    })?;
    crate::core_kind::verify_core_kind_declaration(author, target, engine, registry, caps, ctx)
}

pub fn project_keys(
    input: &Value,
    author_input: &Value,
    request_input: &Value,
    runtime: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy(input, ctx)?;
    let authors_input = copy(author_input, ctx)?;
    let request = copy(request_input, ctx)?;
    let (result_schema, request_schema, binding) = schema_pair(
        KEY_SCHEMA,
        &[("urn:umf:core:key-operation:2.0.0", KEY_AUTHOR_SCHEMA)],
        engine,
        ctx,
    )?;
    validate(&request, &request_schema, "KEY_TABLESPEC_REQUEST", ctx)?;
    if text(get(&source, "umf")).as_deref() != Some("0.10.0")
        || !engine
            .validate_document(&source, registry, caps, ctx)?
            .valid
    {
        return Err(err(
            "KEY_TABLESPEC_SOURCE",
            "Valid explicit core 0.10.0 required",
            "",
        ));
    }
    if !matches!(authors_input, Value::Array(_)) {
        return Err(err(
            "KEY_TABLESPEC_AUTHORS",
            "Exactly one verified declaration for every current key is required",
            "/authors",
        ));
    }
    let record = get(&request, "record").ok_or_else(|| {
        err(
            "KEY_TABLESPEC_REQUEST",
            "Record identity required",
            "/request/record",
        )
    })?;
    let (_, _, record_element, _) = locate(&source, record, ctx)?;
    let keys = arr(get(record_element, "keys"));
    let members = arr(get(record_element, "members"));
    if text(get(record_element, "kind")).as_deref() != Some("record")
        || keys.is_empty()
        || members.is_empty()
    {
        return Err(err(
            "KEY_TABLESPEC_RECORD",
            "Selected Record must have authored keys and explicit membership",
            "/request/record",
        ));
    }
    let author_values = arr(Some(&authors_input));
    if author_values.len() != keys.len() {
        return Err(err(
            "KEY_TABLESPEC_AUTHORS",
            "Exactly one verified declaration for every current key is required",
            "/authors",
        ));
    }
    let mut seen: Vec<Value> = Vec::new();
    let mut checked_authors = Vec::new();
    for author_input in author_values {
        ctx.charge_work(1, u("/authors"))?;
        let author = core_key_author(author_input, engine, registry, caps, ctx)?;
        if !identity_equal(
            get(&author, "identity").unwrap_or(&Value::Null),
            record,
            ctx,
        )? || !equal(
            get(get(&author, "target").unwrap_or(&Value::Null), "id").unwrap_or(&Value::Null),
            get(&source, "id").unwrap_or(&Value::Null),
            ctx,
        )? {
            return Err(err(
                "KEY_TABLESPEC_AUTHORS",
                "Declaration identity does not match selected Record",
                "/authors",
            ));
        }
        let key_id =
            get(get(&author, "request").unwrap_or(&Value::Null), "id").ok_or_else(|| {
                err(
                    "KEY_TABLESPEC_AUTHORS",
                    "Stable key ID required",
                    "/authors/request/id",
                )
            })?;
        for id in &seen {
            if equal(id, key_id, ctx)? {
                return Err(err(
                    "KEY_TABLESPEC_AUTHORS",
                    "Duplicate key declaration",
                    "/authors",
                ));
            }
        }
        seen.push(copy(key_id, ctx)?);
        let current = find_key(&source, record, key_id, engine, registry, caps, ctx)?;
        let prior_target = get(&author, "target").unwrap_or(&Value::Null);
        let prior = find_key(prior_target, record, key_id, engine, registry, caps, ctx)?;
        if !equal(
            get(&current, "key").unwrap_or(&Value::Null),
            get(&prior, "key").unwrap_or(&Value::Null),
            ctx,
        )? {
            return Err(err(
                "KEY_TABLESPEC_STALE",
                "Key meaning changed since declaration",
                "/authors",
            ));
        }
        let prior_record = locate(prior_target, record, ctx)?.2;
        let prior_members = arr(get(prior_record, "members"));
        for reference in arr(get(get(&current, "key").unwrap_or(&Value::Null), "fields")) {
            ctx.charge_work(1, u("/authors/key/fields"))?;
            let (_, _, now, _) = locate(&source, reference, ctx)?;
            let (_, _, then, _) = locate(prior_target, reference, ctx)?;
            if !equal(now, then, ctx)? {
                return Err(err(
                    "KEY_TABLESPEC_STALE",
                    "Key component changed since declaration",
                    "/authors",
                ));
            }
            let now_member = find_member(members, reference, ctx)?;
            let then_member = find_member(prior_members, reference, ctx)?;
            if !matches!((now_member,then_member),(Some(a),Some(b)) if equal(a,b,ctx)?) {
                return Err(err(
                    "KEY_TABLESPEC_STALE",
                    "Key ownership qualifier changed since declaration",
                    "/authors",
                ));
            }
        }
        checked_authors.push(author);
    }
    let mut mapped: Vec<(Value, Value)> = Vec::new();
    let mut names: Vec<Value> = Vec::new();
    for column in arr(get(&request, "columns")) {
        ctx.charge_work(1, u("/request/columns"))?;
        let field = get(column, "field").ok_or_else(|| {
            err(
                "KEY_TABLESPEC_COLUMNS",
                "Field identity required",
                "/request/columns",
            )
        })?;
        let name = get(column, "name").unwrap_or(&Value::Null);
        for (id, _) in &mapped {
            if identity_equal(id, field, ctx)? {
                return Err(err(
                    "KEY_TABLESPEC_COLUMNS",
                    "Column identities and names must be unique and owned by the selected Record",
                    "/request/columns",
                ));
            }
        }
        for existing in &names {
            if equal(existing, name, ctx)? {
                return Err(err(
                    "KEY_TABLESPEC_COLUMNS",
                    "Column identities and names must be unique and owned by the selected Record",
                    "/request/columns",
                ));
            }
        }
        let mut owned = false;
        for member in members {
            if identity_equal(member, field, ctx)? {
                owned = true;
                break;
            }
        }
        if !owned {
            return Err(err(
                "KEY_TABLESPEC_COLUMNS",
                "Column identities and names must be unique and owned by the selected Record",
                "/request/columns",
            ));
        }
        mapped.push((copy(field, ctx)?, copy(column, ctx)?));
        names.push(copy(name, ctx)?);
    }
    if mapped.len() != members.len() {
        return Err(err(
            "KEY_TABLESPEC_COLUMNS",
            "Map every owned Field explicitly",
            "/request/columns",
        ));
    }
    let mut residuals = Vec::new();
    push_loss(&mut residuals,"/".into(),&source,"Only selected Record column carriers and key tuple declarations are emitted; all other metadata, native extensions, relationships and unknown content remain in this source residual","not-expressible",KEY_RECOVERY,ctx)?;
    let table = text(get(&request, "tableName")).unwrap_or_default();
    let id = match get(&request, "id") {
        Some(Value::String(id)) => {
            ctx.charge_text(id.units().len(), u("/request/id"))?;
            id.clone()
        }
        _ => {
            return Err(err(
                "KEY_TABLESPEC_REQUEST",
                "id must be a string",
                "/request/id",
            ))
        }
    };
    let valid_name = |name: &str| {
        name.len() <= 128
            && name.as_bytes().first().is_some_and(u8::is_ascii_alphabetic)
            && name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
    };
    let mut impossible = false;
    if !valid_name(&table) {
        impossible = true;
        push_loss(&mut residuals,"/request/tableName".into(),get(&request,"tableName").unwrap_or(&Value::Null),"Pinned TableSpec requires an ASCII letter followed by ASCII letters, digits or underscores, at most 128 characters; no name normalization is permitted","not-expressible",KEY_RECOVERY,ctx)?;
    }
    let families = [
        ("BOOLEAN", "boolean"),
        ("INTEGER", "integer"),
        ("DECIMAL", "decimal"),
        ("TEXT", "string"),
        ("VARCHAR", "string"),
        ("CHAR", "string"),
        ("FLOAT", "float"),
        ("DATE", "date"),
        ("DATETIME", "timestamp"),
        ("TIMESTAMP", "timestamp"),
    ];
    let mut native_columns = Vec::new();
    for (ci, column) in arr(get(&request, "columns")).iter().enumerate() {
        ctx.charge_work(1, u("/request/columns"))?;
        let name = text(get(column, "name")).unwrap_or_default();
        if !valid_name(&name) {
            impossible = true;
            push_loss(&mut residuals,format!("/request/columns/{ci}/name"),get(column,"name").unwrap_or(&Value::Null),"Native column name violates pinned TableSpec identifier syntax or 128-character bound; report cannot emit an invalid declaration","not-expressible",KEY_RECOVERY,ctx)?;
        }
        let field = get(column, "field").unwrap_or(&Value::Null);
        let (_, _, element, path) = locate(&source, field, ctx)?;
        let native_type = text(get(column, "nativeType")).unwrap_or_default();
        let family = families
            .iter()
            .find(|(n, _)| *n == native_type)
            .map(|(_, f)| *f)
            .unwrap_or("");
        if text(get(element, "scalarType")).as_deref() != Some(family)
            || text(get(element, "kind")).as_deref() != Some("field")
            || text(get(element, "cardinality")).as_deref() != Some("one")
            || get(element, "itemType").is_some()
            || arr(get(element, "references"))
                .iter()
                .any(|r| text(get(r, "role")).as_deref() == Some("record-type"))
        {
            impossible = true;
            push_loss(
                &mut residuals,
                path,
                element,
                "Selected native scalar carrier conflicts with Field shape or scalar family",
                "not-expressible",
                KEY_RECOVERY,
                ctx,
            )?;
            continue;
        }
        let mut fields = vec![
            (
                u("name"),
                copy(get(column, "name").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                u("data_type"),
                copy(get(column, "nativeType").unwrap_or(&Value::Null), ctx)?,
            ),
        ];
        if text(get(element, "nullability")).as_deref() == Some("required") {
            fields.push((u("nullable"), obj(vec![("default", Value::Bool(false))])));
        } else {
            push_loss(&mut residuals,format!("{path}/nullability"),get(element,"nullability").unwrap_or(&Value::Null),"Unspecified or absent-allowed availability has no automatic contextual-nullability binding","unknown",KEY_RECOVERY,ctx)?;
        }
        if native_type == "DECIMAL" {
            if let Some(facets) = get(element, "facets") {
                if let (Some(p), Some(s)) = (get(facets, "precision"), get(facets, "scale")) {
                    fields.push((u("precision"), copy(p, ctx)?));
                    fields.push((u("scale"), copy(s, ctx)?));
                }
            }
        }
        native_columns.push(Value::Object(fields));
        push_loss(&mut residuals,path,element,"Native type/nullability/facet declarations are carriers only; runtime domains, exact input, unknown qualifiers and core requiredness need independently qualified bindings","unknown",KEY_RECOVERY,ctx)?;
    }
    let mut native_fields = vec![
        (u("version"), t("1.0")),
        (u("table_name"), Value::String(Utf16::from(table))),
        (u("columns"), Value::Array(native_columns)),
    ];
    let mut alternate_columns = Vec::new();
    let mut mappings = Vec::new();
    let mut alternate_index = 0usize;
    for key in keys {
        ctx.charge_work(1, u("/request/record/keys"))?;
        let key_id =
            get(key, "id").ok_or_else(|| err("KEY_TABLESPEC_AUTHORS", "Key ID is missing", ""))?;
        let lookup = find_key(&source, record, key_id, engine, registry, caps, ctx)?;
        let mut columns = Vec::new();
        for reference in arr(get(get(&lookup, "key").unwrap_or(&Value::Null), "fields")) {
            let column = find_identity(&mapped, reference, ctx)?.ok_or_else(|| {
                err(
                    "KEY_TABLESPEC_COLUMNS",
                    "Key field is not explicitly mapped",
                    "/request/columns",
                )
            })?;
            columns.push(copy(get(&column.1, "name").unwrap_or(&Value::Null), ctx)?);
        }
        let primary = matches!(get(key, "primary"), Some(Value::Bool(true)));
        let native_path = if primary {
            "/primary_key".to_string()
        } else {
            let p = format!("/unique_constraints/{alternate_index}");
            alternate_index += 1;
            p
        };
        let tuple = Value::Array(columns.clone());
        if primary {
            native_fields.push((u("primary_key"), tuple));
        } else {
            alternate_columns.push(tuple);
        }
        mappings.push(obj(vec![
            ("keyId", copy(key_id, ctx)?),
            (
                "keyName",
                copy(get(key, "name").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                "idealPath",
                copy(get(&lookup, "path").unwrap_or(&Value::Null), ctx)?,
            ),
            ("nativePath", Value::String(Utf16::from(native_path))),
            ("columns", Value::Array(columns)),
            ("primary", Value::Bool(primary)),
            ("outcome", t("not-expressible")),
        ]));
        push_loss(&mut residuals,text(get(&lookup,"path")).unwrap_or_default(),key,"Tuple declaration does not carry stable key ID/name, exact comparator, requiredness or enforced identity; alternate and primary intent recover only with this per-key residual","not-expressible",KEY_RECOVERY,ctx)?;
    }
    if !alternate_columns.is_empty() {
        native_fields.push((u("unique_constraints"), Value::Array(alternate_columns)));
    }
    let status = if impossible || text(get(&request, "mode")).as_deref() == Some("strict") {
        "blocked"
    } else {
        "projected"
    };
    let mut result_fields = vec![
        (u("operation"), t("project-keys-tablespec")),
        (u("version"), t("1.0.0")),
        (u("status"), t(status)),
        (u("source"), source),
        (u("authors"), Value::Array(checked_authors)),
        (u("request"), request),
        (u("binding"), binding),
    ];
    if status == "projected" {
        let native = Value::Object(native_fields);
        let text = key_native_text(&native, ctx)?;
        let target = runtime.import(&text, &id, TableSpecFormat::Json, ctx)?;
        result_fields.push((u("target"), target));
    }
    result_fields.push((u("mappings"), Value::Array(mappings)));
    result_fields.push((u("residuals"), Value::Array(residuals.clone())));
    result_fields.push((
        u("diagnostics"),
        Value::Array(diagnostics(&residuals, status, "KEY_TABLESPEC_LOSS", ctx)?),
    ));
    let result = Value::Object(result_fields);
    validate(&result, &result_schema, "KEY_TABLESPEC_RESULT", ctx)?;
    Ok(result)
}

pub fn verify_keys(
    receipt: &Value,
    current: &Value,
    runtime: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let copy_receipt = copy(receipt, ctx)?;
    let (result_schema, _, _) = schema_pair(
        KEY_SCHEMA,
        &[("urn:umf:core:key-operation:2.0.0", KEY_AUTHOR_SCHEMA)],
        engine,
        ctx,
    )?;
    validate(&copy_receipt, &result_schema, "KEY_TABLESPEC_RECEIPT", ctx)?;
    if text(get(&copy_receipt, "status")).as_deref() != Some("projected") {
        return Err(err(
            "KEY_TABLESPEC_RECEIPT",
            "Expected complete successful projection receipt",
            "/receipt",
        ));
    }
    let expected = project_keys(
        get(&copy_receipt, "source").unwrap_or(&Value::Null),
        get(&copy_receipt, "authors").unwrap_or(&Value::Null),
        get(&copy_receipt, "request").unwrap_or(&Value::Null),
        runtime,
        engine,
        registry,
        caps,
        ctx,
    )?;
    if !equal(&copy_receipt, &expected, ctx)? {
        return Err(err(
            "KEY_TABLESPEC_RECEIPT",
            "Receipt differs from retained author/source/request",
            "/receipt",
        ));
    }
    if !equal(
        current,
        get(&copy_receipt, "target").unwrap_or(&Value::Null),
        ctx,
    )? {
        return Err(err(
            "KEY_TABLESPEC_STALE",
            "Native representation changed since projection",
            "/current",
        ));
    }
    Ok(copy_receipt)
}
pub fn recover_keys(
    receipt: &Value,
    current: &Value,
    runtime: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let valid = verify_keys(receipt, current, runtime, engine, registry, caps, ctx)?;
    copy(get(&valid, "source").unwrap_or(&Value::Null), ctx)
}

pub fn project_facets(
    author_input: &Value,
    request_input: &Value,
    runtime: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let author_copy = copy(author_input, ctx)?;
    let request = copy(request_input, ctx)?;
    let (result_schema, request_schema, binding) = schema_pair(
        FACET_SCHEMA,
        &[
            ("urn:umf:core:facet-operation:3.0.0", FACET_AUTHOR_SCHEMA),
            ("urn:umf:core:kind-operation:6.0.0", KIND_AUTHOR_SCHEMA),
        ],
        engine,
        ctx,
    )?;
    validate(&request, &request_schema, "FACETS_TABLESPEC_REQUEST", ctx)?;
    let author = if text(get(&author_copy, "operation")).as_deref() == Some("declare-core-facets") {
        core_facet_author(&author_copy, engine, registry, caps, ctx)?
    } else {
        core_kind_author(&author_copy, engine, registry, caps, ctx)?
    };
    let source = copy(
        get(&author, "target").ok_or_else(|| {
            err(
                "FACETS_TABLESPEC_AUTHOR",
                "Declaration target missing",
                "/author/target",
            )
        })?,
        ctx,
    )?;
    if text(get(&source, "umf")).as_deref() != Some("0.10.0") {
        return Err(err(
            "FACETS_TABLESPEC_VERSION",
            "Current core 0.10.0 declaration required",
            "/author/target/umf",
        ));
    }
    let identity = get(&author, "identity").ok_or_else(|| {
        err(
            "FACETS_TABLESPEC_AUTHOR",
            "Identity required",
            "/author/identity",
        )
    })?;
    let (mi, ei, element, path) = locate(&source, identity, ctx)?;
    if text(get(element, "kind")).as_deref() != Some("field") {
        return Err(err(
            "FACETS_TABLESPEC_FIELD",
            "Selected author must identify a Field",
            "/author/identity",
        ));
    }
    let ideal_path = format!("{path}/facets");
    let profile = text(get(&request, "profile")).unwrap_or_default();
    let normalized = text(get(&request, "input")).as_deref() == Some("model-normalized");
    let native_type = text(get(&request, "nativeType")).unwrap_or_default();
    let mut residuals = Vec::new();
    let mut intended = Value::Object(Vec::new());
    let mut result_facets = Value::Object(Vec::new());
    let mut outcome = "exact";
    if let Value::Object(fields) = &source {
        for (key, value) in fields {
            ctx.charge_work(key.len().saturating_add(1), u("/source"))?;
            let name = key.to_utf8().unwrap_or_default();
            if !["umf", "id", "modules", "vocabularies"].contains(&name.as_str()) {
                push_loss(
                    &mut residuals,
                    format!("/{}", pointer(&name)),
                    value,
                    "Document metadata remains in the receipt and is not projected",
                    "unknown",
                    FACET_RECOVERY,
                    ctx,
                )?;
            }
        }
    }
    if !arr(get(&source, "vocabularies")).is_empty()
        || matches!(get(&source,"vocabularies"),Some(Value::Object(m)) if !m.is_empty())
    {
        push_loss(
            &mut residuals,
            "/vocabularies".into(),
            get(&source, "vocabularies").unwrap_or(&Value::Null),
            "Vocabulary semantics are not projected",
            "unknown",
            FACET_RECOVERY,
            ctx,
        )?;
    }
    for (i, module) in arr(get(&source, "modules")).iter().enumerate() {
        ctx.charge_work(1, u("/modules"))?;
        if i != mi {
            push_loss(
                &mut residuals,
                format!("/modules/{i}"),
                module,
                "Other module is outside selected Field projection",
                "unknown",
                FACET_RECOVERY,
                ctx,
            )?;
            continue;
        }
        if let Value::Object(props) = module {
            for (key, value) in props {
                ctx.charge_work(key.len().saturating_add(1), u("/modules"))?;
                let name = key.to_utf8().unwrap_or_default();
                if !["id", "elements"].contains(&name.as_str())
                    && !(name == "namespace"
                        && matches!(value,Value::String(s) if s.units().is_empty()))
                {
                    push_loss(
                        &mut residuals,
                        format!("/modules/{i}/{}", pointer(&name)),
                        value,
                        "Module metadata is not projected",
                        "unknown",
                        FACET_RECOVERY,
                        ctx,
                    )?;
                }
            }
        }
        for (j, other) in arr(get(module, "elements")).iter().enumerate() {
            ctx.charge_work(1, u("/elements"))?;
            if j != ei {
                push_loss(
                    &mut residuals,
                    format!("/modules/{i}/elements/{j}"),
                    other,
                    "Other element is outside selected Field projection",
                    "unknown",
                    FACET_RECOVERY,
                    ctx,
                )?;
            }
        }
    }
    if let Value::Object(fields) = element {
        for (key, value) in fields {
            ctx.charge_work(key.len().saturating_add(1), u(&path))?;
            let name = key.to_utf8().unwrap_or_default();
            if !["id", "kind", "name", "description", "scalarType", "facets"]
                .contains(&name.as_str())
                && !(name == "extensions" && matches!(value,Value::Object(m) if m.is_empty()))
            {
                push_loss(&mut residuals,format!("{path}/{}",pointer(&name)),value,"Field metadata is retained without implying composition with other concept bindings","unknown",FACET_RECOVERY,ctx)?;
            }
        }
    }
    if let Some(name) = get(element, "name") {
        if !equal(
            name,
            get(&request, "columnName").unwrap_or(&Value::Null),
            ctx,
        )? {
            push_loss(
                &mut residuals,
                format!("{path}/name"),
                name,
                "Explicit native column name differs from ideal name",
                "not-expressible",
                FACET_RECOVERY,
                ctx,
            )?;
        }
    }
    if text(get(&author, "operation")).as_deref() == Some("declare-core-facets") {
        let inspected =
            crate::facets::inspect_core_facets(&source, identity, engine, registry, caps, ctx)?;
        let meaning = get(&inspected, "meaning").unwrap_or(&Value::Null);
        let state = text(get(meaning, "state")).unwrap_or_default();
        if state == "known" || state == "partial" {
            intended = crate::facets::historical_core_facet_patch(
                get(meaning, "interpreted").unwrap_or(&Value::Null),
                engine,
                ctx,
            )?;
            if state == "partial" {
                push_loss(&mut residuals,ideal_path.clone(),get(meaning,"facets").unwrap_or(&Value::Null),"Unknown facet qualifiers remain attached; no native interpretation is fabricated","unknown",FACET_RECOVERY,ctx)?;
            }
        }
    } else if let Some(facets) = get(element, "facets") {
        push_loss(
            &mut residuals,
            format!("{path}/facets"),
            facets,
            "A Field-kind declaration does not establish authorship of facet members",
            "unknown",
            FACET_RECOVERY,
            ctx,
        )?;
    }
    let scalar_shape = (text(get(element, "cardinality")).is_none()
        || text(get(element, "cardinality")).as_deref() == Some("one")
        || text(get(element, "cardinality")).as_deref() == Some("unspecified"))
        && get(element, "itemType").is_none()
        && !arr(get(element, "references"))
            .iter()
            .any(|r| text(get(r, "role")).as_deref() == Some("record-type"));
    if !scalar_shape {
        push_loss(
            &mut residuals,
            path.clone(),
            element,
            "Scalar carrier cannot project container or record-valued Field facets",
            "not-expressible",
            FACET_RECOVERY,
            ctx,
        )?;
    }
    let mut column_fields = vec![
        (
            u("name"),
            copy(get(&request, "columnName").unwrap_or(&Value::Null), ctx)?,
        ),
        (
            u("data_type"),
            copy(get(&request, "nativeType").unwrap_or(&Value::Null), ctx)?,
        ),
    ];
    if let Some(description) = get(element, "description") {
        column_fields.push((u("description"), copy(description, ctx)?));
    }
    let mut rules = Vec::new();
    let suite = profile == "gx-suite-spark";
    let string_carrier = ["VARCHAR", "CHAR", "TEXT"].contains(&native_type.as_str());
    if profile == "unresolved" {
        push_loss(
            &mut residuals,
            ideal_path.clone(),
            &intended,
            "No consumer profile selected; native metadata does not establish facet meaning",
            "unknown",
            FACET_RECOVERY,
            ctx,
        )?;
    }
    if let Some(length) = get(&intended, "length") {
        let max = number(get(length, "max"));
        let unit = text(get(length, "unit")).unwrap_or_default();
        let mut expressed = false;
        if scalar_shape && string_carrier && unit == "unicode-scalar" {
            if suite {
                rules.push(rule(
                    "expect_column_value_lengths_to_be_between",
                    &request,
                    0.0,
                    max.unwrap_or(0.0),
                    ctx,
                )?);
                if max.unwrap_or(0.0) > 0.0 {
                    column_fields.push((u("length"), Value::Number(max.unwrap_or(0.0))));
                }
                expressed = true;
            } else if profile == "gx-spark" && max.unwrap_or(0.0) > 0.0 {
                column_fields.push((u("length"), Value::Number(max.unwrap())));
                expressed = true;
            } else if profile == "json-schema" && !normalized && max.unwrap_or(0.0) > 0.0 {
                column_fields.push((u("max_length"), Value::Number(max.unwrap())));
                column_fields.push((u("length"), Value::Number(max.unwrap())));
                expressed = true;
            }
        }
        if expressed {
            set(&mut result_facets, "length", copy(length, ctx)?);
        } else {
            push_loss(&mut residuals,format!("{ideal_path}/length"),length,"Selected carrier/profile cannot honor this length and unit; zero baseline bounds, normalized max_length and byte encodings require another qualified representation","not-expressible",FACET_RECOVERY,ctx)?;
        }
    }
    if let Some(width) = get(&intended, "integerWidth") {
        let bits = number(get(width, "bits")).unwrap_or(0.0);
        let signed = matches!(get(width, "signed"), Some(Value::Bool(true)));
        let mut expressed = false;
        if scalar_shape && native_type == "INTEGER" {
            if suite && bits <= (if signed { 32.0 } else { 31.0 }) {
                let low = if signed {
                    -(2.0f64).powf(bits - 1.0)
                } else {
                    0.0
                };
                let high = (2.0f64).powf(bits - if signed { 1.0 } else { 0.0 }) - 1.0;
                rules.push(rule(
                    "expect_column_values_to_be_between",
                    &request,
                    low,
                    high,
                    ctx,
                )?);
                expressed = true;
            } else if ["pyspark-schema", "ingest-cast"].contains(&profile.as_str())
                && bits == 32.0
                && signed
            {
                expressed = true;
            }
        }
        if expressed {
            set(&mut result_facets, "integerWidth", copy(width, ctx)?);
        } else {
            push_loss(&mut residuals,format!("{ideal_path}/integerWidth"),width,"Selected carrier/profile cannot honor this integer width; no cross-family or wider encoding is implied","not-expressible",FACET_RECOVERY,ctx)?;
        }
    }
    if let Some(precision) = get(&intended, "precision") {
        let scale = get(&intended, "scale").unwrap_or(&Value::Null);
        let p = number(Some(precision)).unwrap_or(0.0);
        let s = number(Some(scale)).unwrap_or(0.0);
        let mut expressed = false;
        if scalar_shape && native_type == "DECIMAL" {
            if profile == "declared-metadata"
                || profile == "ingest-cast" && p <= 38.0
                || profile == "pyspark-schema" && p == 10.0 && s == 0.0
            {
                expressed = true;
            }
            if suite && p <= 10.0 && s == 0.0 {
                rules.push(rule(
                    "expect_column_values_to_be_between",
                    &request,
                    -(10.0f64.powf(p) - 1.0),
                    10.0f64.powf(p) - 1.0,
                    ctx,
                )?);
                expressed = true;
            }
        }
        if expressed {
            column_fields.push((u("precision"), copy(precision, ctx)?));
            column_fields.push((u("scale"), copy(scale, ctx)?));
            set(&mut result_facets, "precision", copy(precision, ctx)?);
            set(&mut result_facets, "scale", copy(scale, ctx)?);
        } else {
            push_loss(&mut residuals,ideal_path.clone(),&obj(vec![("precision",copy(precision,ctx)?),("scale",copy(scale,ctx)?)]),"Selected carrier/profile cannot honor this precision and scale; native fallback defaults are not ideal assertions","not-expressible",FACET_RECOVERY,ctx)?;
        }
    }
    if text(get(&request, "obligation")).as_deref() == Some("exact-input") {
        let narrowing = ["pyspark-schema", "gx-suite-spark", "ingest-cast"]
            .contains(&profile.as_str())
            && ["FLOAT", "DECIMAL"].contains(&native_type.as_str());
        let reason = if narrowing && native_type == "FLOAT" {
            "Binary64 1.0000000000000002 narrows to binary32 1.0"
        } else if narrowing {
            "Native decimal conversion may round fractional inputs before validation"
        } else {
            "Selected schema/profile does not establish exact input conversion"
        };
        push_loss(
            &mut residuals,
            path.clone(),
            element,
            reason,
            if narrowing { "approximated" } else { "unknown" },
            FACET_RECOVERY,
            ctx,
        )?;
    }
    let mut native_fields = vec![
        (u("version"), t("1.0")),
        (
            u("table_name"),
            copy(get(&request, "tableName").unwrap_or(&Value::Null), ctx)?,
        ),
        (
            u("columns"),
            Value::Array(vec![Value::Object(column_fields)]),
        ),
    ];
    if suite {
        native_fields.push((
            u("expectations"),
            obj(vec![("expectations", Value::Array(rules))]),
        ));
    }
    let native = Value::Object(native_fields);
    let native_source = native_text(&native, ctx)?;
    let id = match get(&request, "id") {
        Some(Value::String(id)) => id,
        _ => {
            return Err(err(
                "FACETS_TABLESPEC_REQUEST",
                "id must be a string",
                "/request/id",
            ))
        }
    };
    let target = runtime.import(&native_source, id, TableSpecFormat::Json, ctx)?;
    if let Some(scalar) = get(element, "scalarType") {
        let projected = get(
            arr(get(&target, "modules")).first().unwrap_or(&Value::Null),
            "elements",
        )
        .and_then(|e| arr(Some(e)).first())
        .and_then(|e| get(e, "scalarType"));
        if !equal(scalar, projected.unwrap_or(&Value::Null), ctx)? {
            push_loss(
                &mut residuals,
                format!("{path}/scalarType"),
                scalar,
                "Selected native carrier does not establish the authored scalar family",
                "not-expressible",
                FACET_RECOVERY,
                ctx,
            )?;
        }
    }
    if !residuals.is_empty() {
        outcome = "approximated";
        for r in &residuals {
            if text(get(r, "outcome")).as_deref() == Some("not-expressible") {
                outcome = "not-expressible";
                break;
            }
            if text(get(r, "outcome")).as_deref() == Some("unknown") {
                outcome = "unknown";
            }
        }
    }
    let mapping_facets = result_facets;
    let mut status = "projected";
    if text(get(&request, "mode")).as_deref() == Some("strict") && !residuals.is_empty() {
        status = "blocked";
    }
    let outcome_value = t(outcome);
    let mapping = obj(vec![
        ("origin", t("authored")),
        ("idealPath", Value::String(Utf16::from(ideal_path))),
        ("nativePath", t("/columns/0")),
        ("facets", mapping_facets),
        (
            "profile",
            copy(get(&request, "profile").unwrap_or(&Value::Null), ctx)?,
        ),
        ("outcome", outcome_value),
    ]);
    let mut result_fields = vec![
        (u("operation"), t("project-facets-tablespec")),
        (u("version"), t("1.0.0")),
        (u("status"), t(status)),
        (u("source"), source),
        (u("author"), author),
        (u("request"), request),
        (u("binding"), binding),
        (u("mapping"), mapping),
    ];
    if status == "projected" {
        result_fields.push((u("target"), target));
    }
    result_fields.push((u("residuals"), Value::Array(residuals.clone())));
    result_fields.push((
        u("diagnostics"),
        Value::Array(diagnostics(
            &residuals,
            status,
            "FACETS_MEANING_NOT_PROJECTED",
            ctx,
        )?),
    ));
    let result = Value::Object(result_fields);
    validate(&result, &result_schema, "FACETS_TABLESPEC_RESULT", ctx)?;
    Ok(result)
}
fn number(v: Option<&Value>) -> Option<f64> {
    if let Some(Value::Number(n)) = v {
        Some(*n)
    } else {
        None
    }
}
fn rule(
    kind: &str,
    request: &Value,
    min: f64,
    max: f64,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(obj(vec![
        ("type", t(kind)),
        (
            "kwargs",
            obj(vec![
                (
                    "column",
                    copy(get(request, "columnName").unwrap_or(&Value::Null), ctx)?,
                ),
                ("min_value", Value::Number(min)),
                ("max_value", Value::Number(max)),
                ("mostly", Value::Number(1.0)),
            ]),
        ),
        (
            "meta",
            obj(vec![
                (
                    "stage",
                    t(if kind == "expect_column_value_lengths_to_be_between" {
                        "raw"
                    } else {
                        "ingested"
                    }),
                ),
                ("severity", t("error")),
                ("blocking", Value::Bool(true)),
                ("generated_from", t("user")),
            ]),
        ),
    ]))
}
pub fn recover_facets(
    receipt: &Value,
    native_text_value: &Value,
    runtime: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let checked = copy(receipt, ctx)?;
    let (result_schema, _, _) = schema_pair(
        FACET_SCHEMA,
        &[
            ("urn:umf:core:facet-operation:3.0.0", FACET_AUTHOR_SCHEMA),
            ("urn:umf:core:kind-operation:6.0.0", KIND_AUTHOR_SCHEMA),
        ],
        engine,
        ctx,
    )?;
    validate(&checked, &result_schema, "FACETS_TABLESPEC_RECEIPT", ctx)?;
    if text(get(&checked, "status")).as_deref() != Some("projected") {
        return Err(err(
            "FACETS_TABLESPEC_RECEIPT",
            "Expected projected receipt",
            "/receipt",
        ));
    }
    let expected = project_facets(
        get(&checked, "author").unwrap_or(&Value::Null),
        get(&checked, "request").unwrap_or(&Value::Null),
        runtime,
        engine,
        registry,
        caps,
        ctx,
    )?;
    if !equal(&checked, &expected, ctx)? {
        return Err(err(
            "FACETS_TABLESPEC_RECEIPT",
            "Receipt disagrees with retained author and request",
            "/receipt",
        ));
    }
    let target = get(&checked, "target").ok_or_else(|| {
        err(
            "FACETS_TABLESPEC_RECEIPT",
            "Target missing",
            "/receipt/target",
        )
    })?;
    let exported = runtime.export(target, ctx)?;
    if !matches!(native_text_value,Value::String(text) if text==&exported) {
        return Err(err(
            "FACETS_TABLESPEC_STALE",
            "Native target changed",
            "/current",
        ));
    }
    copy(get(&checked, "source").unwrap_or(&Value::Null), ctx)
}

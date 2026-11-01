// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned authored Field and Record projection to PostgreSQL DDL.
use crate::{
    context::Context,
    core_kind,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};

const CORE: &str = include_str!("../../../spec/core/schema.json");
const KIND: &str = include_str!("../../../spec/core/kind-operation-v6.schema.json");
const FIELD: &str = include_str!("../../../spec/core/field-postgresql-projection.schema.json");
const RECORD: &str = include_str!("../../../spec/core/record-postgresql-projection.schema.json");
const RECOVERY: &str = "Recover source meaning with retained projection receipt; native-only import does not recover author intent";
const FIELD_SUBSET: &str = "Single authored Field with explicit pg_catalog carrier; no value-domain or execution equivalence";
const RECORD_SUBSET: &str = "Authored record with explicit pg_catalog field carriers; no value-domain or execution equivalence";

fn k(value: &str) -> Utf16 {
    Utf16::from(value)
}
fn s(value: &str) -> Value {
    Value::string_utf8(value)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(n, v)| (k(n), v)).collect())
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    if let Value::Object(fields) = value {
        fields.iter().find(|(n, _)| n == &k(name)).map(|(_, v)| v)
    } else {
        None
    }
}
fn array(value: Option<&Value>) -> &[Value] {
    if let Some(Value::Array(items)) = value {
        items
    } else {
        &[]
    }
}
fn text(value: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(value)) = value {
        Some(value)
    } else {
        None
    }
}
fn text_owned(value: Option<&Value>) -> Option<String> {
    text(value).and_then(|v| v.to_utf8().ok())
}
fn err(code: &str, message: impl Into<String>, path: &str) -> EngineError {
    EngineError::new(code, k(path), message.into())
}
fn parse(value: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&value.encode_utf16().collect::<Vec<_>>(), Format::Json, ctx)
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
    let result = Arc::new(Runtime {
        engine,
        registry: Registry::default(),
    });
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        let _ = CACHE.set(result.clone());
    }
    Ok(result)
}
fn schemas(
    rt: &Runtime,
    field: bool,
    ctx: &mut Context<'_>,
) -> Result<(CompiledSchema, CompiledSchema), EngineError> {
    let source = if field { FIELD } else { RECORD };
    let schema = parse(source, ctx)?;
    let mut resources = rt.engine.schema_resources_with_context(ctx)?;
    resources
        .entries
        .push((k("urn:umf:core:kind-operation:6.0.0"), parse(KIND, ctx)?));
    let result = CompiledSchema::compile(&schema, &resources, ctx)?;
    let request = get(
        get(&schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| {
        err(
            "POSTGRESQL_FIELD_RECORD_SCHEMA",
            "Request schema missing",
            "",
        )
    })?;
    Ok((result, CompiledSchema::compile(request, &resources, ctx)?))
}
fn canonical(value: &Value, ctx: &mut Context<'_>, depth: usize) -> Result<Value, EngineError> {
    if depth > ctx.limits().max_depth {
        return Err(err(
            "RESOURCE_LIMIT",
            "Receipt comparison depth exceeded",
            "",
        ));
    }
    match value {
        Value::Array(items) => {
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                ctx.charge_work(1, k(""))?;
                out.push(canonical(item, ctx, depth + 1)?);
            }
            Ok(Value::Array(out))
        }
        Value::Object(fields) => {
            let mut out = Vec::with_capacity(fields.len());
            for (name, value) in fields {
                ctx.charge_work(1, k("/receipt"))?;
                ctx.charge_work(name.len().saturating_add(1), k(""))?;
                out.push((name.clone(), canonical(value, ctx, depth + 1)?));
            }
            out.sort_by(|a, b| a.0.cmp(&b.0));
            Ok(Value::Object(out))
        }
        _ => copy_json(value, ctx),
    }
}
fn same(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(canonical(a, ctx, 0)? == canonical(b, ctx, 0)?)
}
fn validate(
    schema: &CompiledSchema,
    value: &Value,
    code: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if let Some(d) = schema.validate(value, ctx)?.first() {
        return Err(EngineError::new(
            code,
            d.instance_path.clone(),
            d.message.clone(),
        ));
    }
    Ok(())
}
fn quote_identifier(
    value: &Utf16,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    ctx.charge_work(value.len(), k(path))?;
    let Some(text) = value.to_utf8().ok() else {
        return Err(err(
            "POSTGRESQL_FIELD_IDENTIFIER",
            "Expected nonempty valid Unicode identifier of at most 63 UTF-8 bytes",
            path,
        ));
    };
    if value.is_empty() || text.contains('\0') || text.as_bytes().len() > 63 {
        return Err(err(
            "POSTGRESQL_FIELD_IDENTIFIER",
            "Expected nonempty valid Unicode identifier of at most 63 UTF-8 bytes",
            path,
        ));
    }
    Ok(format!("\"{}\"", text.replace('\"', "\"\"")))
}
fn quote_literal(value: &Utf16, path: &str, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    ctx.charge_work(value.len(), k(path))?;
    let Some(text) = value.to_utf8().ok() else {
        return Err(err(
            "POSTGRESQL_FIELD_DESCRIPTION",
            "Description cannot contain NUL or unpaired surrogates",
            path,
        ));
    };
    if text.contains('\0') {
        return Err(err(
            "POSTGRESQL_FIELD_DESCRIPTION",
            "Description cannot contain NUL or unpaired surrogates",
            path,
        ));
    }
    Ok(format!(
        "E'{}'",
        text.replace('\\', "\\\\").replace('\'', "''")
    ))
}
fn pointer(key: &Utf16) -> Utf16 {
    let mut out = Vec::with_capacity(key.len());
    for unit in key.units().iter() {
        match unit {
            0x7e => out.extend([0x7e, 0x30]),
            0x2f => out.extend([0x7e, 0x31]),
            x => out.push(*x),
        }
    }
    Utf16::new(out)
}
fn pointer_path(base: &str, key: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_work(key.len(), k(base))?;
    let mut units = base.encode_utf16().collect::<Vec<_>>();
    units.push(b'/' as u16);
    units.extend_from_slice(pointer(key).units());
    Ok(Utf16::new(units))
}
fn field_native_type(native: &str) -> Option<(&'static str, &'static str)> {
    Some(match native {
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
fn field_native_family(native: &str) -> Option<&'static str> {
    field_native_type(native).map(|(_, family)| family)
}
fn validate_author(
    author: &Value,
    current: &Value,
    rt: &Runtime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut caps = NoCapabilities;
    core_kind::verify_core_kind_declaration(
        author,
        current,
        &rt.engine,
        &rt.registry,
        &mut caps,
        ctx,
    )
}
fn locate<'a>(
    source: &'a Value,
    author: &Value,
    ctx: &mut Context<'_>,
) -> Result<(&'a Value, usize, usize, String), EngineError> {
    let identity = get(author, "identity").ok_or_else(|| {
        err(
            "CORE_KIND_RECEIPT",
            "Identity is required",
            "/author/identity",
        )
    })?;
    let module = text(get(identity, "module")).ok_or_else(|| {
        err(
            "CORE_KIND_IDENTITY",
            "Module identity is required",
            "/author/identity/module",
        )
    })?;
    let element = text(get(identity, "element")).ok_or_else(|| {
        err(
            "CORE_KIND_IDENTITY",
            "Element identity is required",
            "/author/identity/element",
        )
    })?;
    let modules = array(get(source, "modules"));
    let mut mi = None;
    for (index, item) in modules.iter().enumerate() {
        ctx.charge_work(1, k("/modules"))?;
        if text(get(item, "id")) == Some(module) {
            mi = Some(index);
            break;
        }
    }
    let mi = mi.ok_or_else(|| {
        err(
            "CORE_KIND_MISSING",
            "Authored module is absent",
            "/author/identity/module",
        )
    })?;
    let elements = array(get(&modules[mi], "elements"));
    let mut ei = None;
    for (index, item) in elements.iter().enumerate() {
        ctx.charge_work(1, k("/modules"))?;
        if text(get(item, "id")) == Some(element) {
            ei = Some(index);
            break;
        }
    }
    let ei = ei.ok_or_else(|| {
        err(
            "CORE_KIND_MISSING",
            "Authored element is absent",
            "/author/identity/element",
        )
    })?;
    Ok((
        &elements[ei],
        mi,
        ei,
        format!("/modules/{mi}/elements/{ei}"),
    ))
}
fn push_residual(
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
    code: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut output = Vec::with_capacity(residuals.len());
    for residual in residuals {
        output.push(obj(vec![
            ("code", s(code)),
            (
                "path",
                copy_json(get(residual, "path").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                "message",
                copy_json(get(residual, "reason").unwrap_or(&Value::Null), ctx)?,
            ),
            ("severity", s(if blocked { "error" } else { "warning" })),
        ]));
    }
    Ok(Value::Array(output))
}
fn push_record_fatal(
    residuals: &mut Vec<Value>,
    fatal_paths: &mut Vec<Utf16>,
    path: impl Into<Utf16>,
    value: &Value,
    reason: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let path = path.into();
    push_residual(
        residuals,
        path.clone(),
        value,
        reason,
        "not-expressible",
        ctx,
    )?;
    fatal_paths.push(path);
    Ok(())
}
fn record_diagnostics(
    residuals: &[Value],
    fatal_paths: &[Utf16],
    strict: bool,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut output = Vec::with_capacity(residuals.len());
    for residual in residuals {
        ctx.charge_work(1, k("/diagnostics"))?;
        let path = get(residual, "path").unwrap_or(&Value::Null);
        let fatal = fatal_paths
            .iter()
            .any(|candidate| Some(candidate) == text(Some(path)));
        output.push(obj(vec![
            (
                "code",
                s(if fatal {
                    "RECORD_BINDING_CONFLICT"
                } else {
                    "RECORD_MEANING_NOT_PROJECTED"
                }),
            ),
            ("path", copy_json(path, ctx)?),
            (
                "message",
                copy_json(get(residual, "reason").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                "severity",
                s(if fatal || strict { "error" } else { "warning" }),
            ),
        ]));
    }
    Ok(Value::Array(output))
}
fn has_residual_at(
    residuals: &[Value],
    prefix: &[u16],
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    for r in residuals {
        ctx.charge_work(1, k("/residuals"))?;
        if text(get(r, "path")).is_some_and(|path| {
            path.units().len() > prefix.len()
                && path.units().starts_with(prefix)
                && path.units()[prefix.len()] == b'/' as u16
        }) {
            return Ok(true);
        }
    }
    Ok(false)
}
fn field_project(
    author_input: &Value,
    request_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    let (result_schema, request_schema) = schemas(&rt, true, ctx)?;
    let author_input = copy_json(author_input, ctx)?;
    let request = copy_json(request_input, ctx)?;
    validate(&request_schema, &request, "FIELD_POSTGRESQL_REQUEST", ctx)?;
    let author_target = get(&author_input, "target").ok_or_else(|| {
        err(
            "CORE_KIND_RECEIPT",
            "Author target is required",
            "/author/target",
        )
    })?;
    let author = validate_author(&author_input, author_target, &rt, ctx)?;
    let source = copy_json(
        get(&author, "target").ok_or_else(|| {
            err(
                "CORE_KIND_RECEIPT",
                "Author target is missing",
                "/author/target",
            )
        })?,
        ctx,
    )?;
    let (_, mi, ei, path) = locate(&source, &author, ctx)?;
    let modules = array(get(&source, "modules"));
    let module = &modules[mi];
    let element = &array(get(module, "elements"))[ei];
    let namespace = text(get(&request, "namespace")).ok_or_else(|| {
        err(
            "FIELD_POSTGRESQL_REQUEST",
            "namespace is required",
            "/request/namespace",
        )
    })?;
    let table = text(get(&request, "tableName")).ok_or_else(|| {
        err(
            "FIELD_POSTGRESQL_REQUEST",
            "tableName is required",
            "/request/tableName",
        )
    })?;
    let column = text(get(&request, "columnName")).ok_or_else(|| {
        err(
            "FIELD_POSTGRESQL_REQUEST",
            "columnName is required",
            "/request/columnName",
        )
    })?;
    let native = text_owned(get(&request, "nativeType")).ok_or_else(|| {
        err(
            "FIELD_POSTGRESQL_REQUEST",
            "nativeType is required",
            "/request/nativeType",
        )
    })?;
    let mode = text_owned(get(&request, "mode")).unwrap_or_default();
    let namespace_sql = quote_identifier(namespace, "/request/namespace", ctx)?;
    let table_sql = quote_identifier(table, "/request/tableName", ctx)?;
    let column_sql = quote_identifier(column, "/request/columnName", ctx)?;
    let mut residuals = Vec::new();
    let mut fatal = false;
    let provenance = get(&author, "provenance").unwrap_or(&Value::Null);
    let kind = text_owned(get(provenance, "kind")).unwrap_or_default();
    if kind != "field" {
        push_residual(
            &mut residuals,
            format!("{path}/kind"),
            get(element, "kind").unwrap_or(&Value::Null),
            "Record/group is not a single native column",
            "not-expressible",
            ctx,
        )?;
        fatal = true;
    }
    if let Some(name) = text(get(element, "name")) {
        if name != column {
            push_residual(
                &mut residuals,
                format!("{path}/name"),
                &Value::String(name.clone()),
                "Explicit native column name differs from ideal name",
                "not-expressible",
                ctx,
            )?;
        }
    }
    if let Value::Object(fields) = &source {
        for (name, value) in fields {
            ctx.charge_work(1, k("/source"))?;
            if !["umf", "id", "modules", "vocabularies"]
                .iter()
                .any(|n| name == &k(n))
            {
                push_residual(
                    &mut residuals,
                    pointer_path("", name, ctx)?,
                    value,
                    "Document metadata is retained but not projected",
                    "unknown",
                    ctx,
                )?;
            }
        }
    }
    if let Value::Object(vocab) = get(&source, "vocabularies").unwrap_or(&Value::Null) {
        if !vocab.is_empty() {
            push_residual(
                &mut residuals,
                "/vocabularies".to_string(),
                get(&source, "vocabularies").unwrap(),
                "Native vocabulary semantics are not projected",
                "unknown",
                ctx,
            )?;
        }
    }
    for (index, item) in modules.iter().enumerate() {
        ctx.charge_work(1, k("/modules"))?;
        if index != mi {
            push_residual(
                &mut residuals,
                format!("/modules/{index}"),
                item,
                "Other module is outside selected Field projection",
                "unknown",
                ctx,
            )?;
            continue;
        }
        if let Some(actual) = text(get(item, "namespace")) {
            if !actual.is_empty() && actual != namespace {
                push_residual(
                    &mut residuals,
                    format!("/modules/{index}/namespace"),
                    &Value::String(actual.clone()),
                    "Native schema name differs from ideal namespace",
                    "not-expressible",
                    ctx,
                )?;
            }
        }
        if let Value::Object(members) = item {
            for (name, value) in members {
                ctx.charge_work(1, k("/modules"))?;
                if !["id", "namespace", "elements"]
                    .iter()
                    .any(|n| name == &k(n))
                {
                    push_residual(
                        &mut residuals,
                        pointer_path(&format!("/modules/{index}"), name, ctx)?,
                        value,
                        "Module metadata is not projected",
                        "unknown",
                        ctx,
                    )?;
                }
            }
        }
        for (element_index, item) in array(get(item, "elements")).iter().enumerate() {
            ctx.charge_work(1, k("/modules"))?;
            if element_index != ei {
                push_residual(
                    &mut residuals,
                    format!("/modules/{index}/elements/{element_index}"),
                    item,
                    "Other element is outside selected Field projection",
                    "unknown",
                    ctx,
                )?;
            }
        }
    }
    if let Value::Object(members) = element {
        for (name, value) in members {
            ctx.charge_work(1, k(&path))?;
            let known = ["id", "kind", "name", "description", "scalarType"]
                .iter()
                .any(|n| name == &k(n));
            let empty_extensions =
                name == &k("extensions") && matches!(value,Value::Object(x) if x.is_empty());
            if !known && !empty_extensions {
                push_residual(
                    &mut residuals,
                    pointer_path(&path, name, ctx)?,
                    value,
                    "Field metadata is retained but not projected",
                    "unknown",
                    ctx,
                )?;
            }
        }
    }
    let (native_name, _) = field_native_type(&native).ok_or_else(|| {
        err(
            "FIELD_POSTGRESQL_REQUEST",
            "Unsupported PostgreSQL native carrier",
            "/request/nativeType",
        )
    })?;
    let mut sql = format!(
        "CREATE TABLE {namespace_sql}.{table_sql} ({column_sql} pg_catalog.{native_name});\n"
    );
    if let Some(description) = text(get(element, "description")) {
        sql.push_str(&format!(
            "COMMENT ON COLUMN {namespace_sql}.{table_sql}.{column_sql} IS {};\n",
            quote_literal(description, "/description", ctx)?
        ));
    }
    if let Some(scalar) = text(get(element, "scalarType")) {
        if field_native_family(&native).is_none_or(|family| scalar != &k(family)) {
            push_residual(
                &mut residuals,
                format!("{path}/scalarType"),
                &Value::String(scalar.clone()),
                "Explicit native type does not establish the stated scalar family",
                "not-expressible",
                ctx,
            )?;
        }
    }
    let blocked = fatal || mode == "strict" && !residuals.is_empty();
    let outcome = if residuals
        .iter()
        .any(|r| text_owned(get(r, "outcome")).as_deref() == Some("not-expressible"))
    {
        "not-expressible"
    } else if residuals.is_empty() {
        "exact"
    } else {
        "unknown"
    };
    let diagnostic_values = diagnostics(&residuals, blocked, "FIELD_MEANING_NOT_PROJECTED", ctx)?;
    let mut result = obj(vec![
        ("operation", s("project-field-postgresql")),
        ("version", s("1.0.0")),
        ("status", s(if blocked { "blocked" } else { "projected" })),
        ("source", source),
        ("author", author),
        ("request", request),
        (
            "binding",
            obj(vec![
                ("id", s("umf.core.field.postgresql")),
                ("version", s("1.0.0")),
                ("nativeVersion", s("17.4")),
                ("subset", s(FIELD_SUBSET)),
            ]),
        ),
        (
            "mapping",
            obj(vec![
                ("origin", s("authored")),
                ("idealPath", s(&format!("{path}/kind"))),
                (
                    "nativePath",
                    s("/stmts/0/stmt/CreateStmt/tableElts/0/ColumnDef"),
                ),
                ("outcome", s(outcome)),
            ]),
        ),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", diagnostic_values),
    ]);
    if !blocked {
        set(&mut result, "nativeSql", s(&sql))?;
        return Ok(result);
    }
    validate(&result_schema, &result, "FIELD_POSTGRESQL_RESULT", ctx)?;
    Ok(result)
}
fn set(target: &mut Value, name: &str, value: Value) -> Result<(), EngineError> {
    let Value::Object(fields) = target else {
        return Err(err("INVARIANT", "Expected object", ""));
    };
    if let Some((_, slot)) = fields.iter_mut().find(|(n, _)| n == &k(name)) {
        *slot = value;
    } else {
        fields.push((k(name), value));
    }
    Ok(())
}
fn ref_equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
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
fn record_project(
    author_input: &Value,
    request_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    let (result_schema, request_schema) = schemas(&rt, false, ctx)?;
    let author_input = copy_json(author_input, ctx)?;
    let request = copy_json(request_input, ctx)?;
    validate(&request_schema, &request, "RECORD_POSTGRESQL_REQUEST", ctx)?;
    let author_target = get(&author_input, "target").ok_or_else(|| {
        err(
            "CORE_KIND_RECEIPT",
            "Author target is required",
            "/author/target",
        )
    })?;
    let author = validate_author(&author_input, author_target, &rt, ctx)?;
    let source = copy_json(
        get(&author, "target").ok_or_else(|| {
            err(
                "CORE_KIND_RECEIPT",
                "Author target is missing",
                "/author/target",
            )
        })?,
        ctx,
    )?;
    let (record, record_module, record_index, record_path) = locate(&source, &author, ctx)?;
    let namespace = text(get(&request, "namespace")).ok_or_else(|| {
        err(
            "RECORD_POSTGRESQL_REQUEST",
            "namespace is required",
            "/request/namespace",
        )
    })?;
    let table = text(get(&request, "tableName")).ok_or_else(|| {
        err(
            "RECORD_POSTGRESQL_REQUEST",
            "tableName is required",
            "/request/tableName",
        )
    })?;
    let namespace_sql = quote_identifier(namespace, "/request/namespace", ctx)?;
    let table_sql = quote_identifier(table, "/request/tableName", ctx)?;
    let mode = text_owned(get(&request, "mode")).unwrap_or_default();
    let kind = text_owned(get(
        get(&author, "provenance").unwrap_or(&Value::Null),
        "kind",
    ))
    .unwrap_or_default();
    let mut residuals = Vec::new();
    let mut fatal_paths = Vec::new();
    let mut hard = false;
    let mut mappings = Vec::new();
    if kind != "record" {
        push_record_fatal(
            &mut residuals,
            &mut fatal_paths,
            format!("{record_path}/kind"),
            get(record, "kind").unwrap_or(&Value::Null),
            "Only an authored record can define the native table",
            ctx,
        )?;
        hard = true;
    }
    if let Some(name) = text(get(record, "name")) {
        if name != table {
            push_residual(
                &mut residuals,
                format!("{record_path}/name"),
                &Value::String(name.clone()),
                "Native table name differs from ideal name",
                "not-expressible",
                ctx,
            )?;
        }
    }
    let mut members: Vec<(Value, usize)> = Vec::new();
    for (index, reference) in array(get(record, "references")).iter().enumerate() {
        ctx.charge_work(1, k("/references"))?;
        if text_owned(get(reference, "role")).as_deref() != Some("member") {
            push_residual(
                &mut residuals,
                format!("{record_path}/references/{index}"),
                reference,
                "Non-member relationship is retained but not projected",
                "unknown",
                ctx,
            )?;
            continue;
        }
        let mut duplicate = false;
        for (existing, _) in &members {
            ctx.charge_work(1, k("/references"))?;
            if ref_equal(existing, reference, ctx)? {
                duplicate = true;
                break;
            }
        }
        if duplicate {
            push_record_fatal(
                &mut residuals,
                &mut fatal_paths,
                format!("{record_path}/references/{index}"),
                reference,
                "Duplicate record member",
                ctx,
            )?;
            hard = true;
        } else {
            members.push((copy_json(reference, ctx)?, index));
        }
        if let Value::Object(fields) = reference {
            for (name, value) in fields {
                ctx.charge_work(1, k("/references"))?;
                if !["role", "module", "element"].iter().any(|n| name == &k(n)) {
                    push_residual(
                        &mut residuals,
                        pointer_path(&format!("{record_path}/references/{index}"), name, ctx)?,
                        value,
                        "Reference metadata is not projected",
                        "unknown",
                        ctx,
                    )?;
                }
            }
        }
    }
    let requested = array(get(&request, "fields"));
    let mut bindings: Vec<(Value, usize, String, String)> = Vec::new();
    let mut names: Vec<String> = Vec::new();
    for (field_index, field) in requested.iter().enumerate() {
        ctx.charge_work(1, k("/request/fields"))?;
        let field_author = get(field, "author").ok_or_else(|| {
            err(
                "RECORD_POSTGRESQL_REQUEST",
                "Field author is required",
                "/request/fields/author",
            )
        })?;
        let verified = validate_author(field_author, &source, &rt, ctx)?;
        let identity = get(&verified, "identity").ok_or_else(|| {
            err(
                "CORE_KIND_RECEIPT",
                "Field author identity is required",
                "/request/fields/author/identity",
            )
        })?;
        let column = text(get(field, "columnName")).ok_or_else(|| {
            err(
                "RECORD_POSTGRESQL_REQUEST",
                "Column name is required",
                "/request/fields/columnName",
            )
        })?;
        let native = text_owned(get(field, "nativeType")).ok_or_else(|| {
            err(
                "RECORD_POSTGRESQL_REQUEST",
                "Native type is required",
                "/request/fields/nativeType",
            )
        })?;
        let _ = quote_identifier(
            column,
            &format!("/request/fields/{field_index}/columnName"),
            ctx,
        )?;
        let duplicate = bindings
            .iter()
            .try_fold(false, |found, (previous, _, _, _)| {
                if found {
                    Ok(true)
                } else {
                    ref_equal(previous, identity, ctx)
                }
            })?;
        let is_member = members.iter().try_fold(false, |found, (reference, _)| {
            if found {
                Ok(true)
            } else {
                ref_equal(reference, identity, ctx)
            }
        })?;
        if duplicate || !is_member {
            let author_path = text(get(&verified, "provenance").and_then(|v| get(v, "idealPath")))
                .ok_or_else(|| {
                    err(
                        "CORE_KIND_RECEIPT",
                        "Author path is required",
                        "/request/fields/author/provenance/idealPath",
                    )
                })?
                .clone();
            push_record_fatal(
                &mut residuals,
                &mut fatal_paths,
                author_path,
                field,
                "Duplicate or non-member native binding",
                ctx,
            )?;
            hard = true;
        } else {
            bindings.push((
                copy_json(identity, ctx)?,
                field_index,
                column.to_utf8().map_err(|_| {
                    err(
                        "POSTGRESQL_IDENTIFIER",
                        "Expected valid Unicode",
                        &format!("/request/fields/{field_index}/columnName"),
                    )
                })?,
                native,
            ));
        }
        let col = column.to_utf8().map_err(|_| {
            err(
                "POSTGRESQL_IDENTIFIER",
                "Expected valid Unicode",
                &format!("/request/fields/{field_index}/columnName"),
            )
        })?;
        if names.iter().any(|prior| prior == &col) {
            let author_path = text(get(&verified, "provenance").and_then(|v| get(v, "idealPath")))
                .ok_or_else(|| {
                    err(
                        "CORE_KIND_RECEIPT",
                        "Author path is required",
                        "/request/fields/author/provenance/idealPath",
                    )
                })?
                .clone();
            push_record_fatal(
                &mut residuals,
                &mut fatal_paths,
                author_path,
                &Value::String(column.clone()),
                "Native column names collide",
                ctx,
            )?;
            hard = true;
        }
        names.push(col);
    }
    let source_modules = array(get(&source, "modules"));
    let mut included = vec![(record_module, record_index)];
    let mut columns: Vec<(String, String, Option<Value>, String, Option<Value>)> = Vec::new();
    for (reference, _) in &members {
        ctx.charge_work(1, k("/references"))?;
        let ref_module = text(get(reference, "module")).ok_or_else(|| {
            err(
                "RECORD_POSTGRESQL_IDENTITY",
                "Member module is required",
                "/references/module",
            )
        })?;
        let ref_element = text(get(reference, "element")).ok_or_else(|| {
            err(
                "RECORD_POSTGRESQL_IDENTITY",
                "Member element is required",
                "/references/element",
            )
        })?;
        let mut loc = None;
        'find: for (mi, module) in source_modules.iter().enumerate() {
            ctx.charge_work(1, k("/modules"))?;
            if text(get(module, "id")) != Some(ref_module) {
                continue;
            }
            for (ei, element) in array(get(module, "elements")).iter().enumerate() {
                ctx.charge_work(1, k("/modules"))?;
                if text(get(element, "id")) == Some(ref_element) {
                    loc = Some((mi, ei, element));
                    break 'find;
                }
            }
        }
        let (mi, ei, element) = loc.ok_or_else(|| {
            err(
                "CORE_KIND_MISSING",
                "Record member is absent from source",
                "/author/target/modules",
            )
        })?;
        included.push((mi, ei));
        let mut matched = None;
        for binding in &bindings {
            let identity = &binding.0;
            if ref_equal(reference, identity, ctx)? {
                matched = Some(binding);
                break;
            }
        }
        let Some(binding) = matched else {
            let path = format!("/modules/{mi}/elements/{ei}");
            push_record_fatal(
                &mut residuals,
                &mut fatal_paths,
                path,
                element,
                "Missing explicit member binding",
                ctx,
            )?;
            hard = true;
            continue;
        };
        let field_index = binding.1;
        let request_field = &requested[field_index];
        let field_author = get(request_field, "author").unwrap_or(&Value::Null);
        let field_kind = text_owned(get(
            get(field_author, "provenance").unwrap_or(&Value::Null),
            "kind",
        ))
        .unwrap_or_default();
        let field_path = format!("/modules/{mi}/elements/{ei}");
        if field_kind != "field" {
            push_record_fatal(
                &mut residuals,
                &mut fatal_paths,
                format!("/modules/{mi}/elements/{ei}/kind"),
                get(element, "kind").unwrap_or(&Value::Null),
                "Record member is not an authored field",
                ctx,
            )?;
            hard = true;
        }
        if let Some(name) = text(get(element, "name")) {
            if name.to_utf8().ok().as_deref() != Some(binding.2.as_str()) {
                push_residual(
                    &mut residuals,
                    format!("/modules/{mi}/elements/{ei}/name"),
                    &Value::String(name.clone()),
                    "Native column name differs from ideal name",
                    "not-expressible",
                    ctx,
                )?;
            }
        }
        mappings.push(obj(vec![
            ("origin", s("authored")),
            ("kind", s("field")),
            ("idealPath", s(&format!("/modules/{mi}/elements/{ei}/kind"))),
            (
                "nativePath",
                s(&format!(
                    "/stmts/0/stmt/CreateStmt/tableElts/{}/ColumnDef",
                    mappings.len()
                )),
            ),
            ("outcome", s("exact")),
        ]));
        let description = text(get(element, "description")).map(|x| Value::String(x.clone()));
        let scalar = get(element, "scalarType")
            .map(|value| copy_json(value, ctx))
            .transpose()?;
        columns.push((
            binding.2.clone(),
            binding.3.clone(),
            description,
            field_path,
            scalar,
        ));
    }
    // Closed source retention and foreign-module/element diagnostics follow the TypeScript loop order.
    if let Value::Object(fields) = &source {
        for (name, value) in fields {
            ctx.charge_work(1, k("/source"))?;
            if !["umf", "id", "modules", "vocabularies"]
                .iter()
                .any(|n| name == &k(n))
            {
                push_residual(
                    &mut residuals,
                    pointer_path("", name, ctx)?,
                    value,
                    "Document metadata is not projected",
                    "unknown",
                    ctx,
                )?;
            }
        }
    }
    if let Value::Object(vocab) = get(&source, "vocabularies").unwrap_or(&Value::Null) {
        if !vocab.is_empty() {
            push_residual(
                &mut residuals,
                "/vocabularies".to_string(),
                get(&source, "vocabularies").unwrap(),
                "Native vocabulary semantics are not projected",
                "unknown",
                ctx,
            )?;
        }
    }
    for (mi, module) in source_modules.iter().enumerate() {
        ctx.charge_work(1, k("/modules"))?;
        let root = format!("/modules/{mi}");
        let module_included = included.iter().any(|(m, _)| *m == mi);
        if !module_included {
            push_residual(
                &mut residuals,
                root.clone(),
                module,
                "Module lies outside projected record",
                "unknown",
                ctx,
            )?;
            continue;
        }
        if let Some(actual) = text(get(module, "namespace")) {
            if !actual.is_empty() && actual != namespace {
                push_residual(
                    &mut residuals,
                    format!("{root}/namespace"),
                    &Value::String(actual.clone()),
                    "Native schema name differs from ideal namespace",
                    "not-expressible",
                    ctx,
                )?;
            }
        }
        if let Value::Object(fields) = module {
            for (name, value) in fields {
                ctx.charge_work(1, k("/modules"))?;
                if !["id", "namespace", "elements"]
                    .iter()
                    .any(|n| name == &k(n))
                {
                    push_residual(
                        &mut residuals,
                        pointer_path(&root, name, ctx)?,
                        value,
                        "Module metadata is not projected",
                        "unknown",
                        ctx,
                    )?;
                }
            }
        }
        for (ei, element) in array(get(module, "elements")).iter().enumerate() {
            ctx.charge_work(1, k("/modules"))?;
            if !included.contains(&(mi, ei)) {
                push_residual(
                    &mut residuals,
                    format!("{root}/elements/{ei}"),
                    element,
                    "Element lies outside projected record",
                    "unknown",
                    ctx,
                )?;
                continue;
            }
            let known = if (mi, ei) == (record_module, record_index) {
                ["id", "kind", "name", "description", "references"].as_slice()
            } else {
                ["id", "kind", "name", "description", "scalarType"].as_slice()
            };
            if let Value::Object(fields) = element {
                for (name, value) in fields {
                    ctx.charge_work(1, k("/modules"))?;
                    if !known.iter().any(|n| name == &k(n))
                        && !(name == &k("extensions")
                            && matches!(value,Value::Object(x) if x.is_empty()))
                    {
                        push_residual(
                            &mut residuals,
                            pointer_path(&format!("{root}/elements/{ei}"), name, ctx)?,
                            value,
                            "Element metadata is not projected",
                            "unknown",
                            ctx,
                        )?;
                    }
                }
            }
        }
    }
    let mut sql = String::new();
    if !hard {
        let mut definitions = Vec::with_capacity(columns.len());
        for (name, native, _, _, _) in &columns {
            let (native_name, _) = field_native_type(native).ok_or_else(|| {
                err(
                    "RECORD_POSTGRESQL_REQUEST",
                    "Unsupported PostgreSQL native carrier",
                    "/request/fields/nativeType",
                )
            })?;
            definitions.push(format!(
                "{} pg_catalog.{native_name}",
                quote_identifier(
                    &Utf16::from(name.as_str()),
                    "/request/fields/columnName",
                    ctx
                )?
            ));
        }
        sql = format!(
            "CREATE TABLE {namespace_sql}.{table_sql} ({});\n",
            definitions.join(", ")
        );
        if let Some(description) = text(get(record, "description")) {
            sql.push_str(&format!(
                "COMMENT ON TABLE {namespace_sql}.{table_sql} IS {};\n",
                quote_literal(description, "/description", ctx)?
            ));
        }
        for (name, _, description, _, _) in &columns {
            ctx.charge_work(1, k("/request/fields"))?;
            if let Some(Value::String(description)) = description {
                sql.push_str(&format!(
                    "COMMENT ON COLUMN {namespace_sql}.{table_sql}.{} IS {};\n",
                    quote_identifier(
                        &Utf16::from(name.as_str()),
                        "/request/fields/columnName",
                        ctx
                    )?,
                    quote_literal(description, "/description", ctx)?
                ));
            }
        }
        for (_, native, _, path, scalar) in &columns {
            ctx.charge_work(1, k("/request/fields"))?;
            if let Some(Value::String(scalar)) = scalar {
                if scalar.to_utf8().ok().as_deref() != field_native_family(native) {
                    push_residual(
                        &mut residuals,
                        format!("{path}/scalarType"),
                        &Value::String(scalar.clone()),
                        "Native type does not establish ideal scalar family",
                        "not-expressible",
                        ctx,
                    )?;
                }
            }
        }
    }
    for mapping in &mut mappings {
        let ideal = text(get(mapping, "idealPath")).ok_or_else(|| {
            err(
                "RECORD_POSTGRESQL_RESULT",
                "Mapping ideal path is missing",
                "/mappings/idealPath",
            )
        })?;
        let prefix = ideal
            .units()
            .strip_suffix("/kind".encode_utf16().collect::<Vec<_>>().as_slice())
            .ok_or_else(|| {
                err(
                    "RECORD_POSTGRESQL_RESULT",
                    "Mapping ideal path is malformed",
                    "/mappings/idealPath",
                )
            })?;
        if has_residual_at(&residuals, prefix, ctx)? {
            set(mapping, "outcome", s("unknown"))?;
        }
    }
    let record_outcome = if residuals.is_empty() {
        "exact"
    } else {
        "unknown"
    };
    mappings.insert(
        0,
        obj(vec![
            ("origin", s("authored")),
            ("kind", s("record")),
            ("idealPath", s(&format!("{record_path}/kind"))),
            ("nativePath", s("/stmts/0/stmt/CreateStmt")),
            ("outcome", s(record_outcome)),
        ]),
    );
    let blocked = hard || mode == "strict" && !residuals.is_empty();
    let diag = record_diagnostics(&residuals, &fatal_paths, mode == "strict", ctx)?;
    let mut result = obj(vec![
        ("operation", s("project-record-postgresql")),
        ("version", s("1.0.0")),
        ("status", s(if blocked { "blocked" } else { "projected" })),
        ("source", source),
        ("author", author),
        ("request", request),
        (
            "binding",
            obj(vec![
                ("id", s("umf.core.record.postgresql")),
                ("version", s("1.0.0")),
                ("nativeVersion", s("17.4")),
                ("subset", s(RECORD_SUBSET)),
            ]),
        ),
        ("residuals", Value::Array(residuals)),
        ("mappings", Value::Array(mappings)),
        ("diagnostics", diag),
    ]);
    if !blocked {
        set(&mut result, "nativeSql", s(&sql))?;
        return Ok(result);
    }
    validate(&result_schema, &result, "RECORD_POSTGRESQL_RESULT", ctx)?;
    Ok(result)
}
pub fn prepare_field_projection(
    author: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    field_project(author, request, ctx)
}
pub fn prepare_record_projection(
    author: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    record_project(author, request, ctx)
}
fn complete(
    prepared_input: &Value,
    target_input: &Value,
    field: bool,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    let (result_schema, _) = schemas(&rt, field, ctx)?;
    let mut prepared = copy_json(prepared_input, ctx)?;
    let code = if field {
        "FIELD_POSTGRESQL_RESULT"
    } else {
        "RECORD_POSTGRESQL_RESULT"
    };
    let status = text_owned(get(&prepared, "status"));
    if status.as_deref() != Some("projected") && status.as_deref() != Some("blocked") {
        return Err(err(
            code,
            "Expected Rust-prepared result",
            "/prepared/status",
        ));
    }
    let author = get(&prepared, "author")
        .ok_or_else(|| err(code, "Prepared author is missing", "/prepared/author"))?;
    let request = get(&prepared, "request")
        .ok_or_else(|| err(code, "Prepared request is missing", "/prepared/request"))?;
    let recomputed = if field {
        field_project(author, request, ctx)?
    } else {
        record_project(author, request, ctx)?
    };
    if !same(&prepared, &recomputed, ctx)? {
        return Err(err(
            code,
            "Prepared projection differs from Rust recomputation",
            "/prepared",
        ));
    }
    if status.as_deref() == Some("blocked") {
        validate(&result_schema, &prepared, code, ctx)?;
        return Ok(prepared);
    }
    let native = get(&prepared, "nativeSql")
        .ok_or_else(|| err(code, "Prepared SQL is missing", "/prepared/nativeSql"))?;
    let request_id = get(request, "id").ok_or_else(|| {
        err(
            code,
            "Prepared request id is missing",
            "/prepared/request/id",
        )
    })?;
    if !same(
        get(target_input, "id").unwrap_or(&Value::Null),
        request_id,
        ctx,
    )? {
        return Err(err(
            code,
            "Parsed target id differs from the prepared request",
            "/target/id",
        ));
    }
    let target_report = crate::postgresql_sql_runtime::inspect_postgresql_sql(target_input, ctx)?;
    // Raw syntax intentionally retains the unresolved-catalog warning. Only
    // invalid or unexportable version/representation content blocks this stage.
    let mut unavailable = !matches!(get(&target_report, "valid"), Some(Value::Bool(true)));
    for diagnostic in array(get(&target_report, "diagnostics")) {
        ctx.charge_work(1, k("/target"))?;
        if matches!(text(get(diagnostic, "code")), Some(code) if code == &k("POSTGRESQL_VERSION") || code == &k("POSTGRESQL_REPRESENTATION")) {
            unavailable = true;
        }
    }
    if unavailable {
        return Err(err(
            code,
            "Parsed PostgreSQL target is not fully valid",
            "/target",
        ));
    }
    let current_source = crate::postgresql_sql_runtime::get_postgresql_source(target_input, ctx)?;
    if text(Some(&current_source)) != text(Some(native)) {
        return Err(err(
            code,
            "Parsed target does not retain the Rust-prepared SQL",
            "/target",
        ));
    }
    set(&mut prepared, "target", copy_json(target_input, ctx)?)?;
    validate(&result_schema, &prepared, code, ctx)?;
    Ok(prepared)
}
pub fn complete_field_projection(
    prepared: &Value,
    target: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    complete(prepared, target, true, ctx)
}
pub fn complete_record_projection(
    prepared: &Value,
    target: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    complete(prepared, target, false, ctx)
}
fn prepare_recovery(
    receipt_input: &Value,
    field: bool,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    let (result_schema, _) = schemas(&rt, field, ctx)?;
    let receipt = copy_json(receipt_input, ctx)?;
    let code = if field {
        "FIELD_POSTGRESQL_RECEIPT"
    } else {
        "RECORD_POSTGRESQL_RECEIPT"
    };
    validate(&result_schema, &receipt, code, ctx)?;
    if text_owned(get(&receipt, "status")).as_deref() != Some("projected")
        || get(&receipt, "target").is_none()
        || get(&receipt, "nativeSql").is_none()
        || get(&receipt, "author").is_none()
        || get(&receipt, "request").is_none()
    {
        return Err(err(
            code,
            "Expected complete projected receipt",
            "/receipt/status",
        ));
    }
    Ok(Value::Bool(true))
}
pub fn prepare_field_recovery(
    receipt: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    prepare_recovery(receipt, true, ctx)
}
pub fn prepare_record_recovery(
    receipt: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    prepare_recovery(receipt, false, ctx)
}
fn recover(
    receipt_input: &Value,
    fresh_input: &Value,
    native_input: &Value,
    field: bool,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    let (result_schema, _) = schemas(&rt, field, ctx)?;
    let receipt = copy_json(receipt_input, ctx)?;
    let fresh = copy_json(fresh_input, ctx)?;
    let receipt_code = if field {
        "FIELD_POSTGRESQL_RECEIPT"
    } else {
        "RECORD_POSTGRESQL_RECEIPT"
    };
    validate(&result_schema, &receipt, receipt_code, ctx)?;
    validate(&result_schema, &fresh, receipt_code, ctx)?;
    if text_owned(get(&receipt, "status")).as_deref() != Some("projected")
        || get(&receipt, "target").is_none()
        || get(&fresh, "target").is_none()
    {
        return Err(err(
            receipt_code,
            "Expected complete projected receipt",
            "/receipt/status",
        ));
    }
    let author = get(&receipt, "author")
        .ok_or_else(|| err(receipt_code, "Author is missing", "/receipt/author"))?;
    let request = get(&receipt, "request")
        .ok_or_else(|| err(receipt_code, "Request is missing", "/receipt/request"))?;
    let expected_prepared = if field {
        field_project(author, request, ctx)?
    } else {
        record_project(author, request, ctx)?
    };
    let expected_fresh = complete(
        &expected_prepared,
        get(&fresh, "target").unwrap(),
        field,
        ctx,
    )?;
    if !same(&fresh, &expected_fresh, ctx)? || !same(&receipt, &fresh, ctx)? {
        return Err(err(
            receipt_code,
            "Receipt differs from the fresh Rust projection, including its parsed target",
            "/receipt",
        ));
    }
    let stale_code = if field {
        "FIELD_POSTGRESQL_STALE"
    } else {
        "RECORD_POSTGRESQL_STALE"
    };
    let Value::String(native) = native_input else {
        return Err(err(
            stale_code,
            "Native SQL text is required",
            "/nativeText",
        ));
    };
    let current_source = crate::postgresql_sql_runtime::get_postgresql_source(
        get(&receipt, "target").unwrap(),
        ctx,
    )?;
    if text(get(&receipt, "nativeSql")) != Some(native)
        || text(Some(&current_source)) != Some(native)
    {
        return Err(err(
            stale_code,
            "Native target changed; retained report cannot assert recovery",
            "/nativeText",
        ));
    }
    copy_json(
        get(&receipt, "source")
            .ok_or_else(|| err(receipt_code, "Source is missing", "/receipt/source"))?,
        ctx,
    )
}

pub fn recover_field_projection(
    receipt: &Value,
    fresh: &Value,
    native_text: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    recover(receipt, fresh, native_text, true, ctx)
}
pub fn recover_record_projection(
    receipt: &Value,
    fresh: &Value,
    native_text: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    recover(receipt, fresh, native_text, false, ctx)
}

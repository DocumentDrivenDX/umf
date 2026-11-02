// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned authored Field and Record projection to SQL Server DDL.
use crate::{
    context::Context,
    core_kind,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};

const CORE: &str = include_str!("../../../spec/core/schema.json");
const KIND: &str = include_str!("../../../spec/core/kind-operation-v6.schema.json");
const FIELD: &str = include_str!("../../../spec/core/field-sqlserver-projection.schema.json");
const RECORD: &str = include_str!("../../../spec/core/record-sqlserver-projection.schema.json");
const RECOVERY: &str = "Recover source meaning with retained projection receipt; native-only import does not recover author intent";
const FIELD_SUBSET: &str = "Single authored Field to permanent table DDL with explicit builtin carrier and nullable column; no value-domain or constraint equivalence";
const RECORD_SUBSET: &str = "Authored flat record with explicit builtin nullable carriers; requires database identifier collation Latin1_General_100_BIN2; no value-domain equivalence";

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
            "SQLSERVER_FIELD_RECORD_SCHEMA",
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
            "SQLSERVER_TEXT",
            "Expected valid Unicode without NUL",
            path,
        ));
    };
    if text.contains('\0') {
        return Err(err(
            "SQLSERVER_TEXT",
            "Expected valid Unicode without NUL",
            path,
        ));
    }
    if value.is_empty()
        || value.len() > 128
        || text.trim_matches(is_js_whitespace) != text
        || text.starts_with('#')
    {
        return Err(err("SQLSERVER_IDENTIFIER","Expected a permanent, nonempty SQL Server identifier of at most 128 UTF-16 units without edge whitespace",path));
    }
    Ok(format!("[{}]", text.replace(']', "]]")))
}
fn is_js_whitespace(ch: char) -> bool {
    matches!(
        ch,
        '\u{0009}'
            | '\u{000a}'
            | '\u{000b}'
            | '\u{000c}'
            | '\u{000d}'
            | ' '
            | '\u{00a0}'
            | '\u{1680}'
            | '\u{2000}'
            ..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    )
}
fn quote_literal(value: &Utf16, path: &str, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    ctx.charge_work(value.len(), k(path))?;
    let Some(text) = value.to_utf8().ok() else {
        return Err(err(
            "SQLSERVER_TEXT",
            "Expected valid Unicode without NUL",
            path,
        ));
    };
    if text.contains('\0') {
        return Err(err(
            "SQLSERVER_TEXT",
            "Expected valid Unicode without NUL",
            path,
        ));
    }
    Ok(format!("N'{}'", text.replace('\'', "''")))
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
fn field_native_family(native: &str) -> Option<&'static str> {
    Some(match native {
        "bit" => "boolean",
        "tinyint" | "smallint" | "int" | "bigint" => "integer",
        "decimal(38,9)" => "decimal",
        "real" | "float(53)" => "float",
        "nvarchar(max)" => "string",
        "varbinary(max)" => "binary",
        "date" => "date",
        "time(7)" => "time",
        "datetime2(7)" | "datetimeoffset(7)" => "timestamp",
        _ => return None,
    })
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
    validate(&request_schema, &request, "FIELD_SQLSERVER_REQUEST", ctx)?;
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
            "FIELD_SQLSERVER_REQUEST",
            "namespace is required",
            "/request/namespace",
        )
    })?;
    let table = text(get(&request, "tableName")).ok_or_else(|| {
        err(
            "FIELD_SQLSERVER_REQUEST",
            "tableName is required",
            "/request/tableName",
        )
    })?;
    let column = text(get(&request, "columnName")).ok_or_else(|| {
        err(
            "FIELD_SQLSERVER_REQUEST",
            "columnName is required",
            "/request/columnName",
        )
    })?;
    let native = text_owned(get(&request, "nativeType")).ok_or_else(|| {
        err(
            "FIELD_SQLSERVER_REQUEST",
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
    let mut sql =
        format!("CREATE TABLE {namespace_sql}.{table_sql} ({column_sql} {native} NULL);\n");
    if let Some(description) = text(get(element, "description")) {
        if description.len() > 3750 {
            push_residual(
                &mut residuals,
                format!("{path}/description"),
                &Value::String(description.clone()),
                "Description exceeds the bounded extended-property value size",
                "not-expressible",
                ctx,
            )?;
        } else {
            sql.push_str(&format!("EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value={}, @level0type=N'SCHEMA', @level0name={}, @level1type=N'TABLE', @level1name={}, @level2type=N'COLUMN', @level2name={};\n",quote_literal(description,"/description",ctx)?,quote_literal(namespace,"/request/namespace",ctx)?,quote_literal(table,"/request/tableName",ctx)?,quote_literal(column,"/request/columnName",ctx)?));
        }
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
        ("operation", s("project-field-sqlserver")),
        ("version", s("1.0.0")),
        ("status", s(if blocked { "blocked" } else { "projected" })),
        ("source", source),
        ("author", author),
        ("request", request),
        (
            "binding",
            obj(vec![
                ("id", s("umf.core.field.sqlserver")),
                ("version", s("1.0.0")),
                ("nativeVersion", s("16.0.4295.3")),
                ("subset", s(FIELD_SUBSET)),
            ]),
        ),
        (
            "mapping",
            obj(vec![
                ("origin", s("authored")),
                ("idealPath", s(&format!("{path}/kind"))),
                ("nativePath", s("/sql")),
                ("outcome", s(outcome)),
            ]),
        ),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", diagnostic_values),
    ]);
    if !blocked {
        set(
            &mut result,
            "target",
            obj(vec![("format", s("sqlserver-ddl")), ("sql", s(&sql))]),
        )?;
        set(&mut result, "nativeSql", s(&sql))?;
    }
    validate(&result_schema, &result, "FIELD_SQLSERVER_RESULT", ctx)?;
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
    validate(&request_schema, &request, "RECORD_SQLSERVER_REQUEST", ctx)?;
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
            "RECORD_SQLSERVER_REQUEST",
            "namespace is required",
            "/request/namespace",
        )
    })?;
    let table = text(get(&request, "tableName")).ok_or_else(|| {
        err(
            "RECORD_SQLSERVER_REQUEST",
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
                "RECORD_SQLSERVER_REQUEST",
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
                "RECORD_SQLSERVER_REQUEST",
                "Column name is required",
                "/request/fields/columnName",
            )
        })?;
        let native = text_owned(get(field, "nativeType")).ok_or_else(|| {
            err(
                "RECORD_SQLSERVER_REQUEST",
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
                        "SQLSERVER_IDENTIFIER",
                        "Expected valid Unicode",
                        &format!("/request/fields/{field_index}/columnName"),
                    )
                })?,
                native,
            ));
        }
        let col = column.to_utf8().map_err(|_| {
            err(
                "SQLSERVER_IDENTIFIER",
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
                "RECORD_SQLSERVER_IDENTITY",
                "Member module is required",
                "/references/module",
            )
        })?;
        let ref_element = text(get(reference, "element")).ok_or_else(|| {
            err(
                "RECORD_SQLSERVER_IDENTITY",
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
            ("nativePath", s("/sql")),
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
    if columns.is_empty() {
        push_record_fatal(
            &mut residuals,
            &mut fatal_paths,
            record_path.clone(),
            record,
            "SQL Server cannot express a zero-column table",
            ctx,
        )?;
        hard = true;
    }
    let mut sql = String::new();
    if !hard {
        sql=format!("IF CONVERT(nvarchar(128), DATABASEPROPERTYEX(DB_NAME(), 'Collation')) <> N'Latin1_General_100_BIN2' THROW 50000, 'UMF requires database identifier collation Latin1_General_100_BIN2', 1;\nCREATE TABLE {namespace_sql}.{table_sql} ({});\n",columns.iter().map(|(name,ty,_,_,_)|Ok(format!("{} {ty} NULL",quote_identifier(&Utf16::from(name.as_str()),"/request/fields/columnName",ctx)?))).collect::<Result<Vec<_>,EngineError>>()?.join(", "));
        if let Some(description) = text(get(record, "description")) {
            if description.len() > 3750 {
                push_residual(
                    &mut residuals,
                    format!("{record_path}/description"),
                    &Value::String(description.clone()),
                    "Description exceeds the bounded extended-property value size",
                    "not-expressible",
                    ctx,
                )?;
            } else {
                sql.push_str(&format!("EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value={}, @level0type=N'SCHEMA', @level0name={}, @level1type=N'TABLE', @level1name={};\n",quote_literal(description,"/description",ctx)?,quote_literal(namespace,"/request/namespace",ctx)?,quote_literal(table,"/request/tableName",ctx)?));
            }
        }
        for (name, _, description, path, _) in &columns {
            ctx.charge_work(1, k("/request/fields"))?;
            if let Some(Value::String(description)) = description {
                if description.len() > 3750 {
                    push_residual(
                        &mut residuals,
                        format!("{path}/description"),
                        &Value::String(description.clone()),
                        "Description exceeds the bounded extended-property value size",
                        "not-expressible",
                        ctx,
                    )?;
                } else {
                    sql.push_str(&format!("EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value={}, @level0type=N'SCHEMA', @level0name={}, @level1type=N'TABLE', @level1name={}, @level2type=N'COLUMN', @level2name={};\n",quote_literal(description,"/description",ctx)?,quote_literal(namespace,"/request/namespace",ctx)?,quote_literal(table,"/request/tableName",ctx)?,quote_literal(&Utf16::from(name.as_str()),"/request/fields/columnName",ctx)?));
                }
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
                "RECORD_SQLSERVER_RESULT",
                "Mapping ideal path is missing",
                "/mappings/idealPath",
            )
        })?;
        let prefix = ideal
            .units()
            .strip_suffix("/kind".encode_utf16().collect::<Vec<_>>().as_slice())
            .ok_or_else(|| {
                err(
                    "RECORD_SQLSERVER_RESULT",
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
            ("nativePath", s("/sql")),
            ("outcome", s(record_outcome)),
        ]),
    );
    let blocked = hard || mode == "strict" && !residuals.is_empty();
    let diag = record_diagnostics(&residuals, &fatal_paths, mode == "strict", ctx)?;
    let mut result = obj(vec![
        ("operation", s("project-record-sqlserver")),
        ("version", s("1.0.0")),
        ("status", s(if blocked { "blocked" } else { "projected" })),
        ("source", source),
        ("author", author),
        ("request", request),
        (
            "binding",
            obj(vec![
                ("id", s("umf.core.record.sqlserver")),
                ("version", s("1.0.0")),
                ("nativeVersion", s("16.0.4295.3")),
                ("subset", s(RECORD_SUBSET)),
            ]),
        ),
        ("residuals", Value::Array(residuals)),
        ("mappings", Value::Array(mappings)),
        ("diagnostics", diag),
    ]);
    if !blocked {
        set(
            &mut result,
            "target",
            obj(vec![("format", s("sqlserver-ddl")), ("sql", s(&sql))]),
        )?;
        set(&mut result, "nativeSql", s(&sql))?;
    }
    validate(&result_schema, &result, "RECORD_SQLSERVER_RESULT", ctx)?;
    Ok(result)
}
pub fn project_field_to_sqlserver(
    author: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    field_project(author, request, ctx)
}
pub fn project_record_to_sqlserver(
    author: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    record_project(author, request, ctx)
}
fn recover(
    receipt_input: &Value,
    native_input: &Value,
    field: bool,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    let (result_schema, _) = schemas(&rt, field, ctx)?;
    let receipt = copy_json(receipt_input, ctx)?;
    let receipt_code = if field {
        "FIELD_SQLSERVER_RECEIPT"
    } else {
        "RECORD_SQLSERVER_RECEIPT"
    };
    validate(&result_schema, &receipt, receipt_code, ctx)?;
    if text_owned(get(&receipt, "status")).as_deref() != Some("projected")
        || get(&receipt, "target").is_none()
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
    let expected = if field {
        field_project(author, request, ctx)?
    } else {
        record_project(author, request, ctx)?
    };
    if !same(&receipt, &expected, ctx)? {
        return Err(err(
            receipt_code,
            "Receipt differs from recomputed source, author, request and mapping",
            "/receipt",
        ));
    }
    let stale_code = if field {
        "FIELD_SQLSERVER_STALE"
    } else {
        "RECORD_SQLSERVER_STALE"
    };
    let Value::String(native) = native_input else {
        return Err(err(
            stale_code,
            "Native SQL text is required",
            "/nativeText",
        ));
    };
    if text(get(&receipt, "nativeSql")) != Some(native)
        || text(get(get(&receipt, "target").unwrap_or(&Value::Null), "sql")) != Some(native)
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
pub fn recover_field_from_sqlserver(
    receipt: &Value,
    native_text: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    recover(receipt, native_text, true, ctx)
}
pub fn recover_record_from_sqlserver(
    receipt: &Value,
    native_text: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    recover(receipt, native_text, false, ctx)
}

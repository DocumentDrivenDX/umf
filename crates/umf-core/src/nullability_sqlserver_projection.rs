// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned authored availability projection to SQL Server stored columns.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};

const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/nullability-sqlserver-projection.schema.json");
const CORE_SCHEMA: &str = include_str!("../../../spec/core/schema.json");
const NULLABILITY_SCHEMA: &str =
    include_str!("../../../spec/core/nullability-operation-v5.schema.json");
const RECOVERY: &str = "Recover source meaning with retained projection receipt; native-only import does not recover author intent";
const BINDING: &str = "umf.core.nullability.sqlserver";
const BINDING_SUBSET: &str = "Single authored Field availability with explicit builtin carrier and stored-relation SQL-NULL policy; excludes input omission, query guarantees and native equivalence";

fn k(value: &str) -> Utf16 {
    Utf16::from(value)
}
fn s(value: &str) -> Value {
    Value::string_utf8(value)
}
fn obj(values: Vec<(&str, Value)>) -> Value {
    Value::Object(
        values
            .into_iter()
            .map(|(key, value)| (k(key), value))
            .collect(),
    )
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    if let Value::Object(members) = value {
        members
            .iter()
            .find(|(key, _)| key == &k(name))
            .map(|(_, value)| value)
    } else {
        None
    }
}
fn array(value: Option<&Value>) -> &[Value] {
    if let Some(Value::Array(values)) = value {
        values
    } else {
        &[]
    }
}
fn raw(value: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(value)) = value {
        Some(value)
    } else {
        None
    }
}
fn text(value: Option<&Value>) -> Option<String> {
    raw(value).and_then(|x| x.to_utf8().ok())
}
fn err(code: &str, message: &str, path: &str) -> EngineError {
    EngineError::new(code, k(path), message)
}
fn json_resource(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
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
        if let Some(value) = CACHE.get() {
            return Ok(value.clone());
        }
    }
    let engine = Engine::new(
        ResourceSet::new(
            json_resource(CORE_SCHEMA, ctx)?,
            json_resource(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            json_resource(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            json_resource(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            json_resource(
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
fn schemas(ctx: &mut Context<'_>) -> Result<(CompiledSchema, CompiledSchema), EngineError> {
    let operation = json_resource(RESULT_SCHEMA, ctx)?;
    let resources = SchemaResources {
        entries: vec![
            (
                k("urn:umf:core:semantic-type-reference:1.0.0"),
                json_resource(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
            ),
            (k("urn:umf:core:0.10.0"), json_resource(CORE_SCHEMA, ctx)?),
            (
                k("urn:umf:core:nullability-operation:5.0.0"),
                json_resource(NULLABILITY_SCHEMA, ctx)?,
            ),
        ],
    };
    let result = CompiledSchema::compile(&operation, &resources, ctx)?;
    let request = get(
        get(&operation, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| err("NULLABILITY_SQLSERVER_RESULT", "Missing request schema", ""))?;
    Ok((result, CompiledSchema::compile(request, &resources, ctx)?))
}
fn validate(
    value: &Value,
    schema: &CompiledSchema,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    if let Some(diagnostic) = schema.validate(value, ctx)?.first() {
        return Err(EngineError::new(
            code,
            diagnostic.instance_path.clone(),
            diagnostic.message.clone(),
        ));
    }
    Ok(())
}
fn canonical(value: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    match value {
        Value::Object(members) => {
            ctx.charge_work(members.len(), Utf16::default())?;
            let mut sorted = members.iter().collect::<Vec<_>>();
            sorted.sort_by(|a, b| a.0.cmp(&b.0));
            let mut out = String::from("{");
            for (i, (key, value)) in sorted.iter().enumerate() {
                ctx.charge_work(key.len(), Utf16::default())?;
                if i > 0 {
                    out.push(',');
                }
                out.push_str(
                    &serialization::write_json_value(
                        &Value::String((*key).clone()),
                        Format::Json,
                        ctx,
                    )?
                    .to_utf8()
                    .map_err(|_| err("NULLABILITY_SQLSERVER_RECEIPT", "Invalid UTF-16 key", ""))?,
                );
                out.push(':');
                out.push_str(&canonical(value, ctx)?.to_utf8().map_err(|_| {
                    err("NULLABILITY_SQLSERVER_RECEIPT", "Invalid UTF-16 value", "")
                })?);
            }
            out.push('}');
            Ok(Utf16::from(out))
        }
        Value::Array(values) => {
            ctx.charge_work(values.len(), Utf16::default())?;
            let mut out = String::from("[");
            for (i, value) in values.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&canonical(value, ctx)?.to_utf8().map_err(|_| {
                    err("NULLABILITY_SQLSERVER_RECEIPT", "Invalid UTF-16 value", "")
                })?);
            }
            out.push(']');
            Ok(Utf16::from(out))
        }
        _ => serialization::write_json_value(value, Format::Json, ctx),
    }
}
fn identifier(value: &Utf16, path: &str) -> Result<String, EngineError> {
    let string = value
        .to_utf8()
        .map_err(|_| err("SQLSERVER_TEXT", "Expected valid Unicode without NUL", path))?;
    if string.contains('\0') {
        return Err(err(
            "SQLSERVER_TEXT",
            "Expected valid Unicode without NUL",
            path,
        ));
    }
    let trim_edge =
        string.chars().next().is_some_and(js_trim) || string.chars().last().is_some_and(js_trim);
    if value.is_empty() || value.len() > 128 || trim_edge || string.starts_with('#') {
        return Err(err("SQLSERVER_IDENTIFIER","Expected a permanent, nonempty identifier of at most 128 UTF-16 units without edge whitespace",path));
    }
    Ok(format!("[{}]", string.replace(']', "]]")))
}
fn js_trim(c: char) -> bool {
    matches!(
        c,
        '\u{0009}'
            | '\u{000a}'
            | '\u{000b}'
            | '\u{000c}'
            | '\u{000d}'
            | '\u{0020}'
            | '\u{00a0}'
            | '\u{1680}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202f}'
            | '\u{205f}'
            | '\u{3000}'
            | '\u{feff}'
    ) || ('\u{2000}'..='\u{200a}').contains(&c)
}
fn literal(value: &Utf16) -> Result<String, EngineError> {
    let string = value
        .to_utf8()
        .map_err(|_| err("SQLSERVER_TEXT", "Expected valid Unicode without NUL", ""))?;
    if string.contains('\0') {
        return Err(err(
            "SQLSERVER_TEXT",
            "Expected valid Unicode without NUL",
            "",
        ));
    }
    Ok(format!("N'{}'", string.replace('\'', "''")))
}
fn field_path(
    source: &Value,
    author: &Value,
    ctx: &mut Context<'_>,
) -> Result<(String, usize, usize, Value), EngineError> {
    let identity = get(author, "identity").ok_or_else(|| {
        err(
            "NULLABILITY_SQLSERVER_RECEIPT",
            "Author identity is required",
            "/author/identity",
        )
    })?;
    let module = raw(get(identity, "module")).ok_or_else(|| {
        err(
            "NULLABILITY_SQLSERVER_RECEIPT",
            "Author module is required",
            "/author/identity/module",
        )
    })?;
    let element = raw(get(identity, "element")).ok_or_else(|| {
        err(
            "NULLABILITY_SQLSERVER_RECEIPT",
            "Author element is required",
            "/author/identity/element",
        )
    })?;
    for (mi, m) in array(get(source, "modules")).iter().enumerate() {
        if raw(get(m, "id")) != Some(module) {
            continue;
        }
        for (ei, e) in array(get(m, "elements")).iter().enumerate() {
            if raw(get(e, "id")) == Some(element) {
                return Ok((
                    format!("/modules/{mi}/elements/{ei}"),
                    mi,
                    ei,
                    copy_json(e, ctx)?,
                ));
            }
        }
    }
    Err(err(
        "NULLABILITY_SQLSERVER_RECEIPT",
        "Author Field is absent from its target",
        "/author/identity",
    ))
}
fn push_loss(
    residuals: &mut Vec<Value>,
    path: &str,
    value: &Value,
    reason: &str,
    outcome: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    push_loss_path(residuals, k(path), value, reason, outcome, ctx)
}
fn pointer_child(path: &Utf16, key: &Utf16) -> Utf16 {
    let mut out = path.units().to_vec();
    out.push(b'/' as u16);
    for unit in key.units() {
        match *unit {
            0x7e => out.extend([0x7e, 0x30]),
            0x2f => out.extend([0x7e, 0x31]),
            value => out.push(value),
        }
    }
    Utf16::new(out)
}
fn push_loss_path(
    residuals: &mut Vec<Value>,
    path: Utf16,
    value: &Value,
    reason: &str,
    outcome: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    residuals.push(obj(vec![
        ("path", Value::String(path)),
        ("value", copy_json(value, ctx)?),
        ("reason", s(reason)),
        ("outcome", s(outcome)),
        ("recovery", s(RECOVERY)),
    ]));
    Ok(())
}
fn project_inner(
    author_input: &Value,
    request_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let author_input = copy_json(author_input, ctx)?;
    let request = copy_json(request_input, ctx)?;
    let (result_schema, request_schema) = schemas(ctx)?;
    let rt = runtime(ctx)?;
    let current = get(&author_input, "target").ok_or_else(|| {
        err(
            "NULLABILITY_SQLSERVER_RECEIPT",
            "Author target is required",
            "/author/target",
        )
    })?;
    let mut no = NoCapabilities;
    let author = crate::nullability::verify_core_nullability_declaration(
        &author_input,
        current,
        &rt.engine,
        &rt.registry,
        &mut no,
        ctx,
    )?;
    validate(
        &request,
        &request_schema,
        ctx,
        "NULLABILITY_SQLSERVER_REQUEST",
    )?;
    let source = get(&author, "target").ok_or_else(|| {
        err(
            "NULLABILITY_SQLSERVER_RECEIPT",
            "Author target is required",
            "/author/target",
        )
    })?;
    let (path, selected_module, selected_element, element) = field_path(source, &author, ctx)?;
    let req = |name: &str| {
        raw(get(&request, name)).ok_or_else(|| {
            err(
                "NULLABILITY_SQLSERVER_REQUEST",
                "Required request text is missing",
                &format!("/request/{name}"),
            )
        })
    };
    let _id = req("id")?;
    let request_namespace = req("namespace")?;
    let table = req("tableName")?;
    let column = req("columnName")?;
    let native = req("nativeType")?;
    let mode = req("mode")?;
    let scope = req("scope")?;
    let carrier = req("carrier")?;
    let mode = mode.to_utf8().map_err(|_| {
        err(
            "NULLABILITY_SQLSERVER_REQUEST",
            "Invalid mode",
            "/request/mode",
        )
    })?;
    let scope = scope.to_utf8().map_err(|_| {
        err(
            "NULLABILITY_SQLSERVER_REQUEST",
            "Invalid scope",
            "/request/scope",
        )
    })?;
    let carrier = carrier.to_utf8().map_err(|_| {
        err(
            "NULLABILITY_SQLSERVER_REQUEST",
            "Invalid carrier",
            "/request/carrier",
        )
    })?;
    let namespace = identifier(request_namespace, "/request/namespace")?;
    let table = identifier(table, "/request/tableName")?;
    let column = identifier(column, "/request/columnName")?;
    let native = native.to_utf8().map_err(|_| {
        err(
            "NULLABILITY_SQLSERVER_REQUEST",
            "Invalid native type",
            "/request/nativeType",
        )
    })?;
    let family = match native.as_str() {
        "bit" => "boolean",
        "tinyint" | "smallint" | "int" | "bigint" => "integer",
        "decimal(38,9)" => "decimal",
        "real" | "float(53)" => "float",
        "nvarchar(max)" => "string",
        "varbinary(max)" => "binary",
        "date" => "date",
        "time(7)" => "time",
        "datetime2(7)" | "datetimeoffset(7)" => "timestamp",
        _ => {
            return Err(err(
                "NULLABILITY_SQLSERVER_REQUEST",
                "Unknown SQL Server carrier",
                "/request/nativeType",
            ))
        }
    };
    let nullability = text(get(
        get(&author, "provenance").unwrap_or(&Value::Null),
        "nullability",
    ))
    .unwrap_or_else(|| "unspecified".into());
    let mut residuals = Vec::new();
    if let (Some(name), Some(requested)) =
        (raw(get(&element, "name")), raw(get(&request, "columnName")))
    {
        if name != requested {
            push_loss(
                &mut residuals,
                &format!("{path}/name"),
                &Value::String(name.clone()),
                "Explicit native column name differs from ideal name",
                "not-expressible",
                ctx,
            )?;
        }
    }
    for (key, value) in match source {
        Value::Object(m) => m.iter().collect::<Vec<_>>(),
        _ => Vec::new(),
    } {
        if !["umf", "id", "modules", "vocabularies"]
            .iter()
            .any(|known| key == &k(known))
        {
            push_loss_path(
                &mut residuals,
                pointer_child(&Utf16::default(), key),
                value,
                "Document metadata is retained but not projected",
                "unknown",
                ctx,
            )?;
        }
    }
    if let Some(vocabularies) = get(source, "vocabularies") {
        if matches!(vocabularies,Value::Object(m) if !m.is_empty()) {
            push_loss(
                &mut residuals,
                "/vocabularies",
                vocabularies,
                "Native vocabulary semantics are not projected",
                "unknown",
                ctx,
            )?;
        }
    }
    for (mi, module) in array(get(source, "modules")).iter().enumerate() {
        if mi != selected_module {
            push_loss(
                &mut residuals,
                &format!("/modules/{mi}"),
                module,
                "Other module is outside selected Field projection",
                "unknown",
                ctx,
            )?;
            continue;
        }
        if let Some(namespace_value) = raw(get(module, "namespace")) {
            if !namespace_value.is_empty() && namespace_value != request_namespace {
                push_loss(
                    &mut residuals,
                    &format!("/modules/{mi}/namespace"),
                    &Value::String(namespace_value.clone()),
                    "Native schema name differs from ideal namespace",
                    "not-expressible",
                    ctx,
                )?;
            }
        }
        for (key, value) in match module {
            Value::Object(m) => m.iter().collect::<Vec<_>>(),
            _ => Vec::new(),
        } {
            if !["id", "namespace", "elements"]
                .iter()
                .any(|known| key == &k(known))
            {
                push_loss_path(
                    &mut residuals,
                    pointer_child(&k(&format!("/modules/{mi}")), key),
                    value,
                    "Module metadata is not projected",
                    "unknown",
                    ctx,
                )?;
            }
        }
        for (ei, item) in array(get(module, "elements")).iter().enumerate() {
            if ei != selected_element {
                push_loss(
                    &mut residuals,
                    &format!("/modules/{mi}/elements/{ei}"),
                    item,
                    "Other element is outside selected Field projection",
                    "unknown",
                    ctx,
                )?;
            }
        }
    }
    for (key, value) in match &element {
        Value::Object(m) => m.iter().collect::<Vec<_>>(),
        _ => Vec::new(),
    } {
        let empty_extensions =
            key == &k("extensions") && matches!(value,Value::Object(m) if m.is_empty());
        if ![
            "id",
            "kind",
            "name",
            "description",
            "scalarType",
            "nullability",
        ]
        .iter()
        .any(|known| key == &k(known))
            && !empty_extensions
        {
            push_loss_path(
                &mut residuals,
                pointer_child(&k(&path), key),
                value,
                "Field metadata is retained but not projected",
                "unknown",
                ctx,
            )?;
        }
    }
    let nullability_path = format!("{path}/nullability");
    let mut basis = if nullability == "unspecified" {
        "no-authored-requirement"
    } else {
        "authored-requirement"
    };
    let mut encoding = "null";
    let mut clause = "NULL";
    if nullability != "unspecified" {
        if scope != "stored-relation" {
            push_loss(&mut residuals,&nullability_path,&s(&nullability),"Only stored-relation availability is implemented; query guarantees and input omission require other bindings","not-expressible",ctx)?;
            basis = "unprojected-requirement";
        } else if carrier != "sql-null" {
            push_loss(
                &mut residuals,
                &nullability_path,
                &s(&nullability),
                "Explicit SQL-NULL carrier required; no omitted-member equivalence is inferred",
                "unknown",
                ctx,
            )?;
            basis = "unprojected-requirement";
        } else if nullability == "required" {
            clause = "NOT NULL";
            encoding = "not-null";
        }
    }
    let mut sql = format!("CREATE TABLE {namespace}.{table} ({column} {native} {clause});\n");
    if let Some(description) = raw(get(&element, "description")) {
        if description.len() > 3750 {
            push_loss(
                &mut residuals,
                &format!("{path}/description"),
                &Value::String(description.clone()),
                "Description exceeds the bounded extended-property value size",
                "not-expressible",
                ctx,
            )?;
        } else {
            sql.push_str(&format!("EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value={}, @level0type=N'SCHEMA', @level0name={}, @level1type=N'TABLE', @level1name={}, @level2type=N'COLUMN', @level2name={};\n",literal(description)?,literal(req("namespace")?)?,literal(req("tableName")?)?,literal(req("columnName")?)?));
        }
    }
    if let Some(scalar) = raw(get(&element, "scalarType")) {
        if scalar != &k(family) {
            push_loss(
                &mut residuals,
                &format!("{path}/scalarType"),
                get(&element, "scalarType").unwrap(),
                "Explicit native type does not establish the stated scalar family",
                "not-expressible",
                ctx,
            )?;
        }
    }
    let has_unprojected = residuals
        .iter()
        .any(|x| text(get(x, "outcome")).as_deref() == Some("not-expressible"));
    let status = if mode == "strict" && !residuals.is_empty() {
        "blocked"
    } else {
        "projected"
    };
    let outcome = if has_unprojected {
        "not-expressible"
    } else if residuals.is_empty() {
        "exact"
    } else {
        "unknown"
    };
    let mut diagnostics = Vec::new();
    for residual in &residuals {
        diagnostics.push(obj(vec![
            ("code", s("NULLABILITY_MEANING_NOT_PROJECTED")),
            ("path", copy_json(get(residual, "path").unwrap(), ctx)?),
            ("message", copy_json(get(residual, "reason").unwrap(), ctx)?),
            (
                "severity",
                s(if status == "blocked" {
                    "error"
                } else {
                    "warning"
                }),
            ),
        ]));
    }
    let mut result = obj(vec![
        ("operation", s("project-nullability-sqlserver")),
        ("version", s("1.0.0")),
        ("status", s(status)),
        ("source", copy_json(source, ctx)?),
        ("author", author),
        ("request", request),
        (
            "binding",
            obj(vec![
                ("id", s(BINDING)),
                ("version", s("1.0.0")),
                ("nativeVersion", s("16.0.4295.3")),
                ("subset", s(BINDING_SUBSET)),
            ]),
        ),
        (
            "mapping",
            obj(vec![
                ("origin", s("authored")),
                ("nullability", s(&nullability)),
                ("encoding", s(encoding)),
                ("basis", s(basis)),
                ("scope", s(&scope)),
                ("carrier", s(&carrier)),
                ("idealPath", Value::String(k(&nullability_path))),
                ("nativePath", s("/sql")),
                ("outcome", s(outcome)),
            ]),
        ),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    if status == "projected" {
        set(
            &mut result,
            "target",
            obj(vec![
                ("format", s("sqlserver-ddl")),
                ("sql", Value::String(k(&sql))),
            ]),
        )?;
        set(&mut result, "nativeSql", Value::String(k(&sql)))?;
    }
    validate(&result, &result_schema, ctx, "NULLABILITY_SQLSERVER_RESULT")?;
    Ok(result)
}
fn set(value: &mut Value, name: &str, replacement: Value) -> Result<(), EngineError> {
    if let Value::Object(members) = value {
        if let Some((_, old)) = members.iter_mut().find(|(key, _)| key == &k(name)) {
            *old = replacement;
        } else {
            members.push((k(name), replacement));
        }
        Ok(())
    } else {
        Err(err("NULLABILITY_SQLSERVER_RESULT", "Expected object", ""))
    }
}
pub fn project_nullability_to_sqlserver(
    author: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    project_inner(author, request, ctx)
}
pub fn recover_nullability_from_sqlserver(
    receipt: &Value,
    native_text: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = copy_json(receipt, ctx)?;
    let (result_schema, _) = schemas(ctx)?;
    validate(
        &receipt,
        &result_schema,
        ctx,
        "NULLABILITY_SQLSERVER_RECEIPT",
    )?;
    if text(get(&receipt, "status")).as_deref() != Some("projected") {
        return Err(err(
            "NULLABILITY_SQLSERVER_RECEIPT",
            "Expected projected receipt",
            "/status",
        ));
    }
    let expected = project_inner(
        get(&receipt, "author").unwrap(),
        get(&receipt, "request").unwrap(),
        ctx,
    )?;
    if canonical(&receipt, ctx)? != canonical(&expected, ctx)? {
        return Err(err(
            "NULLABILITY_SQLSERVER_RECEIPT",
            "Receipt does not match retained source and binding",
            "",
        ));
    }
    let supplied = raw(Some(native_text)).ok_or_else(|| {
        err(
            "NULLABILITY_SQLSERVER_STALE",
            "Native SQL text is required",
            "",
        )
    })?;
    if supplied != raw(get(&receipt, "nativeSql")).unwrap_or(&Utf16::default())
        || supplied
            != raw(get(get(&receipt, "target").unwrap_or(&Value::Null), "sql"))
                .unwrap_or(&Utf16::default())
    {
        return Err(err(
            "NULLABILITY_SQLSERVER_STALE",
            "Native target changed; retained report cannot assert recovery",
            "",
        ));
    }
    copy_json(get(&receipt, "source").unwrap(), ctx)
}

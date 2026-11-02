//! Native-owned SQL Server availability classification for captured stored columns.
//! Unknown checks, generated behavior, and permission-limited evidence remain residuals.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    sqlserver_adapter as sqlserver,
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};

const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/sqlserver-nullability-classification.schema.json");
const EVIDENCE_SCHEMA: &str =
    include_str!("../../../spec/extensions/sqlserver-nullability/native.schema.json");
const RECOVERY: &str = "Retain the complete source and native archive; unknown native meaning is not replaced by the core label";
const BASIS: &str = "Captured declarations for stored relation values; not query results, omitted inputs or live enforcement verification";
const EXTENSION: &str = "umf.sqlserver.nullability";
const NATIVE_VERSION: &str = "16.0.4295.3";

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
        Some(Value::String(x)) => Some(x),
        _ => None,
    }
}
fn arr<'a>(v: &'a Value, k: &str) -> Option<&'a [Value]> {
    match get(v, k) {
        Some(Value::Array(x)) => Some(x),
        _ => None,
    }
}
fn err(code: &str, path: &str, message: impl Into<String>) -> EngineError {
    EngineError::new(code, u(path), message.into())
}
fn read_json(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}
fn set(v: &mut Value, k: &str, value: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("SQLSERVER_NULLABILITY_TARGET", "", "Expected object"));
    };
    if let Some((_, old)) = m.iter_mut().find(|(name, _)| name == &u(k)) {
        *old = value;
    } else {
        m.push((u(k), value));
    }
    Ok(())
}
fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canonical(v: &Value, ctx: &mut Context<'_>, depth: usize) -> Result<Value, EngineError> {
        if depth > ctx.limits().max_depth {
            return Err(err(
                "RESOURCE_LIMIT",
                "",
                "SQL Server nullability comparison depth exceeded",
            ));
        }
        match v {
            Value::Array(items) => {
                let mut out = Vec::with_capacity(items.len());
                for item in items {
                    ctx.charge_work(1, u(""))?;
                    out.push(canonical(item, ctx, depth + 1)?);
                }
                Ok(Value::Array(out))
            }
            Value::Object(fields) => {
                let mut out = Vec::with_capacity(fields.len());
                for (k, v) in fields {
                    ctx.charge_work(k.len().saturating_add(1), u(""))?;
                    out.push((k.clone(), canonical(v, ctx, depth + 1)?));
                }
                out.sort_by(|a, b| a.0.cmp(&b.0));
                Ok(Value::Object(out))
            }
            _ => copy_json(v, ctx),
        }
    }
    Ok(canonical(a, ctx, 0)? == canonical(b, ctx, 0)?)
}
fn tagged_kind(v: &Value) -> Option<&Utf16> {
    text(v, "kind")
}
fn tagged_text(v: &Value) -> Option<&Utf16> {
    (tagged_kind(v) == Some(&u("string")))
        .then(|| text(v, "value"))
        .flatten()
}
fn tagged_bool(v: &Value) -> Option<bool> {
    if tagged_kind(v) == Some(&u("boolean")) {
        match get(v, "value") {
            Some(Value::Bool(x)) => Some(*x),
            _ => None,
        }
    } else {
        None
    }
}
fn tagged_items(v: &Value) -> Option<&[Value]> {
    if tagged_kind(v) == Some(&u("array")) {
        arr(v, "items")
    } else {
        None
    }
}
fn tagged_members(v: &Value) -> Option<&Value> {
    if tagged_kind(v) == Some(&u("object")) {
        get(v, "members")
    } else {
        None
    }
}
fn has_only_members(
    v: &Value,
    allowed: &[&str],
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let Value::Object(fields) = v else {
        return Ok(false);
    };
    ctx.charge_work(fields.len(), u("/availabilityEvidence"))?;
    for (name, _) in fields {
        ctx.charge_work(name.len().saturating_add(1), u("/availabilityEvidence"))?;
        if !allowed.iter().any(|known| name == &u(known)) {
            return Ok(false);
        }
    }
    Ok(true)
}
fn unique_match<'a>(
    items: &'a [Value],
    keys: &[(&str, &Utf16)],
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    let mut found = None;
    for item in items {
        ctx.charge_work(1, u("/availabilityEvidence"))?;
        let Some(members) = tagged_members(item) else {
            return Ok(None);
        };
        let mut matches = true;
        for (key, wanted) in keys {
            ctx.charge_work(
                wanted.len().saturating_add(key.len()).max(1),
                u("/availabilityEvidence"),
            )?;
            if tagged_text(get(members, key).unwrap_or(&Value::Null)) != Some(*wanted) {
                matches = false;
                break;
            }
        }
        if matches {
            if found.is_some() {
                return Ok(None);
            }
            found = Some(members);
        }
    }
    Ok(found)
}
fn tagged_integer(v: &Value, ctx: &mut Context<'_>) -> Result<Option<i64>, EngineError> {
    let Some(Value::String(token)) = get(v, "value") else {
        return Ok(None);
    };
    if tagged_kind(v) != Some(&u("number")) {
        return Ok(None);
    }
    let token = match token.to_utf8() {
        Ok(x) => x,
        Err(_) => return Ok(None),
    };
    match crate::javascript_numeric::numeric_to_number_lossless(&token, true, ctx) {
        Ok(n) if n >= 0.0 && n <= i32::MAX as f64 => Ok(Some(n as i64)),
        Ok(_) => Ok(None),
        Err(e) if e.code == "JAVASCRIPT_NUMERIC" => Ok(None),
        Err(e) => Err(e),
    }
}
fn evidence_integer_fields(evidence: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    for (array_name, fields) in [
        ("alias_types", &["default_object_id", "rule_object_id"][..]),
        (
            "column_refinements",
            &["generated_always_type", "rule_object_id"][..],
        ),
    ] {
        let Some(items) = tagged_items(
            get(tagged_members(evidence).unwrap_or(&Value::Null), array_name)
                .unwrap_or(&Value::Null),
        ) else {
            return Ok(false);
        };
        for item in items {
            let Some(members) = tagged_members(item) else {
                return Ok(false);
            };
            for field in fields {
                if tagged_integer(get(members, field).unwrap_or(&Value::Null), ctx)?.is_none() {
                    return Ok(false);
                }
            }
        }
    }
    Ok(true)
}
fn untag(v: &Value, ctx: &mut Context<'_>, depth: usize) -> Result<Option<Value>, EngineError> {
    if depth > ctx.limits().max_depth {
        return Err(err(
            "RESOURCE_LIMIT",
            "",
            "Evidence nesting exceeds the depth limit",
        ));
    }
    ctx.charge_work(1, u("/availabilityEvidence"))?;
    match tagged_kind(v).and_then(|x| x.to_utf8().ok()).as_deref() {
        Some("null") => Ok(Some(Value::Null)),
        Some("boolean") => Ok(get(v, "value").and_then(|x| {
            if let Value::Bool(b) = x {
                Some(Value::Bool(*b))
            } else {
                None
            }
        })),
        Some("string") => Ok(get(v, "value").and_then(|x| {
            if let Value::String(s) = x {
                Some(Value::String(s.clone()))
            } else {
                None
            }
        })),
        Some("number") => {
            let Some(Value::String(token)) = get(v, "value") else {
                return Ok(None);
            };
            let token = match token.to_utf8() {
                Ok(x) => x,
                Err(_) => return Ok(None),
            };
            match crate::javascript_numeric::numeric_to_number_lossless(&token, false, ctx) {
                Ok(n) => Ok(Some(Value::Number(n))),
                Err(e) if e.code == "JAVASCRIPT_NUMERIC" => Ok(None),
                Err(e) => Err(e),
            }
        }
        Some("array") => {
            let Some(items) = arr(v, "items") else {
                return Ok(None);
            };
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                let Some(value) = untag(item, ctx, depth + 1)? else {
                    return Ok(None);
                };
                out.push(value);
            }
            Ok(Some(Value::Array(out)))
        }
        Some("object") => {
            let Some(Value::Object(fields)) = get(v, "members") else {
                return Ok(None);
            };
            let mut out = Vec::with_capacity(fields.len());
            for (k, item) in fields {
                ctx.charge_work(k.len().saturating_add(1), u("/availabilityEvidence"))?;
                let Some(value) = untag(item, ctx, depth + 1)? else {
                    return Ok(None);
                };
                out.push((k.clone(), value));
            }
            Ok(Some(Value::Object(out)))
        }
        _ => Ok(None),
    }
}
struct Runtime {
    result: CompiledSchema,
    request: CompiledSchema,
    evidence: CompiledSchema,
}
fn runtime(engine: &Engine, ctx: &mut Context<'_>) -> Result<Arc<Runtime>, EngineError> {
    static CACHE: OnceLock<Arc<Runtime>> = OnceLock::new();
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        if let Some(v) = CACHE.get() {
            return Ok(Arc::clone(v));
        }
    }
    ctx.charge_work(1, u(""))?;
    let mut resources = engine.schema_resources_with_context(ctx)?;
    resources.entries.push((
        u("urn:umf:core:nullability-operation:5.0.0"),
        read_json(
            include_str!("../../../spec/core/nullability-operation-v5.schema.json"),
            ctx,
        )?,
    ));
    resources.entries.push((
        u("urn:umf:native-json:0.1.0"),
        read_json(
            include_str!("../../../spec/core/native-json.schema.json"),
            ctx,
        )?,
    ));
    let schema = read_json(RESULT_SCHEMA, ctx)?;
    let result = CompiledSchema::compile(&schema, &resources, ctx)?;
    let request = CompiledSchema::compile(
        get(
            get(&schema, "properties").unwrap_or(&Value::Null),
            "request",
        )
        .ok_or_else(|| err("SCHEMA", "", "Nullability request schema missing"))?,
        &resources,
        ctx,
    )?;
    let evidence_value = read_json(EVIDENCE_SCHEMA, ctx)?;
    let evidence = CompiledSchema::compile(&evidence_value, &SchemaResources::default(), ctx)?;
    let ready = Arc::new(Runtime {
        result,
        request,
        evidence,
    });
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        return Ok(crate::resource_cache::publish_completed(&CACHE, ready));
    }
    Ok(ready)
}
fn validate(
    value: &Value,
    schema: &CompiledSchema,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    if schema.validate(value, ctx)?.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "",
            "Value does not match the pinned SQL Server nullability schema",
        ))
    }
}
fn matches_root_identity(
    items: &[Value],
    schema: &Utf16,
    table: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    for item in items {
        ctx.charge_work(1, u("/availabilityEvidence/triggers"))?;
        if tagged_members(item).is_some_and(|members| {
            tagged_text(get(members, "schema").unwrap_or(&Value::Null)) == Some(schema)
                && tagged_text(get(members, "table").unwrap_or(&Value::Null)) == Some(table)
        }) {
            return Ok(true);
        }
    }
    Ok(false)
}
fn loss(
    residuals: &mut Vec<Value>,
    diagnostics: &mut Vec<Value>,
    path: &Utf16,
    value: &Value,
    reason: &str,
    is_conflict: bool,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    residuals.push(obj(vec![
        ("path", Value::String(path.clone())),
        ("value", copy_json(value, ctx)?),
        ("reason", t(reason)),
        ("recovery", t(RECOVERY)),
    ]));
    diagnostics.push(obj(vec![
        (
            "code",
            t(if is_conflict {
                "SQLSERVER_NULLABILITY_CONFLICT"
            } else {
                "SQLSERVER_NULLABILITY_UNRESOLVED"
            }),
        ),
        ("path", Value::String(path.clone())),
        ("message", t(reason)),
        ("severity", t("warning")),
    ]));
    Ok(())
}

fn absence_reason(
    root_members: &Value,
    column_path: &Utf16,
    schema: &Utf16,
    table_name: &Utf16,
    column_name: &Utf16,
    native_members: &Value,
    evidence_schema: &CompiledSchema,
    ctx: &mut Context<'_>,
) -> Result<Option<String>, EngineError> {
    let evidence_tag = get(root_members, "availabilityEvidence").unwrap_or(&Value::Null);
    let evidence_value = untag(evidence_tag, ctx, 0)?;
    let evidence_valid = if let Some(value) = evidence_value.as_ref() {
        evidence_integer_fields(evidence_tag, ctx)?
            && evidence_schema.validate(value, ctx)?.is_empty()
    } else {
        false
    };
    let Some(evidence) = tagged_members(evidence_tag) else {
        return Ok(Some("Native availability supplement is missing, malformed or has unsupported integer tokens".into()));
    };
    if !evidence_valid {
        return Ok(Some("Native availability supplement is missing, malformed or has unsupported integer tokens".into()));
    }
    if tagged_bool(get(evidence, "database_view_definition").unwrap_or(&Value::Null)) != Some(true)
    {
        return Ok(Some(
            "Metadata visibility does not establish complete constraint observations".into(),
        ));
    }
    let tables = tagged_items(get(root_members, "tables").unwrap_or(&Value::Null));
    let table_index = column_path
        .to_utf8()
        .ok()
        .and_then(|path| path.split('/').nth(2)?.parse::<usize>().ok());
    let Some(table) = tables.and_then(|items| table_index.and_then(|index| items.get(index)))
    else {
        return Ok(Some("Native table unavailable".into()));
    };
    let Some(table_members) = tagged_members(table) else {
        return Ok(Some("Native table unavailable".into()));
    };
    let refinements =
        tagged_items(get(evidence, "column_refinements").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let Some(refinement) = unique_match(
        refinements,
        &[
            ("schema", schema),
            ("table", table_name),
            ("name", column_name),
        ],
        ctx,
    )?
    else {
        return Ok(Some(
            "Native column refinements are missing or ambiguous".into(),
        ));
    };
    if tagged_integer(
        get(refinement, "rule_object_id").unwrap_or(&Value::Null),
        ctx,
    )? != Some(0)
    {
        return Ok(Some(
            "Legacy bound column rules require additional availability evidence".into(),
        ));
    }
    if tagged_integer(
        get(refinement, "generated_always_type").unwrap_or(&Value::Null),
        ctx,
    )? != Some(0)
        || get(native_members, "is_identity").and_then(tagged_bool) != Some(false)
        || tagged_text(get(native_members, "base_type_name").unwrap_or(&Value::Null))
            == Some(&u("timestamp"))
    {
        return Ok(Some(
            "Generated/identity/rowversion availability requires its own interpretation".into(),
        ));
    }
    if !has_only_members(
        refinement,
        &[
            "schema",
            "table",
            "name",
            "is_sparse",
            "generated_always_type",
            "is_hidden",
            "rule_object_id",
        ],
        ctx,
    )? {
        return Ok(Some(
            "Unknown native column refinement prevents absence permission".into(),
        ));
    }
    let Some(checks) = tagged_items(get(table_members, "checks").unwrap_or(&Value::Null)) else {
        return Ok(Some(
            "Enabled or unresolved checks may forbid NULL; arbitrary expressions are not evaluated"
                .into(),
        ));
    };
    let mut bad_check = false;
    for check in checks {
        ctx.charge_work(1, u("/tables/checks"))?;
        if tagged_members(check).is_none_or(|members| {
            tagged_bool(get(members, "is_disabled").unwrap_or(&Value::Null)) != Some(true)
        }) {
            bad_check = true;
            break;
        }
    }
    if bad_check {
        return Ok(Some(
            "Enabled or unresolved checks may forbid NULL; arbitrary expressions are not evaluated"
                .into(),
        ));
    }
    let Some(foreign_keys) =
        tagged_items(get(table_members, "foreign_keys").unwrap_or(&Value::Null))
    else {
        return Ok(Some(
            "Foreign-key interactions require additional evidence".into(),
        ));
    };
    if !foreign_keys.is_empty() {
        return Ok(Some(
            "Foreign-key interactions require additional evidence".into(),
        ));
    }
    let Some(keys) = tagged_items(get(table_members, "keys").unwrap_or(&Value::Null)) else {
        return Ok(Some(
            "Unknown native key semantics remain unresolved".into(),
        ));
    };
    let mut unknown_key = false;
    for key in keys {
        ctx.charge_work(1, u("/tables/keys"))?;
        if tagged_members(key).is_none_or(|members| {
            tagged_text(get(members, "kind").unwrap_or(&Value::Null)) != Some(&u("UQ"))
        }) {
            unknown_key = true;
            break;
        }
    }
    if unknown_key {
        return Ok(Some(
            "Unknown native key semantics remain unresolved".into(),
        ));
    }
    if matches_root_identity(
        tagged_items(get(evidence, "triggers").unwrap_or(&Value::Null)).unwrap_or(&[]),
        schema,
        table_name,
        ctx,
    )? {
        return Ok(Some(
            "Native trigger behavior remains unresolved, including disabled triggers".into(),
        ));
    }
    let Some(columns) = tagged_items(get(table_members, "columns").unwrap_or(&Value::Null)) else {
        return Ok(Some("Other computed columns may constrain NULL inputs; arbitrary expressions are not evaluated".into()));
    };
    let mut computed_or_unresolved = false;
    for column in columns {
        ctx.charge_work(1, u("/tables/columns"))?;
        if tagged_members(column)
            .is_none_or(|members| get(members, "is_computed").and_then(tagged_bool) != Some(false))
        {
            computed_or_unresolved = true;
            break;
        }
    }
    if computed_or_unresolved {
        return Ok(Some("Other computed columns may constrain NULL inputs; arbitrary expressions are not evaluated".into()));
    }
    if get(native_members, "is_user_defined").and_then(tagged_bool) == Some(true) {
        let type_schema = tagged_text(get(native_members, "type_schema").unwrap_or(&Value::Null));
        let type_name = tagged_text(get(native_members, "type_name").unwrap_or(&Value::Null));
        let aliases =
            tagged_items(get(evidence, "alias_types").unwrap_or(&Value::Null)).unwrap_or(&[]);
        let alias = if let Some((schema, name)) = type_schema.zip(type_name) {
            unique_match(aliases, &[("schema", schema), ("name", name)], ctx)?
        } else {
            None
        };
        if alias.is_none()
            || tagged_integer(
                get(alias.unwrap(), "rule_object_id").unwrap_or(&Value::Null),
                ctx,
            )? != Some(0)
        {
            return Ok(Some(
                "Alias rules or unresolved type metadata may constrain NULL".into(),
            ));
        }
    }
    if !has_only_members(
        native_members,
        &[
            "name",
            "column_id",
            "system_type_id",
            "user_type_id",
            "type_schema",
            "type_name",
            "base_type_name",
            "is_user_defined",
            "is_assembly_type",
            "max_length",
            "precision",
            "scale",
            "is_nullable",
            "is_identity",
            "is_computed",
            "collation_name",
            "default_definition",
            "computed_definition",
            "identity_seed",
            "identity_increment",
            "description",
        ],
        ctx,
    )? {
        return Ok(Some(
            "Unknown native column metadata prevents absence permission".into(),
        ));
    }
    Ok(None)
}

pub fn classify(
    input: &Value,
    request_input: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(
        request_input,
        &rt.request,
        ctx,
        "SQLSERVER_NULLABILITY_REQUEST",
    )?;
    let source = copy_json(input, ctx)?;
    let request = copy_json(request_input, ctx)?;
    let valid = engine.validate_document(&source, registry, caps, ctx)?;
    if !valid.valid || text(&source, "umf") != Some(&u("0.10.0")) {
        return Err(err(
            "SQLSERVER_NULLABILITY_SOURCE",
            "",
            "Valid core 0.10.0 source required; migrate explicitly",
        ));
    }
    let archive = sqlserver::export_document(&source, ctx)?;
    let native_source = text(&request, "nativeSource").ok_or_else(|| {
        err(
            "SQLSERVER_NULLABILITY_REQUEST",
            "/nativeSource",
            "Native source required",
        )
    })?;
    let catalog = sqlserver::SqlServerCatalog::import(native_source, ctx)?;
    if catalog.export(ctx)? != archive {
        return Err(err(
            "SQLSERVER_NULLABILITY_ARCHIVE",
            "/nativeSource",
            "Native text differs from retained capture",
        ));
    }
    let payload = get(
        get(&source, "extensions").unwrap_or(&Value::Null),
        "umf.sqlserver",
    )
    .ok_or_else(|| {
        err(
            "SQLSERVER_NULLABILITY_CAPTURE",
            "/extensions/umf.sqlserver",
            "SQL Server payload required",
        )
    })?;
    let root = get(payload, "root").ok_or_else(|| {
        err(
            "SQLSERVER_NULLABILITY_CAPTURE",
            "/root",
            "Native capture root required",
        )
    })?;
    let root_members = tagged_members(root).ok_or_else(|| {
        err(
            "SQLSERVER_NULLABILITY_CAPTURE",
            "/root/members",
            "Native root object required",
        )
    })?;
    if tagged_text(get(root_members, "serverVersion").unwrap_or(&Value::Null))
        != Some(&u(NATIVE_VERSION))
    {
        return Err(err(
            "SQLSERVER_NULLABILITY_VERSION",
            "/serverVersion",
            "This binding requires SQL Server 16.0.4295.3",
        ));
    }
    if tagged_text(get(root_members, "profile").unwrap_or(&Value::Null))
        != Some(&u("sqlserver-catalog-v3"))
        || tagged_text(get(root_members, "state").unwrap_or(&Value::Null)) != Some(&u("captured"))
    {
        return Err(err(
            "SQLSERVER_NULLABILITY_PROFILE",
            "/profile",
            "Captured catalog-v3 required; modified metadata needs recapture",
        ));
    }
    let column_path = text(&request, "column").ok_or_else(|| {
        err(
            "SQLSERVER_NULLABILITY_REQUEST",
            "/column",
            "Column path required",
        )
    })?;
    let columns = sqlserver::column_metadata_value(&catalog, ctx)?;
    let column_values = match &columns {
        Value::Array(items) => items,
        _ => {
            return Err(err(
                "SQLSERVER_NULLABILITY_METADATA",
                "",
                "Column metadata array required",
            ))
        }
    };
    let column = column_values
        .iter()
        .find(|row| text(row, "path") == Some(column_path))
        .cloned()
        .ok_or_else(|| {
            err(
                "SQLSERVER_NULLABILITY_COLUMN",
                "/column",
                "Native column not found",
            )
        })?;
    let native_fragment = get(&column, "nativeColumn").ok_or_else(|| {
        err(
            "SQLSERVER_NULLABILITY_COLUMN",
            "",
            "Native column fragment missing",
        )
    })?;
    let native_members = tagged_members(native_fragment).ok_or_else(|| {
        err(
            "SQLSERVER_NULLABILITY_COLUMN",
            "",
            "Expected native column object",
        )
    })?;
    let table_info = get(&column, "table").unwrap_or(&Value::Null);
    let schema = text(table_info, "schema")
        .ok_or_else(|| err("SQLSERVER_NULLABILITY_COLUMN", "", "Column schema missing"))?;
    let table_name = text(table_info, "name")
        .ok_or_else(|| err("SQLSERVER_NULLABILITY_COLUMN", "", "Column table missing"))?;
    let col_element = get(&column, "element").unwrap_or(&Value::Null);
    let column_name = text(col_element, "name")
        .ok_or_else(|| err("SQLSERVER_NULLABILITY_COLUMN", "", "Column name missing"))?;
    let modules = arr(&source, "modules").ok_or_else(|| {
        err(
            "SQLSERVER_NULLABILITY_SOURCE",
            "/modules",
            "Modules required",
        )
    })?;
    let mi = modules
        .iter()
        .position(|module| text(module, "id") == Some(&u("sqlserver.columns")))
        .ok_or_else(|| {
            err(
                "SQLSERVER_NULLABILITY_COLUMN",
                "/modules",
                "Derived column module is required",
            )
        })?;
    let elements = arr(&modules[mi], "elements").ok_or_else(|| {
        err(
            "SQLSERVER_NULLABILITY_COLUMN",
            "/modules/elements",
            "Elements required",
        )
    })?;
    let element_id = text(col_element, "id").ok_or_else(|| {
        err(
            "SQLSERVER_NULLABILITY_COLUMN",
            "",
            "Column identity missing",
        )
    })?;
    let ei = elements
        .iter()
        .position(|element| text(element, "id") == Some(element_id))
        .ok_or_else(|| {
            err(
                "SQLSERVER_NULLABILITY_COLUMN",
                "/modules/elements",
                "Derived column element required",
            )
        })?;
    let element = &elements[ei];
    let ideal = Utf16::from(format!("/modules/{mi}/elements/{ei}/nullability"));
    let native_path = Utf16::from(format!(
        "{}/is_nullable",
        column_path.to_utf8().unwrap_or_default()
    ));
    let scope = text(&request, "scope")
        .ok_or_else(|| err("SQLSERVER_NULLABILITY_REQUEST", "/scope", "Scope required"))?;
    let carrier = text(&request, "carrier").ok_or_else(|| {
        err(
            "SQLSERVER_NULLABILITY_REQUEST",
            "/carrier",
            "Carrier required",
        )
    })?;
    let mode = text(&request, "mode")
        .ok_or_else(|| err("SQLSERVER_NULLABILITY_REQUEST", "/mode", "Mode required"))?;
    let nullable = get(native_members, "is_nullable").and_then(tagged_bool);
    let mut nullability = "unspecified";
    let mut interpretation = "unknown";
    let mut outcome = "unknown";
    let mut residuals = Vec::new();
    let mut diagnostics = Vec::new();
    let mut reason: Option<String> = None;
    if scope != &u("stored-relation") {
        reason =
            Some("Stored-relation scope required; query results and omitted inputs differ".into());
    } else if carrier != &u("sql-null") {
        reason = Some("Explicit SQL-NULL absence carrier required".into());
    } else if nullable.is_none() {
        reason = Some("Column nullable metadata is not an exact native boolean".into());
    } else if get(native_members, "is_computed").and_then(tagged_bool) != Some(false) {
        reason=Some("Computed availability metadata is not treated as an explicit stored-column declaration".into());
    } else if get(native_members, "is_assembly_type").and_then(tagged_bool) != Some(false) {
        reason = Some("Assembly type availability semantics require additional evidence".into());
    } else if nullable == Some(true) {
        reason = absence_reason(
            root_members,
            column_path,
            schema,
            table_name,
            column_name,
            native_members,
            &rt.evidence,
            ctx,
        )?;
    }
    if let Some(reason) = reason.as_deref() {
        loss(
            &mut residuals,
            &mut diagnostics,
            &native_path,
            native_fragment,
            reason,
            false,
            ctx,
        )?;
    } else {
        nullability = if nullable == Some(true) {
            "absent-allowed"
        } else {
            "required"
        };
        interpretation = "declared";
        outcome = "exact";
    }
    let mut conflict: Option<String> = None;
    if text(element, "kind") != Some(&u("field")) {
        conflict=Some("Selected native member must already be an explicit Field; this operation does not replace its kind".into());
    }
    if let Some(author) = get(&request, "author") {
        match crate::nullability::verify_core_nullability_declaration(
            author, &source, engine, registry, caps, ctx,
        ) {
            Ok(verified) => {
                let identity = get(&verified, "identity").unwrap_or(&Value::Null);
                let provenance = get(&verified, "provenance").unwrap_or(&Value::Null);
                if text(identity, "module") != Some(&u("sqlserver.columns"))
                    || text(identity, "element") != Some(element_id)
                {
                    conflict = Some("Author receipt identifies a different member".into());
                } else if text(provenance, "nullability") != Some(&u(nullability)) {
                    conflict=Some("Authored availability differs from the native observation; neither assertion may be overwritten".into());
                }
            }
            Err(error) if error.is_control_failure() || error.code == "LIMIT" => return Err(error),
            Err(error) => {
                conflict = Some(format!(
                    "Author provenance is invalid or stale: {}",
                    error.code
                ))
            }
        }
    } else if get(element, "nullability").is_some() {
        conflict=Some("Existing availability requires verified author provenance before native classification".into());
    }
    let element_extensions = get(element, "extensions").unwrap_or(&Value::Null);
    if get(element_extensions, EXTENSION).is_some() {
        conflict = Some(
            "Existing binding scope cannot be overwritten; reclassify from its retained source"
                .into(),
        );
    }
    if get(
        get(&source, "vocabularies").unwrap_or(&Value::Null),
        EXTENSION,
    )
    .is_some_and(|v| text(v, "version") != Some(&u("1.0.0")))
    {
        conflict = Some("Existing binding vocabulary version is incompatible".into());
    }
    if let Some(conflict) = conflict.as_deref() {
        loss(
            &mut residuals,
            &mut diagnostics,
            &ideal,
            get(element, "nullability").unwrap_or(&Value::Null),
            conflict,
            true,
            ctx,
        )?;
        outcome = "unknown";
    }
    let blocked = conflict.is_some() || mode == &u("strict") && !residuals.is_empty();
    for diagnostic in &mut diagnostics {
        set(
            diagnostic,
            "severity",
            t(if blocked { "error" } else { "warning" }),
        )?;
    }
    finish(
        source,
        request,
        mi,
        ei,
        ideal,
        native_path,
        native_fragment,
        nullability,
        interpretation,
        outcome,
        residuals,
        diagnostics,
        engine,
        registry,
        caps,
        ctx,
        &rt,
    )
}
#[allow(clippy::too_many_arguments)]
fn finish(
    source: Value,
    request: Value,
    mi: usize,
    ei: usize,
    ideal: Utf16,
    native_path: Utf16,
    native_fragment: &Value,
    nullability: &str,
    interpretation: &str,
    outcome: &str,
    residuals: Vec<Value>,
    diagnostics: Vec<Value>,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    rt: &Runtime,
) -> Result<Value, EngineError> {
    let scope = text(&request, "scope")
        .cloned()
        .unwrap_or_else(|| u("unresolved"));
    let carrier = text(&request, "carrier")
        .cloned()
        .unwrap_or_else(|| u("unresolved"));
    ctx.charge_work(scope.len().saturating_add(1), u("/scope"))?;
    ctx.charge_work(carrier.len().saturating_add(1), u("/carrier"))?;
    let blocked = diagnostics
        .iter()
        .any(|d| get(d, "severity") == Some(&t("error")));
    let mapping = obj(vec![
        ("origin", t("classified")),
        ("idealPath", Value::String(ideal.clone())),
        ("nativePath", Value::String(native_path.clone())),
        ("nativeFragment", copy_json(native_fragment, ctx)?),
        ("nullability", t(nullability)),
        ("interpretation", t(interpretation)),
        ("outcome", t(outcome)),
        ("scope", Value::String(scope)),
        ("carrier", Value::String(carrier)),
        ("basis", t(BASIS)),
    ]);
    let mut result=obj(vec![("operation",t("classify-sqlserver-nullability")),("version",t("1.0.0")),("status",t(if blocked{"blocked"}else{"classified"})),("source",copy_json(&source,ctx)?),("request",copy_json(&request,ctx)?),("binding",obj(vec![("id",t(EXTENSION)),("version",t("1.0.0")),("nativeVersion",t(NATIVE_VERSION)),("subset",t("Captured SQL Server 16.0.4295.3 stored-column declarations under SQL-NULL absence policy; no query, omission or native equivalence"))])),("mapping",mapping),("residuals",Value::Array(residuals)),("diagnostics",Value::Array(diagnostics))]);
    if !blocked {
        let mut target = copy_json(&source, ctx)?;
        let vocab = get_mut(&mut target, "vocabularies").ok_or_else(|| {
            err(
                "SQLSERVER_NULLABILITY_TARGET",
                "/vocabularies",
                "Vocabularies required",
            )
        })?;
        if get(vocab, EXTENSION).is_none() {
            set(vocab, EXTENSION, obj(vec![("version", t("1.0.0"))]))?;
        }
        let selected = get_mut(&mut target, "modules")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    a.get_mut(mi)
                } else {
                    None
                }
            })
            .and_then(|m| get_mut(m, "elements"))
            .and_then(|v| {
                if let Value::Array(a) = v {
                    a.get_mut(ei)
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                err(
                    "SQLSERVER_NULLABILITY_TARGET",
                    "/modules",
                    "Selected member disappeared",
                )
            })?;
        set(selected, "nullability", t(nullability))?;
        let selected_extensions = get_mut(selected, "extensions").ok_or_else(|| {
            err(
                "SQLSERVER_NULLABILITY_TARGET",
                "/extensions",
                "Element extensions required",
            )
        })?;
        set(
            selected_extensions,
            EXTENSION,
            obj(vec![
                ("origin", t("classified")),
                (
                    "binding",
                    obj(vec![("id", t(EXTENSION)), ("version", t("1.0.0"))]),
                ),
                (
                    "scope",
                    copy_json(get(&request, "scope").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    "carrier",
                    copy_json(get(&request, "carrier").unwrap_or(&Value::Null), ctx)?,
                ),
                ("interpretation", t(interpretation)),
                ("nativePath", Value::String(native_path)),
            ]),
        )?;
        let target_report = engine.validate_document(&target, registry, caps, ctx)?;
        if !target_report.valid {
            return Err(err(
                "SQLSERVER_NULLABILITY_TARGET",
                "",
                "Logical nullability target violates current core constraints",
            ));
        }
        sqlserver::export_document(&target, ctx)?;
        set(&mut result, "target", target)?;
    }
    validate(&result, &rt.result, ctx, "SQLSERVER_NULLABILITY_RESULT")?;
    Ok(result)
}
pub fn verify(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(receipt, &rt.result, ctx, "SQLSERVER_NULLABILITY_RECEIPT")?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(err(
            "SQLSERVER_NULLABILITY_RECEIPT",
            "/status",
            "Expected complete classified receipt",
        ));
    }
    let expected = classify(
        get(receipt, "source").ok_or_else(|| {
            err(
                "SQLSERVER_NULLABILITY_RECEIPT",
                "/source",
                "Source required",
            )
        })?,
        get(receipt, "request").ok_or_else(|| {
            err(
                "SQLSERVER_NULLABILITY_RECEIPT",
                "/request",
                "Request required",
            )
        })?,
        engine,
        registry,
        caps,
        ctx,
    )?;
    if !equal(receipt, &expected, ctx)? {
        return Err(err(
            "SQLSERVER_NULLABILITY_RECEIPT",
            "",
            "Receipt disagrees with retained source and selected binding",
        ));
    }
    let target = get(receipt, "target").ok_or_else(|| {
        err(
            "SQLSERVER_NULLABILITY_RECEIPT",
            "/target",
            "Target required",
        )
    })?;
    if !equal(current, target, ctx)? {
        return Err(err(
            "SQLSERVER_NULLABILITY_STALE",
            "",
            "Target changed after classification",
        ));
    }
    copy_json(receipt, ctx)
}
pub fn recover(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let checked = verify(receipt, current, engine, registry, caps, ctx)?;
    text(
        get(&checked, "request").ok_or_else(|| {
            err(
                "SQLSERVER_NULLABILITY_RECEIPT",
                "/request",
                "Request required",
            )
        })?,
        "nativeSource",
    )
    .cloned()
    .ok_or_else(|| {
        err(
            "SQLSERVER_NULLABILITY_RECEIPT",
            "/request/nativeSource",
            "Native source required",
        )
    })
}

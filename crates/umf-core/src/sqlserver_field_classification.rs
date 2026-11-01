// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native-owned classification of a captured SQL Server catalog column as a
//! core Field. The catalog is the authority for membership; all source and
//! authored UMF content remains in the receipt.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    sqlserver_adapter as sqlserver,
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};

const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/sqlserver-field-classification.schema.json");
const KIND_SCHEMA: &str = include_str!("../../../spec/core/kind-operation-v6.schema.json");
const RECOVERY: &str = "Original assertion and native fragment retained in source; reclassify with corrected provenance";
const NATIVE_VERSION: &str = "16.0.4295.3";
const SUBSET: &str =
    "Captured catalog column membership; excludes raw DDL and native constraint/value equivalence";

fn u(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(k, v)| (u(k), v)).collect())
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
fn err(code: &str, path: &str, message: &str) -> EngineError {
    EngineError::new(code, u(path), message)
}
fn read_json(s: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&s.encode_utf16().collect::<Vec<_>>(), Format::Json, ctx)
}
fn set(v: &mut Value, k: &str, n: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("SQLSERVER_FIELD_TARGET", "", "Expected object"));
    };
    if let Some((_, old)) = m.iter_mut().find(|(x, _)| x == &u(k)) {
        *old = n
    } else {
        m.push((u(k), n));
    }
    Ok(())
}
fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canon(v: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
        match v {
            Value::Array(a) => {
                let mut out = Vec::with_capacity(a.len());
                for x in a {
                    c.charge_work(1, u(""))?;
                    out.push(canon(x, c)?);
                }
                Ok(Value::Array(out))
            }
            Value::Object(m) => {
                let mut out = Vec::with_capacity(m.len());
                for (k, v) in m {
                    c.charge_work(k.len().saturating_add(1), u(""))?;
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
struct Runtime {
    result: CompiledSchema,
    request: CompiledSchema,
}
fn runtime(engine: &Engine, ctx: &mut Context<'_>) -> Result<Arc<Runtime>, EngineError> {
    static CACHE: OnceLock<Arc<Runtime>> = OnceLock::new();
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        if let Some(r) = CACHE.get() {
            return Ok(Arc::clone(r));
        }
    }
    ctx.charge_work(1, u(""))?;
    let mut resources = engine.schema_resources_with_context(ctx)?;
    resources.entries.push((
        u("urn:umf:core:kind-operation:6.0.0"),
        read_json(KIND_SCHEMA, ctx)?,
    ));
    let schema = read_json(RESULT_SCHEMA, ctx)?;
    let result = CompiledSchema::compile(&schema, &resources, ctx)?;
    let req = get(
        get(&schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| err("SCHEMA", "", "request schema missing"))?;
    let request = CompiledSchema::compile(req, &resources, ctx)?;
    let ready = Arc::new(Runtime { result, request });
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        let _ = CACHE.set(Arc::clone(&ready));
    }
    Ok(ready)
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
            "Value does not match the pinned SQL Server Field classification schema",
        ))
    }
}
fn tagged_node_text<'a>(v: &'a Value) -> Option<&'a Utf16> {
    if text(v, "kind") == Some(&u("string")) {
        text(v, "value")
    } else {
        None
    }
}

pub fn classify(
    input: &Value,
    request: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(request, &rt.request, ctx, "SQLSERVER_FIELD_REQUEST")?;
    let source = copy_json(input, ctx)?;
    let request = copy_json(request, ctx)?;
    let valid = engine.validate_document(&source, registry, caps, ctx)?;
    if !valid.valid || text(&source, "umf") != Some(&u("0.10.0")) {
        return Err(err(
            "SQLSERVER_FIELD_VERSION",
            "",
            "Valid current 0.10.0 envelope required",
        ));
    }
    let archive = sqlserver::export_document(&source, ctx)?;
    let native_source = text(&request, "nativeSource").ok_or_else(|| {
        err(
            "SQLSERVER_FIELD_REQUEST",
            "/nativeSource",
            "Native source required",
        )
    })?;
    let native_catalog = sqlserver::SqlServerCatalog::import(native_source, ctx)?;
    let canonical_native = native_catalog.export(ctx)?;
    if canonical_native != archive {
        return Err(err(
            "SQLSERVER_FIELD_ARCHIVE",
            "/nativeSource",
            "Native archive differs from captured tree",
        ));
    }
    let payload = get(
        get(&source, "extensions").ok_or_else(|| {
            err(
                "SQLSERVER_FIELD_CAPTURE",
                "/extensions",
                "Extensions required",
            )
        })?,
        "umf.sqlserver",
    )
    .ok_or_else(|| {
        err(
            "SQLSERVER_FIELD_CAPTURE",
            "/extensions/umf.sqlserver",
            "SQL Server capture required",
        )
    })?;
    let root = get(payload, "root").ok_or_else(|| {
        err(
            "SQLSERVER_FIELD_CAPTURE",
            "/extensions/umf.sqlserver/root",
            "Native capture root required",
        )
    })?;
    let root_members = get(root, "members").ok_or_else(|| {
        err(
            "SQLSERVER_FIELD_CAPTURE",
            "/root/members",
            "Native object members required",
        )
    })?;
    let server_version = get(root_members, "serverVersion").and_then(tagged_node_text);
    if server_version != Some(&u(NATIVE_VERSION)) {
        return Err(err(
            "SQLSERVER_FIELD_SERVER",
            "/serverVersion",
            "This binding requires SQL Server 16.0.4295.3",
        ));
    }
    let column = text(&request, "column")
        .ok_or_else(|| err("SQLSERVER_FIELD_REQUEST", "/column", "Column path required"))?;
    let metadata = sqlserver::catalog_from_document(&source, ctx)?;
    let rows = sqlserver::column_metadata_value(&metadata, ctx)?;
    let row_values = match &rows {
        Value::Array(a) => a,
        _ => {
            return Err(err(
                "SQLSERVER_FIELD_METADATA",
                "",
                "Column metadata array required",
            ))
        }
    };
    let field = row_values
        .iter()
        .find(|x| text(x, "path") == Some(column))
        .ok_or_else(|| {
            err(
                "SQLSERVER_FIELD_COLUMN",
                "/column",
                "Captured column path not found",
            )
        })?;
    let element = get(field, "element")
        .ok_or_else(|| err("SQLSERVER_FIELD_METADATA", "", "Column identity missing"))?;
    let element_id = text(element, "id")
        .ok_or_else(|| err("SQLSERVER_FIELD_METADATA", "", "Column element id missing"))?;
    let modules = array(&source, "modules")
        .ok_or_else(|| err("SQLSERVER_FIELD_METADATA", "/modules", "Modules required"))?;
    let mi = modules
        .iter()
        .position(|m| text(m, "id") == Some(&u("sqlserver.columns")))
        .ok_or_else(|| {
            err(
                "SQLSERVER_FIELD_METADATA",
                "/modules",
                "Derived column module required",
            )
        })?;
    let elements = array(&modules[mi], "elements")
        .ok_or_else(|| err("SQLSERVER_FIELD_METADATA", "/elements", "Elements required"))?;
    let ei = elements
        .iter()
        .position(|e| text(e, "id") == Some(element_id))
        .ok_or_else(|| {
            err(
                "SQLSERVER_FIELD_METADATA",
                "/elements",
                "Derived column element required",
            )
        })?;
    let element = &elements[ei];
    let ideal = u(&format!("/modules/{mi}/elements/{ei}/kind"));
    let binding = obj(vec![
        ("id", t("umf.sqlserver.catalog.field")),
        ("version", t("1.0.0")),
        ("nativeVersion", t(NATIVE_VERSION)),
        ("subset", t(SUBSET)),
    ]);
    let mut result = obj(vec![
        ("operation", t("classify-sqlserver-field")),
        ("version", t("1.0.0")),
        ("status", t("classified")),
        ("source", copy_json(&source, ctx)?),
        ("request", copy_json(&request, ctx)?),
        ("binding", binding),
        (
            "mapping",
            obj(vec![
                ("origin", t("classified")),
                ("kind", t("field")),
                ("idealPath", Value::String(ideal.clone())),
                ("nativePath", copy_json(get(field, "path").unwrap(), ctx)?),
                (
                    "nativeFragment",
                    copy_json(get(field, "nativeColumn").unwrap(), ctx)?,
                ),
                ("basis", t("checked-catalog-column-membership")),
                ("outcome", t("exact")),
            ]),
        ),
        ("residuals", Value::Array(vec![])),
        ("diagnostics", Value::Array(vec![])),
    ]);
    let mut reason = None;
    if let Some(author) = get(&request, "author") {
        match crate::core_kind::verify_core_kind_declaration(
            author, &source, engine, registry, caps, ctx,
        ) {
            Ok(v) => {
                let ident = get(&v, "identity").unwrap_or(&Value::Null);
                let prov = get(&v, "provenance").unwrap_or(&Value::Null);
                if text(ident, "module") != Some(&u("sqlserver.columns"))
                    || text(ident, "element") != Some(element_id)
                    || text(prov, "kind") != Some(&u("field"))
                {
                    reason = Some("Author receipt does not assert this Field role".to_owned());
                }
            }
            Err(e) if e.is_control_failure() || e.code == "LIMIT" => return Err(e),
            Err(e) => reason = Some(format!("Author provenance is invalid or stale: {}", e.code)),
        }
    } else if get(element, "kind").is_some() {
        reason=Some("Existing kind requires verified author provenance; native-only observation cannot replace it".to_owned());
    }
    if let Some(reason) = reason {
        set(&mut result, "status", t("blocked"))?;
        if let Some(mapping) = get_mut(&mut result, "mapping") {
            set(mapping, "outcome", t("unknown"))?;
        }
        let value = get(element, "kind")
            .map(|v| copy_json(v, ctx))
            .transpose()?
            .unwrap_or(Value::Null);
        set(
            &mut result,
            "residuals",
            Value::Array(vec![obj(vec![
                ("path", Value::String(ideal.clone())),
                ("value", value),
                ("reason", t(&reason)),
                ("recovery", t(RECOVERY)),
            ])]),
        )?;
        set(
            &mut result,
            "diagnostics",
            Value::Array(vec![obj(vec![
                ("code", t("SQLSERVER_FIELD_CONFLICT")),
                ("path", Value::String(ideal)),
                ("message", t(&reason)),
                ("severity", t("error")),
            ])]),
        )?;
    } else {
        let mut target = copy_json(&source, ctx)?;
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
                    "SQLSERVER_FIELD_TARGET",
                    "/modules",
                    "Selected column disappeared",
                )
            })?;
        set(selected, "kind", t("field"))?;
        set(&mut result, "target", target)?;
    }
    validate(&result, &rt.result, ctx, "SQLSERVER_FIELD_RESULT")?;
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
    validate(receipt, &rt.result, ctx, "SQLSERVER_FIELD_RECEIPT")?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(err(
            "SQLSERVER_FIELD_RECEIPT",
            "/status",
            "Expected complete classified receipt",
        ));
    }
    let expected = classify(
        get(receipt, "source")
            .ok_or_else(|| err("SQLSERVER_FIELD_RECEIPT", "/source", "Source required"))?,
        get(receipt, "request")
            .ok_or_else(|| err("SQLSERVER_FIELD_RECEIPT", "/request", "Request required"))?,
        engine,
        registry,
        caps,
        ctx,
    )?;
    if !equal(receipt, &expected, ctx)? {
        return Err(err(
            "SQLSERVER_FIELD_RECEIPT",
            "",
            "Classification disagrees with native source",
        ));
    }
    let target = get(receipt, "target")
        .ok_or_else(|| err("SQLSERVER_FIELD_RECEIPT", "/target", "Target required"))?;
    if !equal(current, target, ctx)? {
        return Err(err(
            "SQLSERVER_FIELD_STALE",
            "",
            "Current model changed; recompute classification",
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
        get(&checked, "request")
            .ok_or_else(|| err("SQLSERVER_FIELD_RECEIPT", "/request", "Request required"))?,
        "nativeSource",
    )
    .cloned()
    .ok_or_else(|| {
        err(
            "SQLSERVER_FIELD_RECEIPT",
            "/request/nativeSource",
            "Native source required",
        )
    })
}

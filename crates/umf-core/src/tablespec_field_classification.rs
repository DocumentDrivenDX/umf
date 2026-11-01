// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native-owned classification of a checked TableSpec column member as a core Field.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    tablespec_adapter::TableSpecRuntime,
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};

const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/tablespec-field-classification.schema.json");
const KIND_SCHEMA: &str = include_str!("../../../spec/core/kind-operation-v6.schema.json");
const RECOVERY: &str = "Original assertion and native fragment retained in source; reclassify with corrected provenance";
const NATIVE_VERSION: &str = "647e8e566ad78b864282ec65c0b0b2237aa63084";
const SUBSET: &str =
    "Table version 1.0 captured column member role; no scalar/container/native validation claim";

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
fn remove(v: &mut Value, k: &str) {
    if let Value::Object(m) = v {
        m.retain(|(name, _)| name != &u(k));
    }
}
fn has(v: &Value, k: &str) -> bool {
    matches!(v, Value::Object(m) if m.iter().any(|(name, _)| name == &u(k)))
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
fn err(code: &str, path: &str, message: impl Into<String>) -> EngineError {
    EngineError::new(code, u(path), message.into())
}
fn read_json(s: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&s.encode_utf16().collect::<Vec<_>>(), Format::Json, ctx)
}
fn set(v: &mut Value, k: &str, n: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("FIELD_CLASSIFICATION_TARGET", "", "Expected object"));
    };
    if let Some((_, old)) = m.iter_mut().find(|(x, _)| x == &u(k)) {
        *old = n;
    } else {
        m.push((u(k), n));
    }
    Ok(())
}
fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canon(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        match v {
            Value::Array(a) => {
                let mut out = Vec::with_capacity(a.len());
                for item in a {
                    ctx.charge_work(1, u(""))?;
                    out.push(canon(item, ctx)?);
                }
                Ok(Value::Array(out))
            }
            Value::Object(m) => {
                let mut out = Vec::with_capacity(m.len());
                for (k, v) in m {
                    ctx.charge_work(k.len().saturating_add(1), u(""))?;
                    out.push((k.clone(), canon(v, ctx)?));
                }
                out.sort_by(|a, b| a.0.cmp(&b.0));
                Ok(Value::Object(out))
            }
            _ => copy_json(v, ctx),
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
        if let Some(v) = CACHE.get() {
            return Ok(Arc::clone(v));
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
    let request_schema = get(
        get(&schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| err("SCHEMA", "", "request schema missing"))?;
    let request = CompiledSchema::compile(request_schema, &resources, ctx)?;
    let ready = Arc::new(Runtime { result, request });
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        let _ = CACHE.set(Arc::clone(&ready));
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
            "Value does not match the pinned TableSpec Field classification schema",
        ))
    }
}

pub(crate) fn classify_table_spec_field(
    input: &Value,
    request: &Value,
    adapter: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    let Value::Object(request_fields) = request else {
        return Err(err(
            "FIELD_CLASSIFICATION_REQUEST",
            "",
            "Expected column index and strict/report policy",
        ));
    };
    let mut seen = std::collections::BTreeSet::new();
    if request_fields.iter().any(|(key, _)| {
        !seen.insert(key)
            || !["column", "mode", "author"]
                .iter()
                .any(|name| key == &u(name))
    }) {
        return Err(err(
            "FIELD_CLASSIFICATION_REQUEST",
            "",
            "Expected column index and strict/report policy",
        ));
    }
    let valid_column = matches!(get(request, "column"), Some(Value::Number(n)) if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 && *n <= 9_007_199_254_740_991.0);
    let valid_mode =
        matches!(text(request, "mode"), Some(mode) if mode == &u("strict") || mode == &u("report"));
    if !valid_column || !valid_mode {
        return Err(err(
            "FIELD_CLASSIFICATION_REQUEST",
            "",
            "Expected column index and strict/report policy",
        ));
    }
    validate(request, &rt.request, ctx, "FIELD_CLASSIFICATION_REQUEST")?;
    let source = copy_json(input, ctx)?;
    let request = copy_json(request, ctx)?;
    let index = match get(&request, "column") {
        Some(Value::Number(n))
            if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 && *n <= 9_007_199_254_740_991.0 =>
        {
            *n as usize
        }
        _ => {
            return Err(err(
                "FIELD_CLASSIFICATION_REQUEST",
                "/column",
                "Expected a nonnegative safe integer",
            ))
        }
    };
    let valid = adapter.inspect(&source, ctx)?;
    if !valid.valid || text(&source, "umf") != Some(&u("0.10.0")) {
        return Err(err(
            "FIELD_CLASSIFICATION_VERSION",
            "",
            "Valid 0.2.0 envelope required; migrate explicitly",
        ));
    }
    // Export checks the current captured native tree, including split-file metadata and
    // retained exact source, before it can serve as classification evidence.
    if has(
        get(&source, "extensions").unwrap_or(&Value::Null),
        "umf.tablespec",
    ) {
        let payload = get(
            get(&source, "extensions").unwrap_or(&Value::Null),
            "umf.tablespec",
        )
        .unwrap_or(&Value::Null);
        if has(payload, "splitFiles") {
            adapter.export_bundle(&source, ctx)?;
        } else {
            adapter.export(&source, ctx)?;
        }
    } else {
        return Err(err("TABLESPEC_PAYLOAD", "", "Missing TableSpec source"));
    }
    let native = adapter.get_column(&source, index, ctx)?;
    let modules = array(&source, "modules").ok_or_else(|| {
        err(
            "FIELD_CLASSIFICATION_SOURCE",
            "/modules",
            "Modules required",
        )
    })?;
    let mi = modules
        .iter()
        .position(|m| text(m, "id") == Some(&u("table")))
        .ok_or_else(|| {
            err(
                "FIELD_CLASSIFICATION_SOURCE",
                "/modules",
                "Table module required",
            )
        })?;
    let elements = array(&modules[mi], "elements").ok_or_else(|| {
        err(
            "FIELD_CLASSIFICATION_SOURCE",
            "/modules/elements",
            "Table elements required",
        )
    })?;
    let element = elements
        .get(index)
        .ok_or_else(|| err("TABLESPEC_COLUMN", "/column", "Column index does not exist"))?;
    let ideal = u(&format!("/modules/{mi}/elements/{index}/kind"));
    let binding = obj(vec![
        ("id", t("umf.tablespec.field")),
        ("version", t("1.0.0")),
        ("nativeVersion", t(NATIVE_VERSION)),
        ("subset", t(SUBSET)),
    ]);
    let mut result = obj(vec![
        ("operation", t("classify-tablespec-field")),
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
                (
                    "nativePath",
                    Value::String(u(&format!(
                        "/extensions/umf.tablespec/root/members/columns/items/{index}"
                    ))),
                ),
                ("nativeFragment", copy_json(&native, ctx)?),
                ("basis", t("checked-native-column-membership")),
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
            Ok(verified) => {
                let identity = get(&verified, "identity").unwrap_or(&Value::Null);
                let provenance = get(&verified, "provenance").unwrap_or(&Value::Null);
                let id = text(element, "id");
                if text(identity, "module") != Some(&u("table")) || text(identity, "element") != id
                {
                    reason = Some("Author receipt identifies a different member".to_owned());
                } else if text(provenance, "kind") != Some(&u("field")) {
                    reason =
                        Some("Authored kind conflicts with native column membership".to_owned());
                }
            }
            Err(e) if e.is_control_failure() || e.code == "LIMIT" => return Err(e),
            Err(e) => reason = Some(format!("Author provenance is invalid or stale: {}", e.code)),
        }
    } else if has(element, "kind") {
        reason = Some("Existing kind requires verified author provenance; native-only observation cannot replace it".to_owned());
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
                ("code", t("FIELD_KIND_CONFLICT")),
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
                    a.get_mut(index)
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                err(
                    "FIELD_CLASSIFICATION_TARGET",
                    "/modules/elements",
                    "Selected column missing",
                )
            })?;
        set(selected, "kind", t("field"))?;
        let target_valid = adapter.inspect(&target, ctx)?;
        if !target_valid.valid {
            return Err(err(
                "FIELD_CLASSIFICATION_TARGET",
                "",
                "Classified target is invalid",
            ));
        }
        set(&mut result, "target", target)?;
    }
    validate(&result, &rt.result, ctx, "FIELD_CLASSIFICATION_RESULT")?;
    Ok(result)
}

pub(crate) fn verify_table_spec_field_classification(
    receipt: &Value,
    current: &Value,
    adapter: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(receipt, &rt.result, ctx, "FIELD_CLASSIFICATION_RECEIPT")?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(err(
            "FIELD_CLASSIFICATION_RECEIPT",
            "/status",
            "Expected a complete classified receipt",
        ));
    }
    let source = get(receipt, "source")
        .ok_or_else(|| err("FIELD_CLASSIFICATION_RECEIPT", "/source", "Source required"))?;
    let request = get(receipt, "request").ok_or_else(|| {
        err(
            "FIELD_CLASSIFICATION_RECEIPT",
            "/request",
            "Request required",
        )
    })?;
    let mut expected =
        classify_table_spec_field(source, request, adapter, engine, registry, caps, ctx)?;
    if !has(receipt, "diagnostics") {
        remove(&mut expected, "diagnostics");
    }
    if !equal(receipt, &expected, ctx)? {
        return Err(err(
            "FIELD_CLASSIFICATION_RECEIPT",
            "",
            "Classification disagrees with checked native source",
        ));
    }
    let target = get(receipt, "target")
        .ok_or_else(|| err("FIELD_CLASSIFICATION_RECEIPT", "/target", "Target required"))?;
    if !equal(current, target, ctx)? {
        return Err(err(
            "FIELD_CLASSIFICATION_STALE",
            "",
            "Target changed; recompute classification from retained native source",
        ));
    }
    copy_json(receipt, ctx)
}

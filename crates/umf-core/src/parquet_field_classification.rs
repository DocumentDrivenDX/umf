// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native-owned Parquet primitive Field role classification.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    parquet_capture_inspection::{
        export_parquet_capture, get_parquet_field_metadata, inspect_parquet_containers,
    },
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};
pub const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/parquet-field-classification.schema.json");
const KIND_SCHEMA: &str = include_str!("../../../spec/core/kind-operation-v6.schema.json");
const RECOVERY:&str="Original assertion and native fragment retained in source; reclassify with corrected provenance";
const NATIVE_VERSION: &str = "parquet-format@219e3f12a62f9476e830c21e26d030d231f7c017";
const SUBSET:&str="Checked primitive schema leaves only; groups and container wrappers excluded; repetition remains native, not scalar cardinality";
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
fn err(code: &str, path: &str, msg: impl Into<String>) -> EngineError {
    EngineError::new(code, u(path), msg.into())
}
fn read_json(s: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&s.encode_utf16().collect::<Vec<_>>(), Format::Json, ctx)
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
            "Value does not match the pinned Parquet Field classification schema",
        ))
    }
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
fn set(v: &mut Value, k: &str, n: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("PARQUET_FIELD_TARGET", "", "Expected object"));
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
pub fn classify_parquet_field(
    input: &Value,
    request: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(request, &rt.request, ctx, "FIELD_CLASSIFICATION_REQUEST")?;
    let source = copy_json(input, ctx)?;
    let request = copy_json(request, ctx)?;
    let index = match get(&request, "index") {
        Some(Value::Number(n))
            if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 && *n <= 9_007_199_254_740_991.0 =>
        {
            *n as usize
        }
        _ => {
            return Err(err(
                "FIELD_CLASSIFICATION_REQUEST",
                "/index",
                "Expected a nonnegative safe integer",
            ))
        }
    };
    let valid = engine.validate_document(&source, registry, caps, ctx)?;
    if !valid.valid || text(&source, "umf") != Some(&u("0.10.0")) {
        return Err(err(
            "FIELD_CLASSIFICATION_VERSION",
            "",
            "Valid core 0.10.0 envelope required; migrate explicitly",
        ));
    }
    export_parquet_capture(&source, engine, registry, caps, ctx)?;
    let fields = get_parquet_field_metadata(&source, engine, registry, caps, ctx)?;
    let containers = inspect_parquet_containers(&source, engine, registry, caps, ctx)?;
    if text(&fields, "status") != Some(&u("checked"))
        || text(&containers, "status") != Some(&u("checked"))
    {
        return Err(err(
            "PARQUET_FIELD_SCHEMA",
            "",
            "Checked schema and container topology required",
        ));
    }
    let field = array(&fields, "fields")
        .unwrap_or(&[])
        .iter()
        .find(|f| matches!(get(f,"index"),Some(Value::Number(n))if n.is_finite()&&*n==index as f64))
        .ok_or_else(|| {
            err(
                "PARQUET_FIELD_INDEX",
                "/index",
                "Native schema member index not found",
            )
        })?;
    let native = get(field, "nativeField")
        .ok_or_else(|| err("PARQUET_FIELD_METADATA", "", "Native fragment missing"))?;
    let modules = array(&source, "modules")
        .ok_or_else(|| err("PARQUET_FIELD_METADATA", "/modules", "Modules required"))?;
    let mi = modules
        .iter()
        .position(|m| text(m, "id") == Some(&u("parquet.fields")))
        .ok_or_else(|| {
            err(
                "PARQUET_FIELD_METADATA",
                "/modules",
                "Materialized field module required",
            )
        })?;
    let id = get(field, "element")
        .and_then(|e| text(e, "id"))
        .ok_or_else(|| err("PARQUET_FIELD_METADATA", "", "Element identity missing"))?;
    let elements = array(&modules[mi], "elements")
        .ok_or_else(|| err("PARQUET_FIELD_METADATA", "/elements", "Elements required"))?;
    let ei = elements
        .iter()
        .position(|e| text(e, "id") == Some(id))
        .ok_or_else(|| {
            err(
                "PARQUET_FIELD_METADATA",
                "/elements",
                "Materialized field missing",
            )
        })?;
    let element = &elements[ei];
    let ideal = u(&format!("/modules/{mi}/elements/{ei}/kind"));
    let binding = obj(vec![
        ("id", t("umf.parquet.field")),
        ("version", t("1.0.0")),
        ("nativeVersion", t(NATIVE_VERSION)),
        ("subset", t(SUBSET)),
    ]);
    let mut result = obj(vec![
        ("operation", t("classify-parquet-field")),
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
                ("nativePath", Value::String(u(&format!("/schema/{index}")))),
                ("nativeFragment", copy_json(native, ctx)?),
                ("basis", t("checked-primitive-schema-leaf")),
                ("outcome", t("exact")),
            ]),
        ),
        ("residuals", Value::Array(vec![])),
        ("diagnostics", Value::Array(vec![])),
    ]);
    let mut reason = None;
    if !matches!(native,Value::Object(m)if m.iter().any(|(k,_)|k==&u("type"))) {
        reason=Some("Group/container role requires a separate binding; it cannot be classified as a primitive field".to_owned());
    } else if let Some(author) = get(&request, "author") {
        match crate::core_kind::verify_core_kind_declaration(
            author, &source, engine, registry, caps, ctx,
        ) {
            Ok(verified) => {
                let ident = get(&verified, "identity").unwrap_or(&Value::Null);
                let prov = get(&verified, "provenance").unwrap_or(&Value::Null);
                if text(ident, "module") != Some(&u("parquet.fields"))
                    || text(ident, "element") != Some(id)
                    || text(prov, "kind") != Some(&u("field"))
                {
                    reason = Some("Author receipt does not assert this Field role".into());
                }
            }
            Err(e) if e.is_control_failure() || e.code == "LIMIT" => return Err(e),
            Err(e) => reason = Some(format!("Author provenance is invalid or stale: {}", e.code)),
        }
    } else if get(element, "kind").is_some() {
        reason=Some("Existing kind requires verified author provenance; native-only observation cannot replace it".into());
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
                    a.get_mut(ei)
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                err(
                    "PARQUET_FIELD_TARGET",
                    "/elements",
                    "Selected field missing",
                )
            })?;
        set(selected, "kind", t("field"))?;
        set(&mut result, "target", target)?;
    }
    validate(&result, &rt.result, ctx, "FIELD_CLASSIFICATION_RESULT")?;
    Ok(result)
}
pub fn verify_parquet_field_classification(
    receipt: &Value,
    current: &Value,
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
            "Expected complete classified receipt",
        ));
    }
    let expected = classify_parquet_field(
        get(receipt, "source")
            .ok_or_else(|| err("FIELD_CLASSIFICATION_RECEIPT", "/source", "Source required"))?,
        get(receipt, "request").ok_or_else(|| {
            err(
                "FIELD_CLASSIFICATION_RECEIPT",
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
            "FIELD_CLASSIFICATION_RECEIPT",
            "",
            "Classification disagrees with checked native source",
        ));
    }
    if !equal(
        current,
        get(receipt, "target")
            .ok_or_else(|| err("FIELD_CLASSIFICATION_RECEIPT", "/target", "Target required"))?,
        ctx,
    )? {
        return Err(err(
            "FIELD_CLASSIFICATION_STALE",
            "",
            "Target changed; recompute classification from retained native source",
        ));
    }
    copy_json(receipt, ctx)
}
pub fn recover_parquet_field_bytes(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Vec<u8>, EngineError> {
    let verified =
        verify_parquet_field_classification(receipt, current, engine, registry, caps, ctx)?;
    export_parquet_capture(
        get(&verified, "source")
            .ok_or_else(|| err("FIELD_CLASSIFICATION_RECEIPT", "/source", "Source required"))?,
        engine,
        registry,
        caps,
        ctx,
    )
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Physical Parquet schema observations for the native-key classification.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    parquet_capture_inspection::{export_parquet_capture, get_parquet_field_metadata},
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};

pub const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/parquet-key-classification.schema.json");
const CORE_SCHEMA: &str = include_str!("../../../spec/core/schema.json");
const EXT: &str = "umf.parquet.keys";
const RECOVERY: &str = "Original native archive retained; no authored key inferred";
const REASON: &str = "Parquet schemas do not enforce collection uniqueness or establish authored key IDs, names, primary or alternate intent. Original bytes retain page encodings, repetition/container roles, field IDs, statistics, sorting and embedded Arrow metadata; schema observation does not verify page values or file-wide validity";
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
        Some(Value::String(s)) => Some(s),
        _ => None,
    }
}
fn array<'a>(v: &'a Value, k: &str) -> Option<&'a [Value]> {
    if let Value::Array(a) = get(v, k)? {
        Some(a)
    } else {
        None
    }
}
fn err(code: &str, path: &str, message: impl Into<String>) -> EngineError {
    EngineError::new(code, u(path), message.into())
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
            "Value does not match the pinned Parquet Key classification schema",
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
    let resources = engine.schema_resources_with_context(ctx)?;
    let schema = read_json(RESULT_SCHEMA, ctx)?;
    let result = CompiledSchema::compile(&schema, &resources, ctx)?;
    let request = CompiledSchema::compile(
        get(
            get(&schema, "properties").unwrap_or(&Value::Null),
            "request",
        )
        .ok_or_else(|| err("SCHEMA", "", "request schema missing"))?,
        &resources,
        ctx,
    )?;
    let ready = Arc::new(Runtime { result, request });
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        return Ok(crate::resource_cache::publish_completed(&CACHE, ready));
    }
    Ok(ready)
}
fn same(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canon(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        match v {
            Value::Array(a) => {
                let mut o = Vec::with_capacity(a.len());
                for x in a {
                    ctx.charge_work(1, u(""))?;
                    o.push(canon(x, ctx)?);
                }
                Ok(Value::Array(o))
            }
            Value::Object(m) => {
                let mut o = Vec::with_capacity(m.len());
                for (k, v) in m {
                    ctx.charge_work(k.len().saturating_add(1), u(""))?;
                    o.push((k.clone(), canon(v, ctx)?));
                }
                o.sort_by(|a, b| a.0.cmp(&b.0));
                Ok(Value::Object(o))
            }
            _ => copy_json(v, ctx),
        }
    }
    Ok(canon(a, ctx)? == canon(b, ctx)?)
}
fn set(v: &mut Value, k: &str, n: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("PARQUET_KEY_TARGET", "", "Expected object"));
    };
    if let Some((_, old)) = m.iter_mut().find(|(x, _)| x == &u(k)) {
        *old = n
    } else {
        m.push((u(k), n));
    }
    Ok(())
}
fn has(v: &Value, k: &str) -> bool {
    matches!(v,Value::Object(m)if m.iter().any(|(x,_)|x==&u(k)))
}
fn residual(path: &str, value: Value, reason: &str) -> Value {
    obj(vec![
        ("path", t(path)),
        ("value", value),
        ("outcome", t("not-expressible")),
        ("reason", t(reason)),
        ("recovery", t(RECOVERY)),
    ])
}
fn observation(field: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let index =
        get(field, "index").ok_or_else(|| err("PARQUET_KEY_FIELD", "", "Field index missing"))?;
    let index_num = match index {
        Value::Number(n) if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 => *n,
        _ => return Err(err("PARQUET_KEY_FIELD", "", "Invalid field index")),
    };
    let native = get(field, "nativeField")
        .ok_or_else(|| err("PARQUET_KEY_FIELD", "", "Native fragment missing"))?;
    let leaf = matches!(native,Value::Object(m)if m.iter().any(|(k,_)|k==&u("type")));
    let path = match get(field, "path") {
        Some(value) => copy_json(value, ctx)?,
        None => Value::Array(Vec::new()),
    };
    let Value::Array(parts) = path else {
        return Err(err(
            "PARQUET_KEY_FIELD",
            "",
            "Native field path must be an array",
        ));
    };
    for part in &parts {
        if !matches!(part, Value::String(_)) {
            return Err(err(
                "PARQUET_KEY_FIELD",
                "",
                "Native field path segments must be strings",
            ));
        }
    }
    Ok(obj(vec![
        ("nativePath", t(&format!("/schema/{}", index_num as usize))),
        ("index", Value::Number(index_num)),
        (
            "path",
            Value::Array(
                parts
                    .into_iter()
                    .map(|p| copy_json(&p, ctx))
                    .collect::<Result<_, _>>()?,
            ),
        ),
        (
            "kind",
            t(if leaf {
                "physical-leaf"
            } else {
                "physical-group"
            }),
        ),
        (
            "definitionLevel",
            get(field, "definitionLevel")
                .cloned()
                .unwrap_or(Value::Null),
        ),
        (
            "repetitionLevel",
            get(field, "repetitionLevel")
                .cloned()
                .unwrap_or(Value::Null),
        ),
        ("nativeField", copy_json(native, ctx)?),
        ("enforcement", t("not-expressible")),
        ("authorIntent", t("unknown")),
        ("provenance", t("inferred")),
        ("scope", t("file-schema")),
    ]))
}
pub fn classify_parquet_keys(
    source: &Value,
    request: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(request, &rt.request, ctx, "PARQUET_KEY_REQUEST")?;
    let source = copy_json(source, ctx)?;
    let request = copy_json(request, ctx)?;
    export_parquet_capture(&source, engine, registry, caps, ctx)?;
    let view = get_parquet_field_metadata(&source, engine, registry, caps, ctx)?;
    let mut observations = Vec::new();
    let mut residuals = vec![residual(
        "/modules",
        copy_json(get(&source, "modules").unwrap_or(&Value::Null), ctx)?,
        REASON,
    )];
    let checked = text(&view, "status") == Some(&u("checked"));
    if checked {
        for field in array(&view, "fields").unwrap_or(&[]) {
            ctx.charge_work(1, u("/fields"))?;
            observations.push(observation(field, ctx)?);
        }
    } else {
        residuals.push(residual(
            "/modules",
            copy_json(
                get(&view, "diagnostics").unwrap_or(&Value::Array(Vec::new())),
                ctx,
            )?,
            "Native schema cannot be checked; no partial key observations are published",
        ));
    }
    let mut extension_conflict = false;
    if has(get(&source, "extensions").unwrap_or(&Value::Null), EXT) {
        extension_conflict = true;
        residuals.push(residual(
            &format!("/extensions/{EXT}"),
            copy_json(get(get(&source, "extensions").unwrap(), EXT).unwrap(), ctx)?,
            "Existing observations cannot be overwritten; reclassify retained original source",
        ));
    }
    let vocabulary = get(get(&source, "vocabularies").unwrap_or(&Value::Null), EXT);
    let vocab_conflict =
        vocabulary.is_some() && text(vocabulary.unwrap(), "version") != Some(&u("1.0.0"));
    if vocab_conflict {
        residuals.push(residual(
            &format!("/vocabularies/{EXT}"),
            copy_json(vocabulary.unwrap(), ctx)?,
            "Unsupported classification vocabulary",
        ));
    }
    let blocked = text(&request, "mode") == Some(&u("strict"))
        || !checked
        || extension_conflict
        || vocab_conflict;
    let binding=obj(vec![("id",t("umf.parquet.keys")),("version",t("1.0.0")),("nativeVersion",t("PyArrow 21.0.0 / parquet-format 219e3f12a62f9476e830c21e26d030d231f7c017")),("subset",t("Physical schema observations with original file bytes; no collection uniqueness, authored identity inference, page validation or native equivalence"))]);
    let mut diagnostics = Vec::new();
    for item in &residuals {
        diagnostics.push(obj(vec![
            ("code", t("PARQUET_KEY_LOSS")),
            (
                "path",
                get(item, "path")
                    .map(|value| copy_json(value, ctx))
                    .transpose()?
                    .unwrap_or(Value::Null),
            ),
            (
                "message",
                get(item, "reason")
                    .map(|value| copy_json(value, ctx))
                    .transpose()?
                    .unwrap_or(Value::Null),
            ),
            ("severity", t(if blocked { "error" } else { "warning" })),
        ]));
    }
    let mut result = obj(vec![
        ("operation", t("classify-parquet-keys")),
        ("version", t("1.0.0")),
        ("status", t(if blocked { "blocked" } else { "classified" })),
        ("source", copy_json(&source, ctx)?),
        ("request", copy_json(&request, ctx)?),
        ("binding", copy_json(&binding, ctx)?),
        ("observations", copy_json(&Value::Array(observations), ctx)?),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    if !blocked {
        let mut target = copy_json(&source, ctx)?;
        let vocab = get_mut(&mut target, "vocabularies").ok_or_else(|| {
            err(
                "PARQUET_KEY_TARGET",
                "/vocabularies",
                "Vocabularies required",
            )
        })?;
        set(vocab, EXT, obj(vec![("version", t("1.0.0"))]))?;
        let extensions = match get(&target, "extensions") {
            Some(value) => copy_json(value, ctx)?,
            None => obj(vec![]),
        };
        set(&mut target, "extensions", extensions)?;
        let ext = get_mut(&mut target, "extensions").unwrap();
        set(
            ext,
            EXT,
            obj(vec![
                ("origin", t("classified")),
                (
                    "binding",
                    copy_json(get(&result, "binding").unwrap_or(&Value::Null), ctx)?,
                ),
                (
                    "observations",
                    copy_json(get(&result, "observations").unwrap_or(&Value::Null), ctx)?,
                ),
            ]),
        )?;
        let validation = engine.validate_document(&target, registry, caps, ctx)?;
        if !validation.valid {
            return Err(err(
                "PARQUET_KEY_TARGET",
                "",
                "Invalid classification target",
            ));
        }
        set(&mut result, "target", target)?;
    }
    validate(&result, &rt.result, ctx, "PARQUET_KEY_RESULT")?;
    Ok(result)
}
pub fn verify_parquet_key_classification(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(receipt, &rt.result, ctx, "PARQUET_KEY_RECEIPT")?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(err(
            "PARQUET_KEY_RECEIPT",
            "/status",
            "Expected successful classification",
        ));
    }
    let expected = classify_parquet_keys(
        get(receipt, "source")
            .ok_or_else(|| err("PARQUET_KEY_RECEIPT", "/source", "Source required"))?,
        get(receipt, "request")
            .ok_or_else(|| err("PARQUET_KEY_RECEIPT", "/request", "Request required"))?,
        engine,
        registry,
        caps,
        ctx,
    )?;
    if !same(receipt, &expected, ctx)? {
        return Err(err(
            "PARQUET_KEY_RECEIPT",
            "",
            "Classification differs from retained inputs",
        ));
    }
    if !same(
        get(receipt, "target")
            .ok_or_else(|| err("PARQUET_KEY_RECEIPT", "/target", "Target required"))?,
        current,
        ctx,
    )? {
        return Err(err("PARQUET_KEY_STALE", "", "Current target differs"));
    }
    copy_json(receipt, ctx)
}
pub fn recover_parquet_key_source(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Vec<u8>, EngineError> {
    let verified =
        verify_parquet_key_classification(receipt, current, engine, registry, caps, ctx)?;
    export_parquet_capture(
        get(&verified, "source")
            .ok_or_else(|| err("PARQUET_KEY_RECEIPT", "/source", "Source required"))?,
        engine,
        registry,
        caps,
        ctx,
    )
}

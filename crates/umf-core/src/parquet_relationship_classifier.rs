// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned Parquet physical-schema relationship observations.
//!
//! The classifier reports the decoded file schema and always retains the
//! original source document. Physical repetition is not promoted to authored
//! relationship identity, uniqueness, lifecycle, or enforcement.

use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    parquet_capture_inspection::{export_parquet_capture, get_parquet_field_metadata},
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/parquet-relationship-classification.schema.json");
const CORE_SCHEMA: &str = include_str!("../../../spec/core/schema.json");
const EXTENSION: &str = "umf.parquet.relationships";
const VERSION: &str = "1.0.0";
const BINDING: &str = "Physical schema observations with original file bytes; no target existence, graph identity, reverse multiplicity or collection uniqueness, authored identity inference, page validation or native equivalence";
const CLAIM: &str = "Parquet schemas do not enforce target existence, graph identity, reverse multiplicity or collection uniqueness or establish authored relationship IDs, names, lifecycle or participation intent. Original bytes retain page encodings, repetition/container roles, field IDs, statistics, sorting and embedded Arrow metadata; schema observation does not verify page values or file-wide validity";

fn k(value: &str) -> Utf16 {
    Utf16::from(value)
}
fn s(value: &str) -> Value {
    Value::string_utf8(value)
}
fn n(value: usize) -> Value {
    Value::Number(value as f64)
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (k(key), value))
            .collect(),
    )
}
fn get<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(name, _)| name == &k(key))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn get_mut<'a>(value: &'a mut Value, key: &str) -> Option<&'a mut Value> {
    match value {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(name, _)| name == &k(key))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn text(value: &Value) -> Option<String> {
    if let Value::String(value) = value {
        value.to_utf8().ok()
    } else {
        None
    }
}
fn error(code: &str, path: &str, message: impl Into<String>) -> EngineError {
    EngineError::new(code, k(path), message.into())
}
fn json(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}
fn schemas(ctx: &mut Context<'_>) -> Result<(CompiledSchema, CompiledSchema), EngineError> {
    let source = json(RESULT_SCHEMA, ctx)?;
    let resources = SchemaResources {
        entries: vec![
            (k("urn:umf:core:0.10.0"), json(CORE_SCHEMA, ctx)?),
            (
                k("urn:umf:core:semantic-type-reference:1.0.0"),
                json(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
            ),
        ],
    };
    let result = CompiledSchema::compile(&source, &resources, ctx)?;
    let request = get(
        get(&source, "properties").ok_or_else(|| {
            error(
                "PARQUET_RELATIONSHIP_RESULT",
                "",
                "Result schema has no properties",
            )
        })?,
        "request",
    )
    .ok_or_else(|| {
        error(
            "PARQUET_RELATIONSHIP_RESULT",
            "",
            "Result schema has no request schema",
        )
    })?;
    Ok((result, CompiledSchema::compile(request, &resources, ctx)?))
}
fn validate_receipt(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let (compiled, _) = schemas(ctx)?;
    let errors = compiled.validate(value, ctx)?;
    if errors.is_empty() {
        Ok(())
    } else {
        Err(error(
            "PARQUET_RELATIONSHIP_RESULT",
            "",
            format!(
                "Rust classifier produced a schema-invalid report: {}",
                errors.len()
            ),
        ))
    }
}
fn canonical(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match value {
        Value::Array(items) => {
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                out.push(canonical(item, ctx)?);
            }
            Ok(Value::Array(out))
        }
        Value::Object(fields) => {
            let mut out = Vec::with_capacity(fields.len());
            for (key, item) in fields {
                ctx.charge_work(key.len(), Utf16::default())?;
                out.push((key.clone(), canonical(item, ctx)?));
            }
            out.sort_by(|a, b| a.0.cmp(&b.0));
            Ok(Value::Object(out))
        }
        Value::String(value) => {
            ctx.charge_work(value.len(), Utf16::default())?;
            Ok(Value::String(value.clone()))
        }
        _ => Ok(value.clone()),
    }
}
fn canonical_equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(canonical(a, ctx)? == canonical(b, ctx)?)
}

pub fn classify(
    input: &Value,
    request: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mode = get(request, "mode").and_then(text).ok_or_else(|| {
        error(
            "PARQUET_RELATIONSHIP_REQUEST",
            "/request/mode",
            "mode is required",
        )
    })?;
    if !matches!(mode.as_str(), "strict" | "report")
        || get(request, "profile").and_then(text).as_deref() != Some("file-schema")
    {
        return Err(error(
            "PARQUET_RELATIONSHIP_REQUEST",
            "/request",
            "Expected file-schema profile and strict/report mode",
        ));
    }
    let (_, request_schema) = schemas(ctx)?;
    if let Some(issue) = request_schema.validate(request, ctx)?.first() {
        return Err(error(
            "PARQUET_RELATIONSHIP_REQUEST",
            &issue.instance_path.to_utf8().unwrap_or_default(),
            issue.message.to_utf8().unwrap_or_default(),
        ));
    }
    let source = copy_json(input, ctx)?;
    let bytes = export_parquet_capture(&source, engine, registry, capabilities, ctx)?;
    let view = get_parquet_field_metadata(&source, engine, registry, capabilities, ctx)?;
    let checked = text(get(&view, "status").unwrap_or(&Value::Null)).as_deref() == Some("checked");

    let mut observations = Vec::new();
    let mut residuals = vec![object(vec![
        ("path", s("/modules")),
        (
            "value",
            copy_json(get(&source, "modules").unwrap_or(&Value::Null), ctx)?,
        ),
        ("outcome", s("not-expressible")),
        ("reason", s(CLAIM)),
        (
            "recovery",
            s("Original native archive retained; no authored relationship inferred"),
        ),
    ])];
    if checked {
        if let Some(Value::Array(fields)) = get(&view, "fields") {
            for field in fields {
                let index = match get(field, "index") {
                    Some(Value::Number(value))
                        if value.is_finite() && *value >= 1.0 && value.fract() == 0.0 =>
                    {
                        *value as usize
                    }
                    _ => continue,
                };
                let path = copy_json(get(field, "path").unwrap_or(&Value::Array(Vec::new())), ctx)?;
                let native_field =
                    copy_json(get(field, "nativeField").unwrap_or(&Value::Null), ctx)?;
                let native_path = format!("/schema/{index}");
                ctx.charge_work(native_path.len().saturating_add(48), Utf16::default())?;
                let kind = if get(&native_field, "type").is_some() {
                    "physical-leaf"
                } else {
                    "physical-group"
                };
                observations.push(object(vec![
                    ("nativePath", s(&native_path)),
                    ("index", n(index)),
                    ("path", path),
                    ("kind", s(kind)),
                    (
                        "definitionLevel",
                        copy_json(get(field, "definitionLevel").unwrap_or(&Value::Null), ctx)?,
                    ),
                    (
                        "repetitionLevel",
                        copy_json(get(field, "repetitionLevel").unwrap_or(&Value::Null), ctx)?,
                    ),
                    ("nativeField", native_field),
                    ("enforcement", s("not-expressible")),
                    ("authorIntent", s("unknown")),
                    ("provenance", s("inferred")),
                    ("scope", s("file-schema")),
                ]));
            }
        }
    } else {
        let diagnostic_value = copy_json(
            get(&view, "diagnostics").unwrap_or(&Value::Array(Vec::new())),
            ctx,
        )?;
        residuals.push(object(vec![
            ("path", s("/modules")), ("value", diagnostic_value), ("outcome", s("not-expressible")),
            ("reason", s("Native schema cannot be checked; no partial relationship observations are published")),
            ("recovery", s("Original native archive retained; no authored relationship inferred")),
        ]));
    }
    let conflict = get(
        get(&source, "extensions").unwrap_or(&Value::Null),
        EXTENSION,
    )
    .is_some();
    if conflict {
        residuals.push(object(vec![
        ("path", s("/extensions/umf.parquet.relationships")),
        ("value", copy_json(get(get(&source, "extensions").unwrap(), EXTENSION).unwrap(), ctx)?),
        ("outcome", s("not-expressible")), ("reason", s("Existing observations cannot be overwritten; reclassify retained original source")),
        ("recovery", s("Original native archive retained; no authored relationship inferred")),
    ]));
    }
    let vocabulary_version = get(
        get(&source, "vocabularies").unwrap_or(&Value::Null),
        EXTENSION,
    )
    .and_then(|v| get(v, "version"))
    .and_then(text);
    let incompatible = vocabulary_version
        .as_deref()
        .is_some_and(|version| version != VERSION);
    if incompatible {
        residuals.push(object(vec![
            ("path", s("/vocabularies/umf.parquet.relationships")),
            (
                "value",
                copy_json(
                    get(get(&source, "vocabularies").unwrap(), EXTENSION).unwrap(),
                    ctx,
                )?,
            ),
            ("outcome", s("not-expressible")),
            ("reason", s("Unsupported classification vocabulary")),
            (
                "recovery",
                s("Original native archive retained; no authored relationship inferred"),
            ),
        ]));
    }
    let blocked = mode == "strict" || !checked || conflict || incompatible;
    let mut target = None;
    if !blocked {
        let mut next = copy_json(&source, ctx)?;
        if let Value::Object(vocabularies) = get_mut(&mut next, "vocabularies").unwrap() {
            if let Some((_, value)) = vocabularies
                .iter_mut()
                .find(|(key, _)| key == &k(EXTENSION))
            {
                if let Value::Object(fields) = value {
                    if let Some((_, value)) =
                        fields.iter_mut().find(|(key, _)| key == &k("version"))
                    {
                        *value = s(VERSION);
                    } else {
                        fields.push((k("version"), s(VERSION)));
                    }
                }
            } else {
                vocabularies.push((k(EXTENSION), object(vec![("version", s(VERSION))])));
            }
        }
        if get_mut(&mut next, "extensions").is_none() {
            if let Value::Object(fields) = &mut next {
                fields.push((k("extensions"), Value::Object(Vec::new())));
            }
        }
        let target_observations = observations
            .iter()
            .map(|row| copy_json(row, ctx))
            .collect::<Result<Vec<_>, _>>()?;
        let ext_payload = object(vec![
            ("origin", s("classified")),
            ("binding", binding()),
            ("observations", Value::Array(target_observations)),
        ]);
        if let Value::Object(exts) = get_mut(&mut next, "extensions").unwrap() {
            exts.push((k(EXTENSION), ext_payload));
        }
        let validation = engine.validate_document(&next, registry, capabilities, ctx)?;
        if !validation.valid {
            return Err(error(
                "PARQUET_RELATIONSHIP_TARGET",
                "",
                "Classification target violates current core constraints",
            ));
        }
        target = Some(next);
    }
    let diagnostics = residuals
        .iter()
        .map(|loss| {
            object(vec![
                ("code", s("PARQUET_RELATIONSHIP_LOSS")),
                ("path", get(loss, "path").cloned().unwrap_or(Value::Null)),
                (
                    "message",
                    get(loss, "reason").cloned().unwrap_or(Value::Null),
                ),
                ("severity", s(if blocked { "error" } else { "warning" })),
            ])
        })
        .collect();
    let mut result = object(vec![
        ("operation", s("classify-parquet-relationships")),
        ("version", s("1.0.0")),
        ("status", s(if blocked { "blocked" } else { "classified" })),
        ("source", source),
        ("request", copy_json(request, ctx)?),
        ("binding", binding()),
        ("observations", Value::Array(observations)),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    if let Some(target) = target {
        if let Value::Object(fields) = &mut result {
            fields.push((k("target"), target));
        }
    }
    validate_receipt(&result, ctx)?;
    Ok(result)
}

fn binding() -> Value {
    object(vec![
        ("id", s(EXTENSION)),
        ("version", s(VERSION)),
        (
            "nativeVersion",
            s("PyArrow 21.0.0 / parquet-format 219e3f12a62f9476e830c21e26d030d231f7c017"),
        ),
        ("subset", s(BINDING)),
    ])
}

pub fn verify(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = get(receipt, "source")
        .ok_or_else(|| error("PARQUET_RELATIONSHIP_RECEIPT", "/source", "source missing"))?;
    let request = get(receipt, "request").ok_or_else(|| {
        error(
            "PARQUET_RELATIONSHIP_RECEIPT",
            "/request",
            "request missing",
        )
    })?;
    let expected = classify(source, request, engine, registry, capabilities, ctx)?;
    if text(get(receipt, "status").unwrap_or(&Value::Null)).as_deref() != Some("classified")
        || !canonical_equal(receipt, &expected, ctx)?
    {
        return Err(error(
            "PARQUET_RELATIONSHIP_RECEIPT",
            "",
            "Classification differs from retained inputs",
        ));
    }
    if !canonical_equal(
        current,
        get(receipt, "target").ok_or_else(|| {
            error(
                "PARQUET_RELATIONSHIP_STALE",
                "/target",
                "classified target missing",
            )
        })?,
        ctx,
    )? {
        return Err(error(
            "PARQUET_RELATIONSHIP_STALE",
            "",
            "Current target differs",
        ));
    }
    Ok(copy_json(receipt, ctx)?)
}

pub fn recover_source(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let verified = verify(receipt, current, engine, registry, capabilities, ctx)?;
    let source = get(&verified, "source")
        .ok_or_else(|| error("PARQUET_RELATIONSHIP_RECEIPT", "/source", "source missing"))?;
    let bytes = export_parquet_capture(source, engine, registry, capabilities, ctx)?;
    let mut hex = String::with_capacity(bytes.len().saturating_mul(2));
    ctx.charge_work(bytes.len().saturating_mul(2), Utf16::default())?;
    for byte in bytes {
        use std::fmt::Write;
        write!(&mut hex, "{byte:02x}")
            .map_err(|_| error("PARQUET_RELATIONSHIP_RECOVERY", "", "hex encoding failed"))?;
    }
    Ok(object(vec![("bytesHex", s(&hex))]))
}

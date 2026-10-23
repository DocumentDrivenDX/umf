//! Core nullability inspection and explicit author declaration.
//! This module operates only on the retained core ideal; it performs no native classification.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    registry::Registry,
    value::{Utf16, Value, copy_json},
};

const INSPECTION_SCHEMA: &str =
    include_str!("../../../spec/core/nullability-operation-v7.schema.json");
const DECLARATION_SCHEMA: &str =
    include_str!("../../../spec/core/nullability-operation-v5.schema.json");
const NULLABILITIES: [&str; 3] = ["required", "absent-allowed", "unspecified"];
fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(a, b)| (k(a), b)).collect())
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(x, _)| x == &k(n)).map(|(_, v)| v),
        _ => None,
    }
}
fn s(v: &Value) -> Option<String> {
    match v {
        Value::String(x) => x.to_utf8().ok(),
        _ => None,
    }
}
fn raw_string(v: &Value) -> Option<Utf16> {
    match v {
        Value::String(x) => Some(x.clone()),
        _ => None,
    }
}
fn err(c: &str, m: impl Into<String>, p: &str) -> EngineError {
    EngineError::new(c, k(p), m.into())
}
fn copy(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    copy_json(v, ctx)
}
fn validate_doc(
    value: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    code: &str,
    path: &str,
) -> Result<(), EngineError> {
    let v = engine.validate_document(value, registry, caps, ctx)?;
    if v.valid {
        return Ok(());
    }
    let ds = Value::Array(
        v.diagnostics
            .into_iter()
            .map(|d| {
                obj(vec![
                    ("code", Value::String(d.code)),
                    ("path", Value::String(d.path)),
                    ("message", Value::String(d.message)),
                    (
                        "severity",
                        t(match d.severity {
                            crate::error::Severity::Error => "error",
                            crate::error::Severity::Warning => "warning",
                        }),
                    ),
                ])
            })
            .collect(),
    );
    let message = crate::serialization::stringify_compact_metered(&ds, ctx)?;
    Err(EngineError::new(code, k(path), message))
}
fn validate_op(
    value: &Value,
    schema_src: &str,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    let schema = crate::serialization::read_json_value(
        &schema_src.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        ctx,
    )?;
    fn inline(v: Value, ctx: &mut Context<'_>, depth: usize) -> Result<Value, EngineError> {
        if depth > ctx.limits().max_depth {
            return Err(err("LIMIT", "Static operation schema depth exceeded", ""));
        }
        ctx.charge_work(1, Utf16::default())?;
        match v {
            Value::Object(m)
                if m.len() == 1
                    && m[0].0 == k("$ref")
                    && s(&m[0].1).as_deref() == Some("urn:umf:core:0.10.0") =>
            {
                Ok(Value::Bool(true))
            }
            Value::Object(m) => Ok(Value::Object(
                m.into_iter()
                    .map(|(a, b)| Ok((a, inline(b, ctx, depth + 1)?)))
                    .collect::<Result<_, EngineError>>()?,
            )),
            Value::Array(a) => Ok(Value::Array(
                a.into_iter()
                    .map(|v| inline(v, ctx, depth + 1))
                    .collect::<Result<_, _>>()?,
            )),
            v => Ok(v),
        }
    }
    let schema = inline(schema, ctx, 0)?;
    let c = crate::schema::CompiledSchema::compile(
        &schema,
        &crate::schema::SchemaResources::default(),
        ctx,
    )?;
    let es = c.validate(value, ctx)?;
    if es.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            es[0].message.to_utf8().unwrap_or_default(),
            &es[0].instance_path.to_utf8().unwrap_or_default(),
        ))
    }
}
#[derive(Clone, Debug, PartialEq)]
pub struct Identity {
    pub module: Utf16,
    pub element: Utf16,
}
struct Located {
    source: Value,
    target: Value,
    element: Value,
    mi: usize,
    ei: usize,
    path: String,
}
fn locate(
    input: &Value,
    id: &Identity,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Located, EngineError> {
    if id.module.is_empty() || id.element.is_empty() {
        return Err(err(
            "CORE_NULLABILITY_IDENTITY",
            "Expected explicit module and element identities",
            "",
        ));
    }
    let source = copy(input, ctx)?;
    validate_doc(
        &source,
        engine,
        registry,
        caps,
        ctx,
        "CORE_NULLABILITY_SOURCE",
        "",
    )?;
    ctx.charge_work(id.module.len() + id.element.len(), Utf16::default())?;
    let ms = match get(&source, "modules") {
        Some(Value::Array(a)) => a,
        _ => {
            return Err(err(
                "CORE_NULLABILITY_SOURCE",
                "Missing modules",
                "/modules",
            ));
        }
    };
    let mut found = None;
    for (mi, m) in ms.iter().enumerate() {
        if get(m, "id").and_then(raw_string).as_ref() != Some(&id.module) {
            continue;
        }
        if let Some(Value::Array(es)) = get(m, "elements") {
            if let Some(ei) = es
                .iter()
                .position(|e| get(e, "id").and_then(raw_string).as_ref() == Some(&id.element))
            {
                found = Some((mi, ei));
                break;
            }
        }
    }
    let (mi, ei) =
        found.ok_or_else(|| err("CORE_NULLABILITY_MISSING", "Element identity is absent", ""))?;
    let element = copy(
        &get(&ms[mi], "elements")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    a.get(ei)
                } else {
                    None
                }
            })
            .unwrap(),
        ctx,
    )?;
    Ok(Located {
        target: copy(&source, ctx)?,
        source,
        element,
        mi,
        ei,
        path: format!("/modules/{mi}/elements/{ei}/nullability"),
    })
}
fn set_nullability(
    target: &mut Value,
    mi: usize,
    ei: usize,
    nullability: Option<Value>,
) -> Result<(), EngineError> {
    let modules = match target {
        Value::Object(m) => m
            .iter_mut()
            .find(|(x, _)| x == &k("modules"))
            .and_then(|(_, v)| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            }),
        _ => None,
    }
    .ok_or_else(|| err("CORE_NULLABILITY_SOURCE", "Missing modules", "/modules"))?;
    let element = modules
        .get_mut(mi)
        .and_then(|m| {
            if let Value::Object(m) = m {
                m.iter_mut()
                    .find(|(x, _)| x == &k("elements"))
                    .and_then(|(_, v)| {
                        if let Value::Array(a) = v {
                            a.get_mut(ei)
                        } else {
                            None
                        }
                    })
            } else {
                None
            }
        })
        .ok_or_else(|| {
            err(
                "CORE_NULLABILITY_SOURCE",
                "Missing selected element",
                "/modules",
            )
        })?;
    let fields = match element {
        Value::Object(m) => m,
        _ => {
            return Err(err(
                "CORE_NULLABILITY_SOURCE",
                "Expected element object",
                "",
            ));
        }
    };
    if let Some(i) = fields.iter().position(|(x, _)| x == &k("nullability")) {
        if let Some(v) = nullability {
            fields[i].1 = v
        } else {
            fields.remove(i);
        }
    } else if let Some(v) = nullability {
        fields.push((k("nullability"), v))
    }
    Ok(())
}
pub fn inspect_core_nullability(
    input: &Value,
    id: &Identity,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let f = locate(input, id, engine, registry, caps, ctx)?;
    let meaning = match get(&f.element, "nullability") {
        None => obj(vec![(
            "state",
            t(
                if s(get(&f.element, "kind").unwrap_or(&Value::Null)).as_deref() == Some("field") {
                    "missing"
                } else {
                    "inapplicable"
                },
            ),
        )]),
        Some(Value::String(raw)) => match raw.to_utf8() {
            Ok(v) if NULLABILITIES.contains(&v.as_str()) => {
                obj(vec![("state", t("known")), ("nullability", t(&v))])
            }
            _ => obj(vec![
                ("state", t("unknown")),
                ("value", Value::String(raw.clone())),
            ]),
        },
        Some(_) => obj(vec![("state", t("missing"))]),
    };
    let r = obj(vec![
        ("operation", t("inspect-core-nullability")),
        ("version", t("7.0.0")),
        ("source", f.source),
        (
            "identity",
            obj(vec![
                ("module", Value::String(id.module.clone())),
                ("element", Value::String(id.element.clone())),
            ]),
        ),
        ("path", t(&f.path)),
        ("meaning", meaning),
        ("provenance", t("unverified")),
    ]);
    validate_op(&r, INSPECTION_SCHEMA, ctx, "CORE_NULLABILITY_RESULT")?;
    Ok(r)
}
pub fn declare_core_nullability(
    input: &Value,
    id: &Identity,
    nullability: &str,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut f = locate(input, id, engine, registry, caps, ctx)?;
    if s(get(&f.source, "umf").unwrap_or(&Value::Null)).as_deref() != Some("0.10.0") {
        return Err(err(
            "CORE_NULLABILITY_VERSION",
            "Current core 0.10.0 source required",
            "",
        ));
    }
    if s(get(&f.element, "kind").unwrap_or(&Value::Null)).as_deref() != Some("field") {
        return Err(err(
            "CORE_NULLABILITY_ROLE",
            "Availability applies only to an explicit Field",
            &f.path,
        ));
    }
    if !NULLABILITIES.contains(&nullability) {
        return Err(err(
            "CORE_NULLABILITY_VALUE",
            "Expected required, absent-allowed or unspecified",
            &f.path,
        ));
    }
    if get(&f.element, "nullability")
        .is_some_and(|v| s(v).is_none_or(|x| !NULLABILITIES.contains(&x.as_str())))
    {
        return Err(err(
            "CORE_NULLABILITY_UNKNOWN",
            "Unknown nullability cannot be overwritten by this operation",
            &f.path,
        ));
    }
    set_nullability(&mut f.target, f.mi, f.ei, Some(t(nullability)))?;
    validate_doc(
        &f.target,
        engine,
        registry,
        caps,
        ctx,
        "CORE_NULLABILITY_CONFLICT",
        &f.path,
    )?;
    let r = obj(vec![
        ("operation", t("declare-core-nullability")),
        ("version", t("5.0.0")),
        ("source", f.source),
        ("target", f.target),
        (
            "identity",
            obj(vec![
                ("module", Value::String(id.module.clone())),
                ("element", Value::String(id.element.clone())),
            ]),
        ),
        (
            "provenance",
            obj(vec![
                ("origin", t("authored")),
                ("idealPath", t(&f.path)),
                ("nullability", t(nullability)),
                (
                    "binding",
                    obj(vec![
                        ("id", t("umf.core.nullability.authoring")),
                        ("version", t("5.0.0")),
                    ]),
                ),
                ("basis", t("explicit-author-declaration")),
                ("nativePath", Value::Null),
            ]),
        ),
    ]);
    validate_op(&r, DECLARATION_SCHEMA, ctx, "CORE_NULLABILITY_RESULT")?;
    Ok(r)
}
fn canonical(v: &Value, ctx: &mut Context<'_>, depth: usize) -> Result<Value, EngineError> {
    if depth > ctx.limits().max_depth {
        return Err(err(
            "LIMIT",
            "Nullability canonicalization depth exceeded",
            "",
        ));
    }
    ctx.charge_work(1, Utf16::default())?;
    match v {
        Value::Array(a) => Ok(Value::Array(
            a.iter()
                .map(|x| canonical(x, ctx, depth + 1))
                .collect::<Result<_, _>>()?,
        )),
        Value::Object(m) => {
            let comparisons = (m.len() as u64)
                .saturating_mul((usize::BITS - m.len().max(1).leading_zeros()) as u64 + 1);
            let max_key_units = m.iter().map(|(key, _)| key.len() as u64).max().unwrap_or(0);
            ctx.charge_work_u64(
                comparisons.saturating_mul(max_key_units.max(1)),
                Utf16::default(),
            )?;
            let mut m = m
                .iter()
                .map(|(a, b)| Ok((a.clone(), canonical(b, ctx, depth + 1)?)))
                .collect::<Result<Vec<_>, EngineError>>()?;
            m.sort_by(|a, b| a.0.cmp(&b.0));
            Ok(Value::Object(m))
        }
        _ => copy(v, ctx),
    }
}
pub fn verify_core_nullability_declaration(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let r = copy(receipt, ctx)?;
    let current = copy(current, ctx)?;
    if s(get(&r, "operation").unwrap_or(&Value::Null)).as_deref()
        != Some("declare-core-nullability")
        || s(get(&r, "version").unwrap_or(&Value::Null)).as_deref() != Some("5.0.0")
    {
        return Err(err(
            "CORE_NULLABILITY_RECEIPT",
            "Malformed nullability declaration",
            "",
        ));
    }
    if let Err(error) = validate_op(&r, DECLARATION_SCHEMA, ctx, "CORE_NULLABILITY_RECEIPT") {
        if error.is_control_failure() || error.code == "LIMIT" {
            return Err(error);
        }
        return Err(err(
            "CORE_NULLABILITY_RECEIPT",
            "Malformed nullability declaration",
            "",
        ));
    }
    for name in ["source", "target"] {
        if let Err(error) = validate_doc(
            get(&r, name).expect("validated declaration has source and target"),
            engine,
            registry,
            caps,
            ctx,
            "CORE_NULLABILITY_RECEIPT",
            "",
        ) {
            if error.is_control_failure() || error.code == "LIMIT" {
                return Err(error);
            }
            return Err(err(
                "CORE_NULLABILITY_RECEIPT",
                "Malformed nullability declaration",
                "",
            ));
        }
    }
    let src = get(&r, "source").unwrap();
    let ident = get(&r, "identity").unwrap();
    let id = Identity {
        module: get(ident, "module")
            .and_then(raw_string)
            .unwrap_or_default(),
        element: get(ident, "element")
            .and_then(raw_string)
            .unwrap_or_default(),
    };
    let nullability = get(get(&r, "provenance").unwrap(), "nullability")
        .and_then(s)
        .unwrap_or_default();
    let expected = declare_core_nullability(src, &id, &nullability, engine, registry, caps, ctx)?;
    if canonical(&r, ctx, 0)? != canonical(&expected, ctx, 0)? {
        return Err(err(
            "CORE_NULLABILITY_RECEIPT",
            "Declaration does not match its archived input",
            "",
        ));
    }
    if canonical(&current, ctx, 0)? != canonical(get(&r, "target").unwrap(), ctx, 0)? {
        return Err(err(
            "CORE_NULLABILITY_STALE",
            "Document changed since nullability was declared",
            "",
        ));
    }
    Ok(r)
}

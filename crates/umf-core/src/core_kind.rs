//! Core Field/Record/Group inspection and explicit author declaration.
//! This module operates only on the retained core ideal; it performs no native classification.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    registry::Registry,
    value::{Utf16, Value, copy_completed_json_result, copy_json},
};

const INSPECTION_SCHEMA: &str = include_str!("../../../spec/core/kind-operation-v8.schema.json");
const DECLARATION_SCHEMA: &str = include_str!("../../../spec/core/kind-operation-v6.schema.json");
#[derive(Debug)]
pub struct OperationSchemas {
    inspection: crate::schema::CompiledSchema,
    declaration: crate::schema::CompiledSchema,
}
const KINDS: [&str; 3] = ["field", "record", "group"];
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
fn validate_op_with_schemas(
    value: &Value,
    schema_src: &str,
    ctx: &mut Context<'_>,
    code: &str,
    schemas: Option<&OperationSchemas>,
) -> Result<(), EngineError> {
    let prepared = if schema_src == INSPECTION_SCHEMA {
        schemas.map(|s| &s.inspection)
    } else if schema_src == DECLARATION_SCHEMA {
        schemas.map(|s| &s.declaration)
    } else {
        None
    };
    if let Some(schema) = prepared {
        return validate_compiled_op(value, schema, ctx, code);
    }
    let c = compile_operation_schema(schema_src, ctx)?;
    validate_compiled_op(value, &c, ctx, code)
}

pub fn prepare_operation_schemas(ctx: &mut Context<'_>) -> Result<OperationSchemas, EngineError> {
    Ok(OperationSchemas {
        inspection: compile_operation_schema(INSPECTION_SCHEMA, ctx)?,
        declaration: compile_operation_schema(DECLARATION_SCHEMA, ctx)?,
    })
}

fn compile_operation_schema(
    schema_src: &str,
    ctx: &mut Context<'_>,
) -> Result<crate::schema::CompiledSchema, EngineError> {
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
    let compiled = crate::schema::CompiledSchema::compile(
        &schema,
        &crate::schema::SchemaResources::default(),
        ctx,
    )?;
    Ok(compiled)
}

fn validate_compiled_op(
    value: &Value,
    c: &crate::schema::CompiledSchema,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
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
    element: Value,
    mi: usize,
    ei: usize,
    path: String,
}
fn locate_copied(
    source: Value,
    id: &Identity,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Located, EngineError> {
    if id.module.is_empty() || id.element.is_empty() {
        return Err(err(
            "CORE_KIND_IDENTITY",
            "Expected explicit module and element identities",
            "",
        ));
    }
    validate_doc(&source, engine, registry, caps, ctx, "CORE_KIND_SOURCE", "")?;
    ctx.charge_work(id.module.len() + id.element.len(), Utf16::default())?;
    let ms = match get(&source, "modules") {
        Some(Value::Array(a)) => a,
        _ => return Err(err("CORE_KIND_SOURCE", "Missing modules", "/modules")),
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
        found.ok_or_else(|| err("CORE_KIND_MISSING", "Element identity is absent", ""))?;
    let element = get(&ms[mi], "elements")
        .and_then(|v| if let Value::Array(a) = v { a.get(ei) } else { None })
        .expect("selected element index exists")
        .clone();
    Ok(Located {
        source,
        element,
        mi,
        ei,
        path: format!("/modules/{mi}/elements/{ei}/kind"),
    })
}
fn set_kind(
    target: &mut Value,
    mi: usize,
    ei: usize,
    kind: Option<Value>,
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
    .ok_or_else(|| err("CORE_KIND_SOURCE", "Missing modules", "/modules"))?;
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
        .ok_or_else(|| err("CORE_KIND_SOURCE", "Missing selected element", "/modules"))?;
    let fields = match element {
        Value::Object(m) => m,
        _ => return Err(err("CORE_KIND_SOURCE", "Expected element object", "")),
    };
    if let Some(i) = fields.iter().position(|(x, _)| x == &k("kind")) {
        if let Some(v) = kind {
            fields[i].1 = v
        } else {
            fields.remove(i);
        }
    } else if let Some(v) = kind {
        fields.push((k("kind"), v))
    }
    Ok(())
}
pub fn inspect_core_kind(
    input: &Value,
    id: &Identity,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy(input, ctx)?;
    inspect_core_kind_copied(source, id, engine, registry, caps, ctx)
}

/// Inspect a source that was already admitted by a host-JSON reflection boundary.
pub fn inspect_core_kind_copied(
    source: Value,
    id: &Identity,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    inspect_core_kind_copied_inner(source, id, engine, registry, caps, ctx, None)
}

pub fn inspect_core_kind_copied_prepared(
    source: Value,
    id: &Identity,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    schemas: &OperationSchemas,
) -> Result<Value, EngineError> {
    inspect_core_kind_copied_inner(source, id, engine, registry, caps, ctx, Some(schemas))
}

fn inspect_core_kind_copied_inner(
    source: Value,
    id: &Identity,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    schemas: Option<&OperationSchemas>,
) -> Result<Value, EngineError> {
    let f = locate_copied(source, id, engine, registry, caps, ctx)?;
    let meaning = match get(&f.element, "kind") {
        None => obj(vec![("state", t("unspecified"))]),
        Some(Value::String(raw)) => match raw.to_utf8() {
            Ok(v) if KINDS.contains(&v.as_str()) => {
                obj(vec![("state", t("known")), ("kind", t(&v))])
            }
            _ => obj(vec![
                ("state", t("unknown")),
                ("value", Value::String(raw.clone())),
            ]),
        },
        Some(_) => obj(vec![("state", t("unspecified"))]),
    };
    let r = obj(vec![
        ("operation", t("inspect-core-kind")),
        ("version", t("8.0.0")),
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
    let r = copy_completed_json_result(&r, ctx)?;
    validate_op_with_schemas(&r, INSPECTION_SCHEMA, ctx, "CORE_KIND_RESULT", schemas)?;
    Ok(r)
}
pub fn declare_core_kind(
    input: &Value,
    id: &Identity,
    kind: &str,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy(input, ctx)?;
    declare_core_kind_copied(source, id, kind, engine, registry, caps, ctx)
}

/// Declare against a source that was already admitted by a host-JSON boundary.
pub fn declare_core_kind_copied(
    source: Value,
    id: &Identity,
    kind: &str,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    declare_core_kind_copied_with_request(source, id, || Ok(Some(kind.to_owned())), engine, registry, caps, ctx)
}

/// Host variant that asks for the enum value only after source/version admission.
pub fn declare_core_kind_copied_with_request<F>(
    source: Value,
    id: &Identity,
    request: F,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError>
where
    F: FnOnce() -> Result<Option<String>, EngineError>,
{
    declare_core_kind_copied_with_request_inner(source, id, request, engine, registry, caps, ctx, None)
}

pub fn declare_core_kind_copied_with_request_prepared<F>(
    source: Value,
    id: &Identity,
    request: F,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    schemas: &OperationSchemas,
) -> Result<Value, EngineError>
where
    F: FnOnce() -> Result<Option<String>, EngineError>,
{
    declare_core_kind_copied_with_request_inner(source, id, request, engine, registry, caps, ctx, Some(schemas))
}

fn declare_core_kind_copied_with_request_inner<F>(
    source: Value,
    id: &Identity,
    request: F,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    schemas: Option<&OperationSchemas>,
) -> Result<Value, EngineError>
where
    F: FnOnce() -> Result<Option<String>, EngineError>,
{
    let f = locate_copied(source, id, engine, registry, caps, ctx)?;
    if s(get(&f.source, "umf").unwrap_or(&Value::Null)).as_deref() != Some("0.10.0") {
        return Err(err(
            "CORE_KIND_VERSION",
            "Current core 0.10.0 source required",
            "",
        ));
    }
    let kind = request()?.unwrap_or_default();
    if !KINDS.contains(&kind.as_str()) {
        return Err(err(
            "CORE_KIND_VALUE",
            "Expected field, record or group",
            &f.path,
        ));
    }
    let mut target = copy(&f.source, ctx)?;
    if get(&f.element, "kind").is_some_and(|v| s(v).is_none_or(|x| !KINDS.contains(&x.as_str()))) {
        return Err(err(
            "CORE_KIND_UNKNOWN",
            "Unknown kind cannot be overwritten by this operation",
            &f.path,
        ));
    }
    set_kind(&mut target, f.mi, f.ei, Some(t(&kind)))?;
    validate_doc(
        &target,
        engine,
        registry,
        caps,
        ctx,
        "CORE_KIND_CONFLICT",
        &f.path,
    )?;
    let r = obj(vec![
        ("operation", t("declare-core-kind")),
        ("version", t("6.0.0")),
        ("source", f.source),
        ("target", target),
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
                ("kind", t(&kind)),
                (
                    "binding",
                    obj(vec![
                        ("id", t("umf.core.kind.authoring")),
                        ("version", t("6.0.0")),
                    ]),
                ),
                ("basis", t("explicit-author-declaration")),
                ("nativePath", Value::Null),
            ]),
        ),
    ]);
    let r = copy_completed_json_result(&r, ctx)?;
    validate_op_with_schemas(&r, DECLARATION_SCHEMA, ctx, "CORE_KIND_RESULT", schemas)?;
    Ok(r)
}
fn canonical(v: &Value, ctx: &mut Context<'_>, depth: usize) -> Result<Value, EngineError> {
    if depth > ctx.limits().max_depth {
        return Err(err("LIMIT", "Kind canonicalization depth exceeded", ""));
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
pub fn verify_core_kind_declaration(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let r = copy(receipt, ctx)?;
    verify_core_kind_receipt(&r, engine, registry, caps, ctx)?;
    let current = copy(current, ctx)?;
    finish_core_kind_verification(r, current, ctx)
}

/// Validate and recompute a declaration receipt before admitting the current document.
/// Host bindings use this phase boundary to preserve predecessor admission order.
pub fn verify_core_kind_receipt(
    r: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    verify_core_kind_receipt_inner(r, engine, registry, caps, ctx, None)
}

pub fn verify_core_kind_receipt_prepared(
    r: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    schemas: &OperationSchemas,
) -> Result<(), EngineError> {
    verify_core_kind_receipt_inner(r, engine, registry, caps, ctx, Some(schemas))
}

fn verify_core_kind_receipt_inner(
    r: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    schemas: Option<&OperationSchemas>,
) -> Result<(), EngineError> {
    if s(get(&r, "operation").unwrap_or(&Value::Null)).as_deref() != Some("declare-core-kind")
        || s(get(&r, "version").unwrap_or(&Value::Null)).as_deref() != Some("6.0.0")
    {
        return Err(err("CORE_KIND_RECEIPT", "Malformed kind declaration", ""));
    }
    if let Err(error) = validate_op_with_schemas(&r, DECLARATION_SCHEMA, ctx, "CORE_KIND_RECEIPT", schemas) {
        if error.is_control_failure() || error.code == "LIMIT" {
            return Err(error);
        }
        return Err(err("CORE_KIND_RECEIPT", "Malformed kind declaration", ""));
    }
    for name in ["source", "target"] {
        if let Err(error) = validate_doc(
            get(&r, name).expect("validated declaration has source and target"),
            engine,
            registry,
            caps,
            ctx,
            "CORE_KIND_RECEIPT",
            "",
        ) {
            if error.is_control_failure() || error.code == "LIMIT" {
                return Err(error);
            }
            return Err(err("CORE_KIND_RECEIPT", "Malformed kind declaration", ""));
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
    let kind = get(get(&r, "provenance").unwrap(), "kind")
        .and_then(s)
        .unwrap_or_default();
    let expected = declare_core_kind(src, &id, &kind, engine, registry, caps, ctx)?;
    if canonical(&r, ctx, 0)? != canonical(&expected, ctx, 0)? {
        return Err(err(
            "CORE_KIND_RECEIPT",
            "Declaration does not match its archived input",
            "",
        ));
    }
    Ok(())
}

/// Compare a previously admitted current document with an already verified receipt.
pub fn finish_core_kind_verification(
    r: Value,
    current: Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if canonical(&current, ctx, 0)? != canonical(get(&r, "target").unwrap(), ctx, 0)? {
        return Err(err(
            "CORE_KIND_STALE",
            "Document changed since kind was declared",
            "",
        ));
    }
    Ok(r)
}

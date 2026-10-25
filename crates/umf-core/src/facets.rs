// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in core facet inspection and authored declaration operations.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    registry::Registry,
    schema::CompiledSchema,
    value::{Utf16, Value, copy_json},
};

const CURRENT: &str = "0.10.0";
const INSPECTION_SCHEMA: &str = include_str!("../../../spec/core/facet-operation-v5.schema.json");
const DECLARATION_SCHEMA: &str = include_str!("../../../spec/core/facet-operation-v3.schema.json");
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
    if let Value::Object(m) = v {
        m.iter().find(|(x, _)| x == &k(n)).map(|(_, v)| v)
    } else {
        None
    }
}
fn get_mut<'a>(v: &'a mut Value, n: &str) -> Option<&'a mut Value> {
    if let Value::Object(m) = v {
        m.iter_mut().find(|(x, _)| x == &k(n)).map(|(_, v)| v)
    } else {
        None
    }
}
fn string(v: Option<&Value>) -> Option<String> {
    match v {
        Some(Value::String(s)) => s.to_utf8().ok(),
        _ => None,
    }
}
fn err(c: &str, m: &str, p: &str) -> EngineError {
    EngineError::new(c, k(p), m)
}
fn copy(v: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
    copy_json(v, c)
}
fn diagnostic_message(
    diagnostics: &[crate::error::Diagnostic],
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    ctx.charge_work(diagnostics.len(), Utf16::default())?;
    let mut values = Vec::new();
    values.try_reserve_exact(diagnostics.len()).map_err(|_| {
        EngineError::new(
            "LIMIT",
            Utf16::default(),
            "Facet diagnostic allocation failed",
        )
    })?;
    for d in diagnostics {
        ctx.charge_work(
            d.code.len() + d.path.len() + d.message.len() + 1,
            d.path.clone(),
        )?;
        values.push(obj(vec![
            ("code", Value::String(d.code.clone())),
            ("path", Value::String(d.path.clone())),
            ("message", Value::String(d.message.clone())),
            (
                "severity",
                t(match d.severity {
                    crate::error::Severity::Error => "error",
                    crate::error::Severity::Warning => "warning",
                }),
            ),
        ]));
    }
    let values = Value::Array(values);
    crate::serialization::stringify_compact_metered(&values, ctx)
}
fn validate(
    v: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    code: &str,
    path: &str,
) -> Result<Vec<crate::error::Diagnostic>, EngineError> {
    let r = engine.validate_document(v, registry, caps, ctx)?;
    if r.valid {
        Ok(r.diagnostics)
    } else {
        Err(EngineError::new(
            code,
            k(path),
            diagnostic_message(&r.diagnostics, ctx)?,
        ))
    }
}
fn pointer_segment(
    path: &Utf16,
    segment: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let escaped_capacity = segment
        .len()
        .checked_mul(2)
        .and_then(|size| path.len().checked_add(size))
        .and_then(|size| size.checked_add(1))
        .ok_or_else(|| EngineError::new("LIMIT", path.clone(), "Facet pointer length overflow"))?;
    ctx.charge_work(escaped_capacity, Utf16::default())?;
    let mut units = Vec::new();
    units
        .try_reserve_exact(escaped_capacity)
        .map_err(|_| EngineError::new("LIMIT", path.clone(), "Facet pointer allocation failed"))?;
    units.extend_from_slice(path.units());
    units.push(b'/' as u16);
    for unit in segment.units() {
        match unit {
            0x7e => units.extend([0x7e, 0x30]),
            0x2f => units.extend([0x7e, 0x31]),
            unit => units.push(*unit),
        }
    }
    Ok(Utf16::new(units))
}
/// Retain unknown facet qualifiers in the returned source while validating the
/// known subset. The TypeScript inspector reports these as warning paths.
fn scrub_unknown_facets(
    source: &mut Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<Utf16>, EngineError> {
    let mut warnings = vec![];
    let Some(Value::Array(modules)) = get_mut(source, "modules") else {
        return Ok(warnings);
    };
    for (mi, module) in modules.iter_mut().enumerate() {
        ctx.charge_work(1, k("/modules"))?;
        let Some(Value::Array(elements)) = get_mut(module, "elements") else {
            continue;
        };
        for (ei, element) in elements.iter_mut().enumerate() {
            ctx.charge_work(1, k("/elements"))?;
            let length_unit_fallback =
                if string(get(element, "scalarType")).as_deref() == Some("binary") {
                    "byte"
                } else {
                    "unicode-scalar"
                };
            let Some(Value::Object(facets)) = get_mut(element, "facets") else {
                continue;
            };
            let base = Utf16::from(format!("/modules/{mi}/elements/{ei}/facets"));
            let old = std::mem::take(facets);
            let mut kept = vec![];
            for (name, mut value) in old {
                ctx.charge_work(name.len() + 1, base.clone())?;
                let path = pointer_segment(&base, &name, ctx)?;
                let allowed: &[&str] = if name == k("length") {
                    &["min", "max", "unit"]
                } else if name == k("integerWidth") {
                    &["bits", "signed"]
                } else if name == k("collectionSize") {
                    &["min", "max"]
                } else if name == k("range") {
                    &["min", "max", "minInclusive", "maxInclusive"]
                } else if name == k("precision") || name == k("scale") {
                    kept.push((name, value));
                    continue;
                } else {
                    warnings.push(path);
                    continue;
                };
                if name == k("length")
                    && matches!(get(&value,"unit"),Some(Value::String(u)) if ![k("unicode-scalar"),k("byte")].contains(u))
                {
                    warnings.push(pointer_segment(&path, &k("unit"), ctx)?);
                    if let Value::Object(length) = &mut value {
                        if let Some((_, old)) = length.iter_mut().find(|(key, _)| key == &k("unit"))
                        {
                            *old = t(length_unit_fallback);
                        }
                    }
                }
                if let Value::Object(nested) = &mut value {
                    ctx.charge_work(nested.len(), path.clone())?;
                    let mut retained = Vec::new();
                    retained.try_reserve_exact(nested.len()).map_err(|_| {
                        EngineError::new("LIMIT", path.clone(), "Facet qualifier allocation failed")
                    })?;
                    for (qualifier, qualifier_value) in std::mem::take(nested) {
                        ctx.charge_work(qualifier.len() + 1, path.clone())?;
                        let keep = allowed.iter().any(|known| qualifier == k(known));
                        if !keep {
                            warnings.push(pointer_segment(&path, &qualifier, ctx)?);
                        }
                        if keep {
                            retained.push((qualifier, qualifier_value));
                        }
                    }
                    *nested = retained;
                }
                kept.push((name, value));
            }
            *facets = kept;
        }
    }
    Ok(warnings)
}
fn locate(
    input: &Value,
    identity: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<(Value, Value, usize, usize, Value, String, Vec<Utf16>), EngineError> {
    let source = copy(input, ctx)?;
    let ident = copy(identity, ctx)?;
    let (module, element) = match (get(&ident, "module"), get(&ident, "element")) {
        (Some(Value::String(m)), Some(Value::String(e))) if !m.is_empty() && !e.is_empty() => {
            (m, e)
        }
        _ => {
            return Err(err(
                "CORE_FACET_IDENTITY",
                "Expected explicit module and element identities",
                "",
            ));
        }
    };
    if get(&ident, "module").is_none()
        || get(&ident, "element").is_none()
        || matches!(&ident,Value::Object(m) if m.len()!=2)
    {
        return Err(err(
            "CORE_FACET_IDENTITY",
            "Expected explicit module and element identities",
            "",
        ));
    }
    let mut admission = copy(&source, ctx)?;
    let unknown = scrub_unknown_facets(&mut admission, ctx)?;
    validate(&admission, engine, registry, caps, ctx, code, "")?;
    let found = {
        let modules = match get(&source, "modules") {
            Some(Value::Array(a)) => a,
            _ => return Err(err("CORE_FACET_MISSING", "Element identity is absent", "")),
        };
        let mut found = None;
        for (mi, m) in modules.iter().enumerate() {
            ctx.charge_work(1, k("/modules"))?;
            if !matches!(get(m, "id"), Some(Value::String(id)) if id == module) {
                continue;
            }
            if let Some(Value::Array(es)) = get(m, "elements") {
                for (ei, e) in es.iter().enumerate() {
                    ctx.charge_work(1, k("/elements"))?;
                    if matches!(get(e, "id"), Some(Value::String(id)) if id == element) {
                        found = Some((mi, ei));
                        break;
                    }
                }
            }
            if found.is_some() {
                break;
            }
        }
        found
    };
    if let Some((mi, ei)) = found {
        let e = match get(&source, "modules") {
            Some(Value::Array(modules)) => match modules.get(mi).and_then(|m| get(m, "elements")) {
                Some(Value::Array(elements)) => elements.get(ei),
                _ => None,
            },
            _ => None,
        }
        .ok_or_else(|| err("CORE_FACET_MISSING", "Element identity is absent", ""))?;
        let selected = copy(e, ctx)?;
        let path = format!("/modules/{mi}/elements/{ei}");
        return Ok((
            source,
            ident,
            mi,
            ei,
            selected,
            format!("{path}/facets"),
            unknown,
        ));
    }
    Err(err("CORE_FACET_MISSING", "Element identity is absent", ""))
}
fn canonical(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match v {
        Value::Array(a) => Ok(Value::Array(
            a.iter()
                .map(|x| canonical(x, ctx))
                .collect::<Result<_, _>>()?,
        )),
        Value::Object(m) => {
            let mut out = m
                .iter()
                .map(|(k, v)| Ok((k.clone(), canonical(v, ctx)?)))
                .collect::<Result<Vec<_>, EngineError>>()?;
            out.sort_by(|a, b| a.0.cmp(&b.0));
            Ok(Value::Object(out))
        }
        _ => copy(v, ctx),
    }
}
fn validate_result(
    value: &Value,
    engine: &Engine,
    schema_source: &str,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    let schema = crate::serialization::read_json_value(
        &schema_source.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        ctx,
    )?;
    let resources = engine.schema_resources_with_context(ctx)?;
    let compiled = CompiledSchema::compile(&schema, &resources, ctx)?;
    let errors = compiled.validate_codegen_errors(value, ctx)?;
    if errors.is_empty() {
        return Ok(());
    }
    let message = crate::serialization::stringify_compact_metered(
        &Value::Array(
            errors
                .into_iter()
                .map(|e| {
                    let raw_params = copy(&e.params, ctx)?;
                    let (params, message) = if e.keyword == "dependentRequired" {
                        let property = string(get(&raw_params, "property")).unwrap_or_default();
                        let missing =
                            string(get(&raw_params, "missingProperty")).unwrap_or_default();
                        (
                            obj(vec![
                                ("property", t(&property)),
                                ("missingProperty", t(&missing)),
                                ("depsCount", Value::Number(1.0)),
                                ("deps", t(&missing)),
                            ]),
                            Value::String(Utf16::from(format!(
                                "must have property {missing} when property {property} is present"
                            ))),
                        )
                    } else {
                        (raw_params, Value::String(e.message))
                    };
                    Ok(obj(vec![
                        ("instancePath", Value::String(e.instance_path)),
                        ("schemaPath", Value::String(e.schema_path)),
                        ("keyword", t(&e.keyword)),
                        ("params", params),
                        ("message", message),
                    ]))
                })
                .collect::<Result<Vec<_>, EngineError>>()?,
        ),
        ctx,
    )?;
    Err(EngineError::new(code, Utf16::default(), message))
}
fn validate_request(
    value: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let full = crate::serialization::read_json_value(
        &DECLARATION_SCHEMA.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        ctx,
    )?;
    let defs = copy(
        get(&full, "$defs").ok_or_else(|| {
            err(
                "CORE_FACET_REQUEST",
                "Facet request schema is unavailable",
                "",
            )
        })?,
        ctx,
    )?;
    let schema = obj(vec![
        ("$schema", t("https://json-schema.org/draft/2020-12/schema")),
        ("$defs", defs),
        ("$ref", t("#/$defs/request")),
    ]);
    let resources = engine.schema_resources_with_context(ctx)?;
    let compiled = CompiledSchema::compile(&schema, &resources, ctx)?;
    let errors = compiled.validate_codegen_errors(value, ctx)?;
    if errors.is_empty() {
        return Ok(());
    }
    let message = crate::serialization::stringify_compact_metered(
        &Value::Array(
            errors
                .into_iter()
                .map(|e| {
                    let raw_params = copy(&e.params, ctx)?;
                    let (params, message) = if e.keyword == "dependentRequired" {
                        let property = string(get(&raw_params, "property")).unwrap_or_default();
                        let missing =
                            string(get(&raw_params, "missingProperty")).unwrap_or_default();
                        (
                            obj(vec![
                                ("property", t(&property)),
                                ("missingProperty", t(&missing)),
                                ("depsCount", Value::Number(1.0)),
                                ("deps", t(&missing)),
                            ]),
                            Value::String(Utf16::from(format!(
                                "must have property {missing} when property {property} is present"
                            ))),
                        )
                    } else {
                        (raw_params, Value::String(e.message))
                    };
                    Ok(obj(vec![
                        ("instancePath", Value::String(e.instance_path)),
                        ("schemaPath", Value::String(e.schema_path)),
                        ("keyword", t(&e.keyword)),
                        ("params", params),
                        ("message", message),
                    ]))
                })
                .collect::<Result<Vec<_>, EngineError>>()?,
        ),
        ctx,
    )?;
    Err(EngineError::new(
        "CORE_FACET_REQUEST",
        Utf16::default(),
        message,
    ))
}

/// Copy and schema-check a facet request before host adapters admit later
/// arguments, matching the TypeScript operation's observable copy order.
pub fn admit_core_facet_request(
    request: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let request = copy(request, ctx)?;
    validate_request(&request, engine, ctx)?;
    Ok(request)
}
fn facet_meaning(
    element: &Value,
    path: &str,
    unknown: &[Utf16],
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let Some(facets) = get(element, "facets") else {
        return Ok(obj(vec![(
            "state",
            t(
                if string(get(element, "kind")).as_deref() == Some("field") {
                    "missing"
                } else {
                    "inapplicable"
                },
            ),
        )]));
    };
    if !matches!(facets, Value::Object(_)) {
        return Ok(obj(vec![("state", t("missing"))]));
    }
    let mut interpreted = vec![];
    if let Some(length) = get(facets, "length") {
        if let Some(unit) = string(get(length, "unit")) {
            if ["unicode-scalar", "byte"].contains(&unit.as_str()) {
                let mut bounds = vec![];
                for name in ["min", "max"] {
                    if let Some(v) = get(length, name) {
                        bounds.push((k(name), copy(v, ctx)?))
                    }
                }
                bounds.push((k("unit"), t(&unit)));
                interpreted.push((k("length"), Value::Object(bounds)))
            }
        }
    }
    if let Some(width) = get(facets, "integerWidth") {
        if let (Some(bits), Some(signed)) = (get(width, "bits"), get(width, "signed")) {
            interpreted.push((
                k("integerWidth"),
                obj(vec![
                    ("bits", copy(bits, ctx)?),
                    ("signed", copy(signed, ctx)?),
                ]),
            ))
        }
    }
    if let (Some(precision), Some(scale)) = (get(facets, "precision"), get(facets, "scale")) {
        interpreted.push((k("precision"), copy(precision, ctx)?));
        interpreted.push((k("scale"), copy(scale, ctx)?))
    }
    for (group, keys) in [
        ("collectionSize", &["min", "max"][..]),
        ("range", &["min", "max", "minInclusive", "maxInclusive"][..]),
    ] {
        if let Some(Value::Object(raw)) = get(facets, group) {
            let mut selected = vec![];
            for name in keys {
                if let Some(value) = raw.iter().find(|(n, _)| n == &k(name)).map(|(_, v)| v) {
                    selected.push((k(name), copy(value, ctx)?))
                }
            }
            interpreted.push((k(group), Value::Object(selected)))
        }
    }
    interpreted.sort_by(|a, b| a.0.cmp(&b.0));
    let prefix = Utf16::from(format!("{path}/"));
    let mut uninterpreted = vec![];
    for p in unknown {
        ctx.charge_work(p.len() + 1, k(path))?;
        if p.units().starts_with(prefix.units()) {
            uninterpreted.push(Value::String(p.clone()));
        }
    }
    Ok(obj(vec![
        (
            "state",
            t(if uninterpreted.is_empty() {
                "known"
            } else {
                "partial"
            }),
        ),
        ("facets", copy(facets, ctx)?),
        ("interpreted", Value::Object(interpreted)),
        ("uninterpretedPaths", Value::Array(uninterpreted)),
    ]))
}
pub fn inspect_core_facets(
    input: &Value,
    identity: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (source, identity, _mi, _ei, e, path, unknown) = locate(
        input,
        identity,
        engine,
        registry,
        caps,
        ctx,
        "CORE_FACET_SOURCE",
    )?;
    let meaning = facet_meaning(&e, &path, &unknown, ctx)?;
    let result = obj(vec![
        ("operation", t("inspect-core-facets")),
        ("version", t("5.0.0")),
        ("source", source),
        ("identity", identity),
        ("path", t(&path)),
        ("meaning", meaning),
        ("provenance", t("unverified")),
    ]);
    validate_result(&result, engine, INSPECTION_SCHEMA, ctx, "CORE_FACET_RESULT")?;
    Ok(result)
}
pub fn declare_core_facets(
    input: &Value,
    identity: &Value,
    request: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let request = copy(request, ctx)?;
    validate_request(&request, engine, ctx)?;
    let fields = match &request {
        Value::Object(v) => v,
        _ => return Err(err("CORE_FACET_REQUEST", "Invalid facet patch", "")),
    };
    let (source, identity, mi, ei, e, path, _unknown) = locate(
        input,
        identity,
        engine,
        registry,
        caps,
        ctx,
        "CORE_FACET_SOURCE",
    )?;
    if string(get(&source, "umf")).as_deref() != Some(CURRENT) {
        return Err(err(
            "CORE_FACET_VERSION",
            "Current core 0.10.0 source required",
            "",
        ));
    }
    if string(get(&e, "kind")).as_deref() != Some("field") {
        return Err(err(
            "CORE_FACET_ROLE",
            "Facets apply only to a Field",
            &path,
        ));
    }
    if get(&request, "length").is_some() {
        if let Some(length) = get(&e, "facets").and_then(|x| get(x, "length")) {
            if !["unicode-scalar", "byte"]
                .contains(&string(get(length, "unit")).unwrap_or_default().as_str())
            {
                return Err(err(
                    "CORE_FACET_UNKNOWN",
                    "Unknown length unit cannot be overwritten",
                    &format!("{path}/length/unit"),
                ));
            }
        }
    }
    let mut target = copy(&source, ctx)?;
    let modules = match &mut target {
        Value::Object(m) => m
            .iter_mut()
            .find(|(n, _)| n == &k("modules"))
            .map(|(_, v)| v),
        _ => None,
    }
    .ok_or_else(|| err("CORE_FACET_MISSING", "Modules absent", ""))?;
    if let Value::Array(ms) = modules {
        if let Some(Value::Array(es)) = ms.get_mut(mi).and_then(|m| match m {
            Value::Object(v) => v
                .iter_mut()
                .find(|(n, _)| n == &k("elements"))
                .map(|(_, v)| v),
            _ => None,
        }) {
            if let Some(Value::Object(ef)) = es.get_mut(ei) {
                let facet_index = ef.iter().position(|(n, _)| n == &k("facets"));
                let mut facets = facet_index
                    .map(|i| std::mem::replace(&mut ef[i].1, obj(vec![])))
                    .unwrap_or_else(|| obj(vec![]));
                if let Value::Object(f) = &mut facets {
                    for (n, v) in fields {
                        ctx.charge_work(n.len() + 1, k("/facets"))?;
                        let name = n.to_utf8().unwrap_or_default();
                        if name == "integerWidth" || name == "length" {
                            if let Some(Value::Object(old)) =
                                f.iter_mut().find(|(x, _)| x == n).map(|(_, v)| v)
                            {
                                if let Value::Object(new) = v {
                                    for (k, v) in new {
                                        ctx.charge_work(k.len() + 1, Utf16::from(path.as_str()))?;
                                        if let Some((_, x)) = old.iter_mut().find(|(a, _)| a == k) {
                                            *x = copy(v, ctx)?
                                        } else {
                                            old.push((k.clone(), copy(v, ctx)?))
                                        }
                                    }
                                }
                            } else {
                                f.push((n.clone(), copy(v, ctx)?))
                            }
                        } else if let Some((_, x)) = f.iter_mut().find(|(a, _)| a == n) {
                            *x = copy(v, ctx)?
                        } else {
                            f.push((n.clone(), copy(v, ctx)?))
                        }
                    }
                }
                if let Some(i) = facet_index {
                    ef[i].1 = facets
                } else {
                    ef.push((k("facets"), facets))
                }
            }
        }
    }
    let mut admission = copy(&target, ctx)?;
    scrub_unknown_facets(&mut admission, ctx)?;
    validate(
        &admission,
        engine,
        registry,
        caps,
        ctx,
        "CORE_FACET_CONFLICT",
        &path,
    )?;
    let result = obj(vec![
        ("operation", t("declare-core-facets")),
        ("version", t("3.0.0")),
        ("source", source),
        ("target", target),
        ("identity", identity),
        ("request", request),
        (
            "provenance",
            obj(vec![
                ("origin", t("authored")),
                ("idealPath", t(&path)),
                (
                    "binding",
                    obj(vec![
                        ("id", t("umf.core.facets.authoring")),
                        ("version", t("3.0.0")),
                    ]),
                ),
                ("basis", t("explicit-author-declaration")),
                ("nativePath", Value::Null),
            ]),
        ),
    ]);
    validate_result(
        &result,
        engine,
        DECLARATION_SCHEMA,
        ctx,
        "CORE_FACET_RESULT",
    )?;
    Ok(result)
}
pub fn verify_core_facet_declaration(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let prepared = prepare_core_facet_verification(receipt, engine, registry, caps, ctx)?;
    finish_verified_facet_current(prepared, current, ctx)
}

/// Rust-owned receipt admission/recomputation phase. The host retains the
/// returned value privately until it has copied the later `current` argument.
pub fn prepare_core_facet_verification(
    receipt: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = copy(receipt, ctx)?;
    let receipt_schema = if string(get(&receipt, "version")).as_deref() == Some("5.0.0") {
        INSPECTION_SCHEMA
    } else {
        DECLARATION_SCHEMA
    };
    match validate_result(&receipt, engine, receipt_schema, ctx, "CORE_FACET_RECEIPT") {
        Ok(()) => {}
        Err(error) if error.code == "CORE_FACET_RECEIPT" => {
            return Err(err("CORE_FACET_RECEIPT", "Malformed facet declaration", ""));
        }
        Err(error) => return Err(error),
    }
    if string(get(&receipt, "operation")).as_deref() != Some("declare-core-facets")
        || string(get(&receipt, "version")).as_deref() != Some("3.0.0")
    {
        return Err(err("CORE_FACET_RECEIPT", "Malformed facet declaration", ""));
    }
    let expected = declare_core_facets(
        get(&receipt, "source").ok_or_else(|| err("CORE_FACET_RECEIPT", "Missing source", ""))?,
        get(&receipt, "identity")
            .ok_or_else(|| err("CORE_FACET_RECEIPT", "Missing identity", ""))?,
        get(&receipt, "request").ok_or_else(|| err("CORE_FACET_RECEIPT", "Missing request", ""))?,
        engine,
        registry,
        caps,
        ctx,
    )?;
    if canonical(&receipt, ctx)? != canonical(&expected, ctx)? {
        return Err(err(
            "CORE_FACET_RECEIPT",
            "Declaration differs from retained source/request",
            "",
        ));
    }

    Ok(receipt)
}

/// Finish after host admission. Recheck the receipt because this tagged-wire
/// operation is directly callable and cannot trust a caller-supplied handle.
pub fn finish_core_facet_verification(
    prepared: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = prepare_core_facet_verification(prepared, engine, registry, caps, ctx)?;
    finish_verified_facet_current(receipt, current, ctx)
}

/// Continue from a receipt already admitted in this invocation. This keeps
/// direct verification from charging the receipt recomputation twice, while
/// the public wire finish path still re-admits its untrusted prepared value.
fn finish_verified_facet_current(
    receipt: Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let current = copy(current, ctx)?;
    if canonical(get(&receipt, "target").unwrap_or(&Value::Null), ctx)? != canonical(&current, ctx)?
    {
        return Err(err(
            "CORE_FACET_STALE",
            "Document changed since facets were declared",
            "",
        ));
    }
    Ok(receipt)
}

/// Historical projection bridge; newer bounds refuse rather than disappear.
pub fn historical_core_facet_patch(
    input: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let value = copy(input, ctx)?;
    let full = crate::serialization::read_json_value(
        &INSPECTION_SCHEMA.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        ctx,
    )?;
    let defs = copy(
        get(&full, "$defs").ok_or_else(|| {
            err(
                "CORE_FACET_PROJECTION_INPUT",
                "Expected closed interpreted facet groups",
                "",
            )
        })?,
        ctx,
    )?;
    let bounds_schema = obj(vec![
        ("$schema", t("https://json-schema.org/draft/2020-12/schema")),
        ("$defs", defs),
        ("$ref", t("#/$defs/bounds")),
    ]);
    let resources = engine.schema_resources_with_context(ctx)?;
    let compiled = CompiledSchema::compile(&bounds_schema, &resources, ctx)?;
    if !compiled.validate_codegen_errors(&value, ctx)?.is_empty() {
        return Err(err(
            "CORE_FACET_PROJECTION_INPUT",
            "Expected closed interpreted facet groups",
            "",
        ));
    }
    if get(&value, "collectionSize").is_some()
        || get(&value, "range").is_some()
        || get(&value, "length")
            .is_some_and(|length| get(length, "min").is_some() || get(length, "max").is_none())
    {
        return Err(err(
            "CORE_FACET_PROJECTION_VERSION",
            "Historical facet projection cannot represent schema-properties bounds",
            "",
        ));
    }
    let mut patch = vec![];
    if let Some(length) = get(&value, "length") {
        patch.push((
            k("length"),
            obj(vec![
                ("max", copy(get(length, "max").unwrap(), ctx)?),
                ("unit", copy(get(length, "unit").unwrap(), ctx)?),
            ]),
        ))
    }
    if let Some(width) = get(&value, "integerWidth") {
        if !matches!(get(width,"bits"),Some(Value::Number(n)) if n.fract()==0.0&&*n>0.0)
            || !matches!(get(width, "signed"), Some(Value::Bool(_)))
        {
            return Err(err(
                "CORE_FACET_PROJECTION_INPUT",
                "Expected closed interpreted facet groups",
                "",
            ));
        }
        patch.push((k("integerWidth"), copy(width, ctx)?))
    }
    if let (Some(p), Some(s)) = (get(&value, "precision"), get(&value, "scale")) {
        if !matches!(p,Value::Number(n) if n.fract()==0.0&&*n>0.0)
            || !matches!(s,Value::Number(n) if n.fract()==0.0&&*n>=0.0)
        {
            return Err(err(
                "CORE_FACET_PROJECTION_INPUT",
                "Expected closed interpreted facet groups",
                "",
            ));
        }
        patch.push((k("precision"), copy(p, ctx)?));
        patch.push((k("scale"), copy(s, ctx)?))
    }
    Ok(Value::Object(patch))
}

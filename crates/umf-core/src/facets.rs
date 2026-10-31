// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in core facet inspection and authored declaration operations.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    registry::Registry,
    schema::CompiledSchema,
    value::{Utf16, Value},
};
use std::collections::HashSet;

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
    facet_copy_json(v, c)
}
/// Facet operations use the predecessor's visit-by-visit value ceiling so
/// output amplification reports the first offending child pointer. The
/// general value copier retains its historical parent-path diagnostics.
fn facet_copy_json(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    fn visit(
        value: &Value,
        ctx: &mut Context<'_>,
        path: &Utf16,
        depth: usize,
        count: &mut usize,
    ) -> Result<Value, EngineError> {
        ctx.charge_work(1, path.clone())?;
        *count = count.checked_add(1).ok_or_else(|| {
            EngineError::new("LIMIT", path.clone(), "JSON structural limit exceeded")
        })?;
        if *count > ctx.limits().max_values || depth > ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                path.clone(),
                "JSON structural limit exceeded",
            ));
        }
        match value {
            Value::Null => Ok(Value::Null),
            Value::Bool(value) => Ok(Value::Bool(*value)),
            Value::Number(value) => Value::number(*value, path.clone()),
            Value::String(value) => {
                ctx.charge_work(value.len(), path.clone())?;
                Ok(Value::String(value.clone()))
            }
            Value::Array(items) => {
                let mut copied = Vec::new();
                for (index, item) in items.iter().enumerate() {
                    let child = pointer_segment(path, &Utf16::from(index.to_string()), ctx)?;
                    reserve_input(&mut copied, 1, ctx, child.clone(), "Facet JSON array")?;
                    copied.push(visit(item, ctx, &child, depth + 1, count)?);
                }
                Ok(Value::Array(copied))
            }
            Value::Object(fields) => {
                let mut seen = HashSet::new();
                let mut copied = Vec::new();
                for (key, item) in fields {
                    ctx.charge_work(key.len(), path.clone())?;
                    let child = pointer_segment(path, key, ctx)?;
                    let requested = seen.len().checked_add(1).ok_or_else(|| {
                        EngineError::new("LIMIT", child.clone(), "JSON structural limit exceeded")
                    })?;
                    if requested > ctx.limits().max_values {
                        return Err(EngineError::new(
                            "LIMIT",
                            child,
                            "JSON structural limit exceeded",
                        ));
                    }
                    ctx.charge_work(1, path.clone())?;
                    seen.try_reserve(1).map_err(|_| {
                        EngineError::new("LIMIT", path.clone(), "Facet JSON key allocation failed")
                    })?;
                    if !seen.insert(key) {
                        return Err(EngineError::new(
                            "DUPLICATE_KEY",
                            path.clone(),
                            "Duplicate object key",
                        ));
                    }
                    reserve_input(&mut copied, 1, ctx, child.clone(), "Facet JSON object")?;
                    copied.push((key.clone(), visit(item, ctx, &child, depth + 1, count)?));
                }
                Ok(Value::Object(copied))
            }
        }
    }
    visit(value, ctx, &Utf16::default(), 0, &mut 0)
}
fn reserve_input<T>(
    values: &mut Vec<T>,
    additional: usize,
    ctx: &mut Context<'_>,
    path: Utf16,
    label: &str,
) -> Result<(), EngineError> {
    let requested = values.len().checked_add(additional).ok_or_else(|| {
        EngineError::new("LIMIT", path.clone(), format!("{label} length overflow"))
    })?;
    if requested > ctx.limits().max_values {
        return Err(EngineError::new(
            "LIMIT",
            path,
            format!("{label} exceeds the admitted value limit"),
        ));
    }
    ctx.charge_work(additional, path.clone())?;
    values
        .try_reserve(additional)
        .map_err(|_| EngineError::new("LIMIT", path, format!("{label} allocation failed")))
}
fn diagnostic_message(
    diagnostics: &[crate::error::Diagnostic],
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let mut values = Vec::new();
    reserve_input(
        &mut values,
        diagnostics.len(),
        ctx,
        Utf16::default(),
        "Facet diagnostic",
    )?;
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
    // The metamodel has two authored passes: unknown groups and
    // integer-width qualifiers are emitted while walking each element;
    // length/collection/range qualifiers and units are emitted later in fixed
    // group order. Preserve that phase and per-element ordering.
    let mut first_phase_warnings = Vec::new();
    let mut bounds_warnings = Vec::new();
    let Some(Value::Array(modules)) = get_mut(source, "modules") else {
        return Ok(Vec::new());
    };
    for (mi, module) in modules.iter_mut().enumerate() {
        ctx.charge_work(1, k("/modules"))?;
        let Some(Value::Array(elements)) = get_mut(module, "elements") else {
            continue;
        };
        for (ei, element) in elements.iter_mut().enumerate() {
            let mut element_groups = Vec::new();
            let mut element_width_qualifiers = Vec::new();
            let mut element_length_warnings = Vec::new();
            let mut element_collection_warnings = Vec::new();
            let mut element_range_warnings = Vec::new();
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
            let mut kept = Vec::new();
            reserve_input(&mut kept, old.len(), ctx, base.clone(), "Facet group")?;
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
                    reserve_input(&mut element_groups, 1, ctx, base.clone(), "Facet warning")?;
                    element_groups.push(path);
                    continue;
                };
                let unknown_length_unit = name == k("length")
                    && matches!(get(&value,"unit"),Some(Value::String(u)) if ![k("unicode-scalar"),k("byte")].contains(u));
                if unknown_length_unit {
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
                    reserve_input(
                        &mut retained,
                        nested.len(),
                        ctx,
                        path.clone(),
                        "Facet qualifier",
                    )?;
                    for (qualifier, qualifier_value) in std::mem::take(nested) {
                        ctx.charge_work(qualifier.len() + 1, path.clone())?;
                        let keep = allowed.iter().any(|known| qualifier == k(known));
                        if !keep {
                            let warning = pointer_segment(&path, &qualifier, ctx)?;
                            let warnings = if name == k("integerWidth") {
                                &mut element_width_qualifiers
                            } else if name == k("length") {
                                &mut element_length_warnings
                            } else if name == k("collectionSize") {
                                &mut element_collection_warnings
                            } else {
                                &mut element_range_warnings
                            };
                            reserve_input(warnings, 1, ctx, path.clone(), "Facet warning")?;
                            warnings.push(warning);
                        }
                        if keep {
                            retained.push((qualifier, qualifier_value));
                        }
                    }
                    *nested = retained;
                }
                if unknown_length_unit {
                    let warning = pointer_segment(&path, &k("unit"), ctx)?;
                    reserve_input(
                        &mut element_length_warnings,
                        1,
                        ctx,
                        path.clone(),
                        "Facet warning",
                    )?;
                    element_length_warnings.push(warning);
                }
                kept.push((name, value));
            }
            *facets = kept;
            reserve_input(
                &mut first_phase_warnings,
                element_groups.len() + element_width_qualifiers.len(),
                ctx,
                base,
                "Facet warning",
            )?;
            first_phase_warnings.extend(element_groups);
            first_phase_warnings.extend(element_width_qualifiers);
            let bounds_count = element_length_warnings.len()
                + element_collection_warnings.len()
                + element_range_warnings.len();
            reserve_input(
                &mut bounds_warnings,
                bounds_count,
                ctx,
                Utf16::default(),
                "Facet warning",
            )?;
            bounds_warnings.extend(element_length_warnings);
            bounds_warnings.extend(element_collection_warnings);
            bounds_warnings.extend(element_range_warnings);
        }
    }
    let mut warnings = first_phase_warnings;
    reserve_input(
        &mut warnings,
        bounds_warnings.len(),
        ctx,
        Utf16::default(),
        "Facet warning",
    )?;
    warnings.extend(bounds_warnings);
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
        Value::Array(a) => {
            let mut out = Vec::new();
            reserve_input(
                &mut out,
                a.len(),
                ctx,
                Utf16::default(),
                "Facet canonical array",
            )?;
            for value in a {
                out.push(canonical(value, ctx)?);
            }
            Ok(Value::Array(out))
        }
        Value::Object(m) => {
            let mut out = Vec::new();
            reserve_input(
                &mut out,
                m.len(),
                ctx,
                Utf16::default(),
                "Facet canonical object",
            )?;
            for (key, value) in m {
                out.push((key.clone(), canonical(value, ctx)?));
            }
            let levels = (usize::BITS - m.len().max(1).leading_zeros()) as u64;
            let sort_work = u64::try_from(m.len())
                .ok()
                .and_then(|length| length.checked_mul(levels))
                .ok_or_else(|| {
                    EngineError::new("LIMIT", Utf16::default(), "Facet sort work overflow")
                })?;
            ctx.charge_work_u64(sort_work, Utf16::default())?;
            out.sort_unstable_by(|a, b| a.0.cmp(&b.0));
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
    let mut error_values = Vec::new();
    reserve_input(
        &mut error_values,
        errors.len(),
        ctx,
        Utf16::default(),
        "Facet validation diagnostic",
    )?;
    for e in errors {
        let raw_params = copy(&e.params, ctx)?;
        let (params, message) = if e.keyword == "dependentRequired" {
            let property = string(get(&raw_params, "property")).unwrap_or_default();
            let missing = string(get(&raw_params, "missingProperty")).unwrap_or_default();
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
        error_values.push(obj(vec![
            ("instancePath", Value::String(e.instance_path)),
            ("schemaPath", Value::String(e.schema_path)),
            ("keyword", t(&e.keyword)),
            ("params", params),
            ("message", message),
        ]));
    }
    let message =
        crate::serialization::stringify_compact_metered(&Value::Array(error_values), ctx)?;
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
    let mut error_values = Vec::new();
    reserve_input(
        &mut error_values,
        errors.len(),
        ctx,
        Utf16::default(),
        "Facet request diagnostic",
    )?;
    for e in errors {
        let raw_params = copy(&e.params, ctx)?;
        let (params, message) = if e.keyword == "dependentRequired" {
            let property = string(get(&raw_params, "property")).unwrap_or_default();
            let missing = string(get(&raw_params, "missingProperty")).unwrap_or_default();
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
        error_values.push(obj(vec![
            ("instancePath", Value::String(e.instance_path)),
            ("schemaPath", Value::String(e.schema_path)),
            ("keyword", t(&e.keyword)),
            ("params", params),
            ("message", message),
        ]));
    }
    let message =
        crate::serialization::stringify_compact_metered(&Value::Array(error_values), ctx)?;
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
                for name in ["max", "min"] {
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
    let prefix = Utf16::from(format!("{path}/"));
    let mut uninterpreted = Vec::new();
    reserve_input(
        &mut uninterpreted,
        unknown.len(),
        ctx,
        k(path),
        "Uninterpreted facet path",
    )?;
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
    let _ = copy(&result, ctx)?;
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
                                            let copied = copy(v, ctx)?;
                                            reserve_input(
                                                old,
                                                1,
                                                ctx,
                                                Utf16::from(path.as_str()),
                                                "Facet qualifier merge",
                                            )?;
                                            old.push((k.clone(), copied))
                                        }
                                    }
                                }
                            } else {
                                let copied = copy(v, ctx)?;
                                reserve_input(f, 1, ctx, k("/facets"), "Facet group merge")?;
                                f.push((n.clone(), copied))
                            }
                        } else if let Some((_, x)) = f.iter_mut().find(|(a, _)| a == n) {
                            *x = copy(v, ctx)?
                        } else {
                            let copied = copy(v, ctx)?;
                            reserve_input(f, 1, ctx, k("/facets"), "Facet group merge")?;
                            f.push((n.clone(), copied))
                        }
                    }
                }
                if let Some(i) = facet_index {
                    ef[i].1 = facets
                } else {
                    reserve_input(ef, 1, ctx, Utf16::from(path.as_str()), "Facet target merge")?;
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
    // The TypeScript boundary copies the returned envelope after schema
    // construction and before schema validation. Preserve its visit-order
    // structural refusal and pointer.
    let _ = copy(&result, ctx)?;
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

#[cfg(test)]
mod resource_tests {
    use super::{facet_meaning, reserve_input, scrub_unknown_facets};
    use crate::{
        context::{Context, Limits, ResourceProfile},
        error::EngineError,
        value::Utf16,
    };

    #[test]
    fn input_vector_reservation_fails_closed_before_growth() {
        let limits = Limits {
            max_values: 0,
            ..Limits::ordinary()
        };
        let mut ctx = Context::with_limits(ResourceProfile::Cooperative, limits).unwrap();
        let mut values = Vec::<u8>::new();
        let error = reserve_input(
            &mut values,
            1,
            &mut ctx,
            Utf16::default(),
            "test facet vector",
        )
        .unwrap_err();
        assert_eq!(error.code, "LIMIT");
        assert!(values.is_empty());
        assert_eq!(ctx.charged_work(), 0);
    }

    #[test]
    fn input_vector_reservation_propagates_work_refusal_before_growth() {
        let mut meter = |_: usize| {
            Err(EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "meter",
            ))
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let mut values = Vec::<u8>::new();
        let error = reserve_input(
            &mut values,
            1,
            &mut ctx,
            Utf16::default(),
            "test facet vector",
        )
        .unwrap_err();
        assert_eq!(error.code, "RESOURCE_LIMIT");
        assert!(values.is_empty());
        assert_eq!(ctx.charged_work(), 1);
    }

    #[test]
    fn unknown_facet_warning_order_follows_metamodel_phases() {
        let element = |facets| super::obj(vec![("facets", super::obj(facets))]);
        let mut source = super::obj(vec![(
            "modules",
            super::Value::Array(vec![super::obj(vec![(
                "elements",
                super::Value::Array(vec![
                    element(vec![
                        (
                            "integerWidth",
                            super::obj(vec![("comparison", super::t("opaque"))]),
                        ),
                        ("futureA", super::obj(vec![])),
                        (
                            "length",
                            super::obj(vec![
                                ("futureLength", super::t("x")),
                                ("unit", super::t("futureUnit")),
                            ]),
                        ),
                        (
                            "collectionSize",
                            super::obj(vec![("futureCollection", super::t("x"))]),
                        ),
                        ("range", super::obj(vec![("futureRange", super::t("x"))])),
                    ]),
                    element(vec![
                        ("range", super::obj(vec![("futureRange", super::t("x"))])),
                        ("futureB", super::obj(vec![])),
                        (
                            "length",
                            super::obj(vec![
                                ("unit", super::t("otherUnit")),
                                ("futureLength", super::t("x")),
                            ]),
                        ),
                        (
                            "integerWidth",
                            super::obj(vec![("comparison", super::t("opaque"))]),
                        ),
                        (
                            "collectionSize",
                            super::obj(vec![("futureCollection", super::t("x"))]),
                        ),
                    ]),
                ]),
            )])]),
        )]);
        let mut ctx = Context::ordinary();
        let warnings = scrub_unknown_facets(&mut source, &mut ctx).unwrap();
        assert_eq!(
            warnings,
            vec![
                Utf16::from("/modules/0/elements/0/facets/futureA"),
                Utf16::from("/modules/0/elements/0/facets/integerWidth/comparison"),
                Utf16::from("/modules/0/elements/1/facets/futureB"),
                Utf16::from("/modules/0/elements/1/facets/integerWidth/comparison"),
                Utf16::from("/modules/0/elements/0/facets/length/futureLength"),
                Utf16::from("/modules/0/elements/0/facets/length/unit"),
                Utf16::from("/modules/0/elements/0/facets/collectionSize/futureCollection"),
                Utf16::from("/modules/0/elements/0/facets/range/futureRange"),
                Utf16::from("/modules/0/elements/1/facets/length/futureLength"),
                Utf16::from("/modules/0/elements/1/facets/length/unit"),
                Utf16::from("/modules/0/elements/1/facets/collectionSize/futureCollection"),
                Utf16::from("/modules/0/elements/1/facets/range/futureRange"),
            ]
        );
    }

    #[test]
    fn interpreted_facet_own_key_order_matches_typescript_predecessor() {
        let facets = super::obj(vec![
            (
                "length",
                super::obj(vec![
                    ("max", super::Value::Number(9.0)),
                    ("min", super::Value::Number(2.0)),
                    ("unit", super::t("byte")),
                ]),
            ),
            (
                "integerWidth",
                super::obj(vec![
                    ("bits", super::Value::Number(16.0)),
                    ("signed", super::Value::Bool(true)),
                ]),
            ),
            ("precision", super::Value::Number(10.0)),
            ("scale", super::Value::Number(2.0)),
            (
                "collectionSize",
                super::obj(vec![
                    ("max", super::Value::Number(8.0)),
                    ("min", super::Value::Number(1.0)),
                ]),
            ),
            (
                "range",
                super::obj(vec![
                    ("max", super::Value::Number(8.0)),
                    ("min", super::Value::Number(1.0)),
                ]),
            ),
        ]);
        let element = super::obj(vec![("facets", facets)]);
        let mut ctx = Context::ordinary();
        let meaning = facet_meaning(&element, "/modules/0/elements/0", &[], &mut ctx).unwrap();
        let interpreted = super::get(&meaning, "interpreted").unwrap();
        let keys = match interpreted {
            super::Value::Object(members) => members
                .iter()
                .map(|(key, _)| key.to_utf8().unwrap())
                .collect::<Vec<_>>(),
            _ => panic!("interpreted facets must remain an object"),
        };
        assert_eq!(
            keys,
            [
                "length",
                "integerWidth",
                "precision",
                "scale",
                "collectionSize",
                "range"
            ]
        );
        let length = super::get(interpreted, "length").unwrap();
        let length_keys = match length {
            super::Value::Object(members) => members
                .iter()
                .map(|(key, _)| key.to_utf8().unwrap())
                .collect::<Vec<_>>(),
            _ => panic!("length bounds must remain an object"),
        };
        assert_eq!(length_keys, ["max", "min", "unit"]);
    }
}

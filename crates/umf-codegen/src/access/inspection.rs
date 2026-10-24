// SPDX-License-Identifier: MIT OR Apache-2.0
//! Source-side access-view inspection shared by access admission and diffing.
//!
//! This is deliberately separate from package emission: it preserves authored
//! JSON values and reports contextual declaration diagnostics without claiming
//! native enforcement.

use std::collections::{BTreeMap, BTreeSet};

use umf_core::{
    Capabilities, CapabilityError, Context, Diagnostic, EngineError, Registry, SemanticContext,
    Severity, Utf16, Value,
};

use crate::{
    resources::CodegenEngine,
    value::{array_items, js_object_members, member, string_member},
};

#[derive(Clone, Debug, Default)]
pub(super) struct Inspection {
    pub records: Vec<Value>,
    pub diagnostics: Vec<Value>,
}

fn text(v: &Value) -> Option<String> {
    string(v).and_then(|s| s.to_utf8().ok())
}
fn string(v: &Value) -> Option<&Utf16> {
    if let Value::String(s) = v {
        Some(s)
    } else {
        None
    }
}
fn get(v: &Value, key: &str) -> Option<String> {
    member(v, key).and_then(text)
}
fn get_metered(v: &Value, key: &str, ctx: &mut Context<'_>) -> Result<Option<String>, EngineError> {
    let value = member(v, key);
    if let Some(Value::String(value)) = value {
        ctx.charge_work(value.len(), Utf16::default())?;
    }
    Ok(value.and_then(text))
}
fn array<'a>(v: &'a Value, key: &str) -> &'a [Value] {
    member(v, key).and_then(array_items).unwrap_or(&[])
}
fn object(v: &Value) -> Option<&[(Utf16, Value)]> {
    if let Value::Object(v) = v {
        Some(v)
    } else {
        None
    }
}
fn truth(v: &Value) -> bool {
    matches!(v, Value::Bool(true))
}
fn js_truth(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(value) => *value != 0.0 && !value.is_nan(),
        Value::String(value) => !value.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}
fn number(v: &Value) -> Option<f64> {
    if let Value::Number(n) = v {
        Some(*n)
    } else {
        None
    }
}
fn num_text(v: &Value) -> String {
    number(v)
        .map(|n| {
            if n.fract() == 0.0 {
                format!("{n:.0}")
            } else {
                n.to_string()
            }
        })
        .unwrap_or_default()
}
fn s(v: impl AsRef<str>) -> Value {
    Value::String(Utf16::from(v.as_ref()))
}
fn obj(v: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect())
}
fn arr(v: impl IntoIterator<Item = Value>) -> Value {
    Value::Array(v.into_iter().collect())
}
fn reference(v: &Value) -> Option<(Utf16, Utf16)> {
    let fields = object(v)?;
    if string_member(v, "module")?.is_empty()
        || string_member(v, "element")?.is_empty()
        || fields
            .iter()
            .any(|(k, _)| k != &Utf16::from("module") && k != &Utf16::from("element"))
    {
        return None;
    }
    Some((
        string_member(v, "module")?.clone(),
        string_member(v, "element")?.clone(),
    ))
}
fn ref_value(module: &Utf16, element: &Utf16) -> Value {
    obj([
        ("module", Value::String(module.clone())),
        ("element", Value::String(element.clone())),
    ])
}
fn ref_eq(v: &Value, module: &Utf16, element: &Utf16) -> bool {
    reference(v).is_some_and(|r| r == (module.clone(), element.clone()))
}
fn pointer_escape(value: &Utf16) -> Utf16 {
    let mut out = Vec::new();
    for u in value.units() {
        match u {
            0x7e => out.extend([b'~' as u16, b'0' as u16]),
            0x2f => out.extend([b'~' as u16, b'1' as u16]),
            x => out.push(*x),
        }
    }
    Utf16::new(out)
}
fn access_diag(code: &str, source: &Utf16, path: Utf16) -> Value {
    obj([
        ("code", s("ACCESS")),
        ("accessCode", s(code)),
        ("sourceId", Value::String(source.clone())),
        ("pointer", Value::String(path)),
        (
            "message",
            s(format!("Authored access declaration violates {code}")),
        ),
    ])
}
fn unknown_diag(source: &Utf16, path: Utf16) -> Value {
    obj([
        ("code", s("UNKNOWN_RELEVANT")),
        ("sourceId", Value::String(source.clone())),
        ("pointer", Value::String(path)),
        ("message", s("Selected access meaning is uninterpreted")),
    ])
}
fn push_access_diag(
    out: &mut Vec<Value>,
    code: &str,
    source: &Utf16,
    path: Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(
        source
            .len()
            .saturating_add(path.len())
            .saturating_add(code.len())
            .saturating_add(160),
        Utf16::default(),
    )?;
    out.push(access_diag(code, source, path));
    Ok(())
}
fn push_unknown_diag(
    out: &mut Vec<Value>,
    source: &Utf16,
    path: Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(
        source.len().saturating_add(path.len()).saturating_add(160),
        Utf16::default(),
    )?;
    out.push(unknown_diag(source, path));
    Ok(())
}
fn path(base: &str, segment: &Utf16) -> Utf16 {
    let mut out = Utf16::from(base).units().to_vec();
    out.push(b'/' as u16);
    out.extend(pointer_escape(segment).units());
    Utf16::new(out)
}
fn metered_path(
    base: &Utf16,
    segment: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    ctx.charge_work(
        base.len()
            .saturating_add(segment.len().saturating_mul(2))
            .saturating_add(1),
        Utf16::default(),
    )?;
    let mut out = base.units().to_vec();
    out.push(47);
    for (index, unit) in segment.units().iter().enumerate() {
        if index % 1024 == 0 {
            ctx.charge_work(1, Utf16::default())?;
        }
        match *unit {
            126 => out.extend([126, 48]),
            47 => out.extend([126, 49]),
            unit => out.push(unit),
        }
    }
    Ok(Utf16::new(out))
}
fn metered_raw_path(
    base: &Utf16,
    segment: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    ctx.charge_work(
        base.len().saturating_add(segment.len()).saturating_add(1),
        Utf16::default(),
    )?;
    let mut out = base.units().to_vec();
    out.push(47);
    out.extend_from_slice(segment.units());
    Ok(Utf16::new(out))
}
fn indexed(base: &str, index: usize) -> Utf16 {
    Utf16::from(format!("{base}/{index}"))
}
fn key_allowed(key: &Utf16, allowed: &[&str]) -> bool {
    allowed.iter().any(|name| key == &Utf16::from(*name))
}
fn only_keys(value: &Value, allowed: &[&str], ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    let Some(fields) = object(value) else {
        return Ok(false);
    };
    for (key, _) in fields {
        ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
        if !key_allowed(key, allowed) {
            return Ok(false);
        }
    }
    Ok(true)
}
fn javascript_ordered_value(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    match value {
        Value::Object(_) => {
            let members = js_object_members(value, ctx)?;
            let mut result = Vec::with_capacity(members.len());
            for (key, child) in members {
                ctx.charge_work(key.len(), Utf16::default())?;
                result.push((key.clone(), javascript_ordered_value(child, ctx)?));
            }
            Ok(Value::Object(result))
        }
        Value::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut result = Vec::with_capacity(items.len());
            for child in items {
                result.push(javascript_ordered_value(child, ctx)?);
            }
            Ok(Value::Array(result))
        }
        Value::String(value) => {
            ctx.charge_work(value.len(), Utf16::default())?;
            Ok(Value::String(value.clone()))
        }
        other => {
            ctx.charge_work(1, Utf16::default())?;
            Ok(other.clone())
        }
    }
}
fn find_module<'a>(doc: &'a Value, id: &Utf16) -> Option<(usize, &'a Value)> {
    array(doc, "modules")
        .iter()
        .enumerate()
        .find(|(_, m)| string_member(m, "id") == Some(id))
}
fn find_element<'a>(
    doc: &'a Value,
    module: &Utf16,
    id: &Utf16,
) -> Option<(usize, usize, &'a Value, &'a Value)> {
    let (mi, m) = find_module(doc, module)?;
    let (ei, e) = array(m, "elements")
        .iter()
        .enumerate()
        .find(|(_, e)| string_member(e, "id") == Some(id))?;
    Some((mi, ei, m, e))
}
fn find_element_metered<'a>(
    doc: &'a Value,
    module: &Utf16,
    id: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Option<(usize, usize, &'a Value, &'a Value)>, EngineError> {
    let mut found_module = None;
    for (mi, candidate) in array(doc, "modules").iter().enumerate() {
        ctx.charge_work(module.len().saturating_add(1), Utf16::default())?;
        if string_member(candidate, "id") == Some(module) {
            found_module = Some((mi, candidate));
            break;
        }
    }
    let Some((mi, candidate)) = found_module else {
        return Ok(None);
    };
    for (ei, element) in array(candidate, "elements").iter().enumerate() {
        ctx.charge_work(id.len().saturating_add(1), Utf16::default())?;
        if string_member(element, "id") == Some(id) {
            return Ok(Some((mi, ei, candidate, element)));
        }
    }
    Ok(None)
}
// A source document may encode a long collection chain with shallow JSON.
// Follow that graph iteratively; JSON admission depth does not bound its length.
fn metered_reference(
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<(Utf16, Utf16)>, EngineError> {
    let Some(fields) = object(value) else {
        return Ok(None);
    };
    let (mut module, mut element) = (None, None);
    let mut allowed = true;
    for (key, value) in fields {
        ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
        if key == &Utf16::from("module") {
            module = string(value);
        } else if key == &Utf16::from("element") {
            element = string(value);
        } else {
            allowed = false;
        }
    }
    let (Some(module), Some(element)) = (module, element) else {
        return Ok(None);
    };
    if !allowed || module.is_empty() || element.is_empty() {
        return Ok(None);
    }
    ctx.charge_work(module.len().saturating_add(element.len()), Utf16::default())?;
    Ok(Some((module.clone(), element.clone())))
}

fn collection_field<'a>(
    doc: &'a Value,
    module: &Utf16,
    id: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    for m in array(doc, "modules") {
        ctx.charge_work(module.len().saturating_add(1), Utf16::default())?;
        if string_member(m, "id") != Some(module) {
            continue;
        }
        for field in array(m, "elements") {
            ctx.charge_work(id.len().saturating_add(1), Utf16::default())?;
            if string_member(field, "id") == Some(id) {
                return Ok(Some(field));
            }
        }
        return Ok(None);
    }
    Ok(None)
}
fn collect_nested_fields(
    doc: &Value,
    start: (Utf16, Utf16),
    expected: &mut Vec<((Utf16, Utf16), bool)>,
    seen: &mut BTreeSet<(Utf16, Utf16)>,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let mut current = start;
    let mut nested = false;
    let mut stack = BTreeSet::new();
    loop {
        ctx.charge_work(
            current
                .0
                .len()
                .saturating_add(current.1.len())
                .saturating_mul(64)
                .saturating_add(1),
            Utf16::default(),
        )?;
        if !stack.insert(current.clone()) {
            return Ok(true);
        }
        let Some(field) = collection_field(doc, &current.0, &current.1, ctx)? else {
            return Ok(false);
        };
        if string_member(field, "kind") != Some(&Utf16::from("field")) {
            return Ok(false);
        }
        if seen.insert(current.clone()) {
            ctx.charge_work(
                current
                    .0
                    .len()
                    .saturating_add(current.1.len())
                    .saturating_mul(4)
                    .saturating_add(16),
                Utf16::default(),
            )?;
            expected.push((current.clone(), nested));
        } else if nested {
            for entry in expected.iter_mut() {
                ctx.charge_work(1, Utf16::default())?;
                if entry.0 == current {
                    entry.1 = true;
                    break;
                }
            }
        }
        let card = string_member(field, "cardinality");
        if card != Some(&Utf16::from("array")) && card != Some(&Utf16::from("map")) {
            return Ok(true);
        }
        let Some(next) = metered_reference(member(field, "itemType").unwrap_or(&Value::Null), ctx)?
        else {
            return Ok(false);
        };
        current = next;
        nested = true;
    }
}
fn value_ref(v: &Value) -> Option<(Utf16, Utf16)> {
    Some((
        string_member(v, "module")?.clone(),
        string_member(v, "element")?.clone(),
    ))
}
fn binding_pair(v: &Value) -> Option<(Utf16, Utf16)> {
    Some((
        string_member(v, "module")?.clone(),
        string_member(v, "element")?.clone(),
    ))
}
pub(super) fn core_validation(
    engine: &CodegenEngine<'_>,
    doc: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<umf_core::Diagnostic>, EngineError> {
    struct Empty;
    impl Capabilities for Empty {
        fn validate_extension(
            &mut self,
            _: u64,
            _: &Value,
            _: &umf_core::SemanticContext,
        ) -> Result<Vec<umf_core::Diagnostic>, Utf16> {
            Ok(Vec::new())
        }
    }
    let mut empty = Empty;
    Ok(engine
        .resources()
        .engine()
        .validate_document(doc, &Registry::new(), &mut empty, ctx)?
        .diagnostics)
}
fn keys_for_record<'a>(doc: &'a Value, module: &Utf16, element: &Utf16) -> &'a [Value] {
    let Some((_, _, _, record)) = find_element(doc, module, element) else {
        return &[];
    };
    array(record, "keys")
}
fn item_ref(doc: &Value, module: &Utf16, element: &Utf16) -> Option<(Utf16, Utf16)> {
    let (_, _, _, field) = find_element(doc, module, element)?;
    let card = get(field, "cardinality")?;
    if card == "array" || card == "map" {
        value_ref(member(field, "itemType")?)
    } else {
        None
    }
}
fn validate_nullable(
    engine: &CodegenEngine<'_>,
    doc: &Value,
    field: &Value,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let policy = engine.resources().engine().policy();
    Ok(umf_core::literal::literal_errors(doc, field, &Value::Null, true, policy, ctx)?.is_empty())
}
fn interpreted_facets(field: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let Some(facets) = member(field, "facets") else {
        return Ok(obj([]));
    };
    let mut out = Vec::new();
    if let Some(length) = member(facets, "length") {
        if let Some(Value::String(unit)) = member(length, "unit") {
            ctx.charge_work(unit.len(), Utf16::default())?;
        }
        if matches!(
            get(length, "unit").as_deref(),
            Some("unicode-scalar" | "byte")
        ) {
            let mut values = Vec::new();
            for k in ["max", "min", "unit"] {
                if let Some(v) = member(length, k) {
                    binding_value_work(v, ctx)?;
                    values.push((Utf16::from(k), v.clone()));
                }
            }
            out.push((Utf16::from("length"), Value::Object(values)));
        }
    }
    if let Some(width) = member(facets, "integerWidth") {
        let mut v = Vec::new();
        for k in ["bits", "signed"] {
            if let Some(x) = member(width, k) {
                binding_value_work(x, ctx)?;
                v.push((Utf16::from(k), x.clone()));
            }
        }
        out.push((Utf16::from("integerWidth"), Value::Object(v)));
    }
    if member(facets, "precision").is_some() {
        let mut v = Vec::new();
        for k in ["precision", "scale"] {
            if let Some(x) = member(facets, k) {
                binding_value_work(x, ctx)?;
                v.push((Utf16::from(k), x.clone()));
            }
        }
        out.extend(v);
    }
    for group in ["collectionSize", "range"] {
        if let Some(raw) = member(facets, group) {
            let allowed = if group == "range" {
                &["min", "max", "minInclusive", "maxInclusive"][..]
            } else {
                &["min", "max"][..]
            };
            let mut selected = Vec::new();
            for k in allowed {
                ctx.charge_work(1, Utf16::default())?;
                if let Some(v) = member(raw, k) {
                    binding_value_work(v, ctx)?;
                    selected.push((Utf16::from(*k), v.clone()));
                }
            }
            out.push((Utf16::from(group), Value::Object(selected)));
        }
    }
    Ok(Value::Object(out))
}
fn properties(field: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let mut result = Vec::new();
    for key in [
        "title",
        "aliases",
        "examples",
        "allowedValues",
        "default",
        "facets",
    ] {
        if let Some(value) = member(field, key) {
            binding_value_work(value, ctx)?;
            result.push((Utf16::from(key), value.clone()));
        }
    }
    Ok(Value::Object(result))
}
fn known_or_partial_facets(
    field: &Value,
    validation: &[umf_core::Diagnostic],
    base: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(Value, Vec<Value>), EngineError> {
    let mut unknown = Vec::new();
    for d in validation {
        ctx.charge_work(
            d.path.len().saturating_add(base.len()).saturating_add(10),
            Utf16::default(),
        )?;
        if d.severity != umf_core::Severity::Warning {
            continue;
        }
        let mut prefix = base.units().to_vec();
        prefix.extend(Utf16::from("/facets/").units());
        if d.path.units().starts_with(&prefix) {
            ctx.charge_work(d.path.len(), Utf16::default())?;
            unknown.push(Value::String(d.path.clone()));
        }
    }
    Ok((interpreted_facets(field, ctx)?, unknown))
}

/// Resolve the shared core meaning needed when access admission reaches a
/// referenced dependency Field. Partial facet paths are returned in source
/// validation order so callers can preserve their own diagnostic ordering.
pub(super) fn resolve_dependency_field(
    engine: &CodegenEngine<'_>,
    document: &Value,
    reference_value: &Value,
    ctx: &mut Context<'_>,
) -> Result<(Value, Value, Vec<Utf16>), EngineError> {
    let validation = core_validation(engine, document, ctx)?;
    resolve_dependency_field_with_validation(document, reference_value, &validation, ctx)
}

pub(super) fn resolve_dependency_field_with_validation(
    document: &Value,
    reference_value: &Value,
    validation: &[umf_core::Diagnostic],
    ctx: &mut Context<'_>,
) -> Result<(Value, Value, Vec<Utf16>), EngineError> {
    let Some((module, element)) = metered_reference(reference_value, ctx)? else {
        return Err(EngineError::new(
            "ACCESS_REFERENCE",
            Utf16::default(),
            "Referenced dependency is not an exact Field reference",
        ));
    };
    let Some((mi, ei, _, field)) = find_element_metered(document, &module, &element, ctx)? else {
        return Err(EngineError::new(
            "ACCESS_REFERENCE",
            Utf16::default(),
            "Referenced dependency Field is absent",
        ));
    };
    if get_metered(field, "kind", ctx)?.as_deref() != Some("field") {
        return Err(EngineError::new(
            "ACCESS_REFERENCE",
            Utf16::from(format!("/modules/{mi}/elements/{ei}")),
            "Referenced dependency is not a Field",
        ));
    }
    let admitted = crate::value::admit_json(field, ctx)?;
    let (facets, partial) = known_or_partial_facets(
        &admitted,
        validation,
        &Utf16::from(format!("/modules/{mi}/elements/{ei}")),
        ctx,
    )?;
    let properties = properties(&admitted, ctx)?;
    let paths = partial
        .into_iter()
        .filter_map(|v| {
            if let Value::String(path) = v {
                Some(path)
            } else {
                None
            }
        })
        .collect();
    Ok((facets, properties, paths))
}

/// Mirrors admission `inspectAccessViews`: return semantic records and ordered
/// diagnostics from the source model plus all explicitly supplied bindings.
pub(super) fn inspect_access_views(
    engine: &CodegenEngine<'_>,
    document: &Value,
    selected: &[Value],
    bindings: &[(String, Value)],
    source_id: &str,
    ctx: &mut Context<'_>,
) -> Result<Inspection, EngineError> {
    ctx.charge_work(source_id.len(), Utf16::default())?;
    let source = Utf16::from(source_id);
    let mut out = Inspection::default();
    let document_validation = core_validation(engine, document, ctx)?;
    for diagnostic in &document_validation {
        ctx.charge_work(1, Utf16::default())?;
        if diagnostic.severity == umf_core::Severity::Error {
            push_access_diag(
                &mut out.diagnostics,
                "ACCESS_SHAPE",
                &source,
                Utf16::default(),
                ctx,
            )?;
            return Ok(out);
        }
    }
    if get_metered(document, "umf", ctx)?.as_deref() != Some("0.10.0") {
        push_access_diag(
            &mut out.diagnostics,
            "ACCESS_SHAPE",
            &source,
            Utf16::default(),
            ctx,
        )?;
        return Ok(out);
    }
    if get_metered(
        member(document, "vocabularies").unwrap_or(&Value::Null),
        "umf.access",
        ctx,
    )?
    .is_some()
    { /* exact version is encoded by the vocabulary value below */ }
    if get_metered(
        member(
            member(document, "vocabularies").unwrap_or(&Value::Null),
            "umf.access",
        )
        .unwrap_or(&Value::Null),
        "version",
        ctx,
    )?
    .as_deref()
        != Some("0.1.0")
    {
        push_access_diag(
            &mut out.diagnostics,
            "ACCESS_SHAPE",
            &source,
            Utf16::from("/vocabularies/umf.access"),
            ctx,
        )?;
        return Ok(out);
    }
    let mut vectors = BTreeMap::<(Utf16, Utf16), i64>::new();
    for (mi, module) in array(document, "modules").iter().enumerate() {
        ctx.charge_work(1, indexed("/modules", mi))?;
        let p = member(module, "extensions")
            .and_then(|x| member(x, "umf.access"))
            .unwrap_or(&Value::Null);
        for (ii, index) in array(p, "search").iter().enumerate() {
            ctx.charge_work(
                1,
                indexed(&format!("/modules/{mi}/extensions/umf.access/search"), ii),
            )?;
            binding_value_work(index, ctx)?;
            if get_metered(index, "kind", ctx)?.as_deref() != Some("vector") {
                continue;
            }
            let vector = member(index, "vector").unwrap_or(&Value::Null);
            let Some(key) =
                metered_reference(member(vector, "field").unwrap_or(&Value::Null), ctx)?
            else {
                continue;
            };
            let Some(dim) =
                number(member(vector, "dimensions").unwrap_or(&Value::Null)).filter(|x| {
                    x.is_finite() && *x > 0.0 && x.fract() == 0.0 && *x <= 9_007_199_254_740_991.0
                })
            else {
                continue;
            };
            let d = dim as i64;
            ctx.charge_work(
                key.0.len().saturating_add(key.1.len()).saturating_mul(64),
                Utf16::default(),
            )?;
            vectors
                .entry(key)
                .and_modify(|old| {
                    if *old != d {
                        *old = 0
                    }
                })
                .or_insert(d);
        }
    }
    ctx.charge_work(selected.len().saturating_mul(64), Utf16::default())?;
    let mut selected_ids = Vec::with_capacity(selected.len());
    for selected_ref in selected {
        ctx.charge_work(1, Utf16::from("/records"))?;
        if let Some(reference) = metered_reference(selected_ref, ctx)? {
            ctx.charge_work(
                reference
                    .0
                    .len()
                    .saturating_add(reference.1.len())
                    .saturating_mul(64),
                Utf16::default(),
            )?;
            selected_ids.push(reference);
        }
    }
    let mut selected_member_ids = BTreeSet::new();
    for (module, element) in &selected_ids {
        if let Some((_, _, _, record)) = find_element_metered(document, module, element, ctx)? {
            for r in array(record, "members") {
                ctx.charge_work(1, Utf16::from("/members"))?;
                if let Some(r) = metered_reference(r, ctx)? {
                    ctx.charge_work(
                        r.0.len().saturating_add(r.1.len()).saturating_mul(64),
                        Utf16::default(),
                    )?;
                    selected_member_ids.insert(r);
                }
            }
        }
    }
    let mut views = Vec::<(Value, Utf16)>::new();
    let mut columns = Vec::<(Value, Utf16)>::new();
    for (mi, module) in array(document, "modules").iter().enumerate() {
        ctx.charge_work(1, indexed("/modules", mi))?;
        let Some(payload) = member(
            member(module, "extensions").unwrap_or(&Value::Null),
            "umf.access",
        ) else {
            continue;
        };
        ctx.charge_work(
            32usize.saturating_add(mi.to_string().len()),
            Utf16::default(),
        )?;
        let base = format!("/modules/{mi}/extensions/umf.access");
        if object(payload).is_none()
            || ["views", "columns", "search", "searchBindings"]
                .iter()
                .any(|k| member(payload, k).and_then(array_items).is_none())
        {
            push_access_diag(
                &mut out.diagnostics,
                "ACCESS_SHAPE",
                &source,
                Utf16::from(base.as_str()),
                ctx,
            )?;
            continue;
        }
        let mut selected_module = false;
        if let Some(module_id) = string_member(module, "id") {
            for selected in &selected_ids {
                ctx.charge_work(
                    module_id
                        .len()
                        .saturating_add(selected.0.len())
                        .saturating_add(1),
                    Utf16::default(),
                )?;
                if &selected.0 == module_id {
                    selected_module = true;
                    break;
                }
            }
        }
        if selected_module {
            for (key, _) in js_object_members(payload, ctx)? {
                let base_path = Utf16::from(base.as_str());
                let unknown_path = metered_path(&base_path, key, ctx)?;
                ctx.charge_work(key.len(), Utf16::default())?;
                if !key_allowed(key, &["views", "columns", "search", "searchBindings"]) {
                    push_unknown_diag(&mut out.diagnostics, &source, unknown_path, ctx)?;
                }
            }
        }
        for (i, view) in array(payload, "views").iter().enumerate() {
            ctx.charge_work(
                base.len()
                    .saturating_add(i.to_string().len())
                    .saturating_add(8),
                Utf16::default(),
            )?;
            let p = indexed(&format!("{base}/views"), i);
            ctx.charge_work(1, p.clone())?;
            let valid = metered_reference(member(view, "record").unwrap_or(&Value::Null), ctx)?
                .is_some()
                && member(view, "fields").and_then(array_items).is_some();
            if !valid {
                push_access_diag(&mut out.diagnostics, "ACCESS_SHAPE", &source, p, ctx)?;
                continue;
            }
            let (rm, re) = metered_reference(member(view, "record").unwrap(), ctx)?.unwrap();
            let found_record = find_element_metered(document, &rm, &re, ctx)?;
            let wrong_kind = if let Some((_, _, _, found)) = found_record {
                get_metered(found, "kind", ctx)?.as_deref() != Some("record")
            } else {
                true
            };
            if wrong_kind || string_member(module, "id") != Some(&rm) {
                push_access_diag(
                    &mut out.diagnostics,
                    "ACCESS_REFERENCE",
                    &source,
                    metered_path(&p, &Utf16::from("record"), ctx)?,
                    ctx,
                )?;
            }
            for (fi, item) in array(view, "fields").iter().enumerate() {
                ctx.charge_work(
                    base.len()
                        .saturating_add(i.to_string().len())
                        .saturating_add(fi.to_string().len())
                        .saturating_add(16),
                    Utf16::default(),
                )?;
                ctx.charge_work(1, indexed(&format!("{base}/views/{i}/fields"), fi))?;
                binding_value_work(item, ctx)?;
                let fp = indexed(&format!("{base}/views/{i}/fields"), fi);
                if metered_reference(member(item, "field").unwrap_or(&Value::Null), ctx)?.is_none()
                    || !presence(member(item, "row").unwrap_or(&Value::Null))
                    || !presence(member(item, "create").unwrap_or(&Value::Null))
                    || !matches!(member(item, "mutable"), Some(Value::Bool(_)))
                    || !matches!(member(item, "generated"), Some(Value::Bool(_)))
                    || member(item, "temporal")
                        .is_some_and(|v| !matches!(text(v).as_deref(), Some("instant" | "local")))
                {
                    push_access_diag(&mut out.diagnostics, "ACCESS_SHAPE", &source, fp, ctx)?;
                }
            }
            let mut admitted_view = true;
            for f in array(view, "fields") {
                ctx.charge_work(1, p.clone())?;
                if object(f).is_none()
                    || metered_reference(member(f, "field").unwrap_or(&Value::Null), ctx)?.is_none()
                    || !presence(member(f, "row").unwrap_or(&Value::Null))
                    || !presence(member(f, "create").unwrap_or(&Value::Null))
                {
                    admitted_view = false;
                }
            }
            if admitted_view {
                ctx.charge_work(p.len().saturating_add(16), Utf16::default())?;
                views.push((crate::value::admit_json(view, ctx)?, p));
            }
        }
        for (i, set) in array(payload, "columns").iter().enumerate() {
            ctx.charge_work(
                base.len()
                    .saturating_add(i.to_string().len())
                    .saturating_add(10),
                Utf16::default(),
            )?;
            let p = indexed(&format!("{base}/columns"), i);
            let binding = member(set, "binding").unwrap_or(&Value::Null);
            let target = member(set, "target").unwrap_or(&Value::Null);
            let valid = object(binding).is_some()
                && string_member(binding, "sourceId").is_some()
                && string_member(binding, "module").is_some()
                && object(target).is_some()
                && string_member(target, "platform").is_some()
                && string_member(target, "majorVersion").is_some()
                && array_items(member(set, "columns").unwrap_or(&Value::Null)).is_some();
            if !valid {
                push_access_diag(&mut out.diagnostics, "ACCESS_SHAPE", &source, p, ctx)?;
                continue;
            }
            let mut child_valid = true;
            for (_ci, column) in array(set, "columns").iter().enumerate() {
                ctx.charge_work(1, p.clone())?;
                binding_value_work(column, ctx)?;
                let generation = member(column, "generation");
                let generation_ok = matches!(generation, Some(Value::Null))
                    || generation.is_some_and(|value| {
                        matches!(
                            text(value).as_deref(),
                            Some("identity" | "stored-expression" | "default")
                        )
                    });
                let collation = member(column, "collation");
                let collation_ok = if let Some(value) = collation {
                    if value == &Value::Null {
                        true
                    } else if let (Some(schema), Some(name)) =
                        (string_member(value, "schema"), string_member(value, "name"))
                    {
                        native_name(schema, ctx)? && native_name(name, ctx)?
                    } else {
                        false
                    }
                } else {
                    true
                };
                if object(column).is_none()
                    || metered_reference(member(column, "field").unwrap_or(&Value::Null), ctx)?
                        .is_none()
                    || string_member(column, "type").is_none()
                    || !matches!(member(column, "notNull"), Some(Value::Bool(_)))
                    || !generation_ok
                    || !collation_ok
                {
                    child_valid = false;
                }
            }
            if !child_valid {
                push_access_diag(
                    &mut out.diagnostics,
                    "ACCESS_SHAPE",
                    &source,
                    metered_path(&p, &Utf16::from("columns"), ctx)?,
                    ctx,
                )?;
            } else {
                ctx.charge_work(p.len().saturating_add(16), Utf16::default())?;
                columns.push((crate::value::admit_json(set, ctx)?, p));
            }
        }
    }
    let mut seen_views = BTreeSet::new();
    for (view, p) in &views {
        ctx.charge_work(1, p.clone())?;
        let id = metered_reference(member(view, "record").unwrap(), ctx)?.unwrap();
        ctx.charge_work(
            id.0.len().saturating_add(id.1.len()).saturating_mul(64),
            Utf16::default(),
        )?;
        if !seen_views.insert(id) {
            push_access_diag(
                &mut out.diagnostics,
                "ACCESS_REFERENCE",
                &source,
                metered_path(p, &Utf16::from("record"), ctx)?,
                ctx,
            )?;
        }
    }
    // Binding and column declarations are checked before selected Views, just
    // as in the TypeScript source. All lookups are metered before scans.
    ctx.charge_work(columns.len().saturating_mul(64), Utf16::default())?;
    let mut seen_sets = BTreeSet::new();
    for (set, p) in &columns {
        ctx.charge_work(1, Utf16::default())?;
        let binding = member(set, "binding").unwrap_or(&Value::Null);
        let source_id = string_member(binding, "sourceId").unwrap();
        let binding_module = string_member(binding, "module").unwrap();
        ctx.charge_work(
            source_id
                .len()
                .saturating_add(binding_module.len())
                .saturating_add(3),
            Utf16::default(),
        )?;
        let target = javascript_ordered_value(member(set, "target").unwrap_or(&Value::Null), ctx)?;
        let identity = arr([
            Value::String(source_id.clone()),
            Value::String(binding_module.clone()),
            target,
        ]);
        let identity = umf_core::serialization::stringify_compact_metered(&identity, ctx)?;
        ctx.charge_work(identity.len().saturating_mul(64), Utf16::default())?;
        if !seen_sets.insert(identity) {
            push_access_diag(
                &mut out.diagnostics,
                "ACCESS_REFERENCE",
                &source,
                p.clone(),
                ctx,
            )?;
        }
        let binding = member(set, "binding").unwrap_or(&Value::Null);
        let binding_source_units = string_member(binding, "sourceId").map_or(0, Utf16::len);
        ctx.charge_work(binding_source_units, Utf16::default())?;
        let binding_source = string_member(binding, "sourceId")
            .and_then(|value| value.to_utf8().ok())
            .unwrap_or_default();
        ctx.charge_work(bindings.len(), Utf16::default())?;
        let mut candidates = Vec::with_capacity(bindings.len());
        for candidate in bindings {
            let candidate_path = metered_path(p, &Utf16::from("binding"), ctx)?;
            ctx.charge_work(
                candidate
                    .0
                    .len()
                    .saturating_add(binding_source.len())
                    .saturating_add(1),
                candidate_path,
            )?;
            if candidate.0 == binding_source {
                candidates.push(candidate);
            }
        }
        if candidates.len() != 1 {
            push_access_diag(
                &mut out.diagnostics,
                "ACCESS_REFERENCE",
                &source,
                metered_path(p, &Utf16::from("binding"), ctx)?,
                ctx,
            )?;
            continue;
        }
        // Binding-specific complete profile checks are performed below on the
        // retained source payload; malformed or unknown semantics never count
        // as a successful native declaration.
        inspect_binding_declaration(
            engine,
            &source,
            document,
            &document_validation,
            &candidates[0].1,
            set,
            p,
            selected,
            &selected_member_ids,
            &mut out.diagnostics,
            ctx,
        )?;
    }
    for reference_value in selected {
        ctx.charge_work(1, Utf16::from("/records"))?;
        let Some((module_id, element_id)) = metered_reference(reference_value, ctx)? else {
            push_access_diag(
                &mut out.diagnostics,
                "ACCESS_REFERENCE",
                &source,
                Utf16::from("/records"),
                ctx,
            )?;
            continue;
        };
        // Source locate(ref) retains the module position even when the
        // element is absent, and spells missing positions as -1.
        let mut missing_module = -1isize;
        let mut located = None;
        for (mi, module) in array(document, "modules").iter().enumerate() {
            ctx.charge_work(
                module_id
                    .len()
                    .saturating_add(string_member(module, "id").map_or(0, Utf16::len))
                    .saturating_add(1),
                Utf16::default(),
            )?;
            if string_member(module, "id") != Some(&module_id) {
                continue;
            }
            missing_module = mi as isize;
            for (ei, record) in array(module, "elements").iter().enumerate() {
                ctx.charge_work(
                    element_id
                        .len()
                        .saturating_add(string_member(record, "id").map_or(0, Utf16::len))
                        .saturating_add(1),
                    Utf16::default(),
                )?;
                if string_member(record, "id") == Some(&element_id) {
                    located = Some((mi, ei, module, record));
                    break;
                }
            }
            break;
        }
        let Some((mi, ei, module, record)) = located else {
            ctx.charge_work(source.len().saturating_add(192), Utf16::default())?;
            push_access_diag(
                &mut out.diagnostics,
                "ACCESS_REFERENCE",
                &source,
                Utf16::from(format!("/modules/{missing_module}/elements/-1")),
                ctx,
            )?;
            continue;
        };
        if get_metered(record, "kind", ctx)?.as_deref() != Some("record") {
            push_access_diag(
                &mut out.diagnostics,
                "ACCESS_REFERENCE",
                &source,
                Utf16::from(format!("/modules/{mi}/elements/{ei}")),
                ctx,
            )?;
            continue;
        }
        let mut matching_view = None;
        let mut match_count = 0usize;
        for (candidate, candidate_path) in &views {
            ctx.charge_work(
                module_id
                    .len()
                    .saturating_add(element_id.len())
                    .saturating_add(1),
                candidate_path.clone(),
            )?;
            if metered_reference(member(candidate, "record").unwrap_or(&Value::Null), ctx)?
                .is_some_and(|(m, e)| m == module_id && e == element_id)
            {
                matching_view = Some((candidate, candidate_path));
                match_count += 1;
            }
        }
        if match_count != 1 {
            push_access_diag(
                &mut out.diagnostics,
                "ACCESS_REFERENCE",
                &source,
                Utf16::from(format!("/modules/{mi}/elements/{ei}")),
                ctx,
            )?;
            continue;
        }
        let (view, vpath) = matching_view.unwrap();
        let vp = vpath.to_utf8().unwrap_or_default();
        for (k, _) in js_object_members(view, ctx)? {
            if !key_allowed(k, &["record", "selectedKey", "fields"]) {
                push_unknown_diag(
                    &mut out.diagnostics,
                    &source,
                    metered_raw_path(vpath, k, ctx)?,
                    ctx,
                )?;
            }
        }
        let member_refs = array(record, "members");
        ctx.charge_work(member_refs.len().saturating_mul(4), Utf16::default())?;
        let mut expected = Vec::<((Utf16, Utf16), bool)>::with_capacity(member_refs.len());
        let mut seen = BTreeSet::new();
        for r in member_refs {
            if let Some(ref_id) = metered_reference(r, ctx)? {
                ctx.charge_work(
                    (ref_id.0.len() + ref_id.1.len()).saturating_mul(64),
                    Utf16::default(),
                )?;
                if seen.insert(ref_id.clone()) {
                    expected.push((ref_id, false));
                }
            } else {
                push_access_diag(
                    &mut out.diagnostics,
                    "ACCESS_REFERENCE",
                    &source,
                    Utf16::from(format!("/modules/{mi}/elements/{ei}/members")),
                    ctx,
                )?;
            }
        }
        for r in member_refs {
            if let Some(ref_id) = metered_reference(r, ctx)? {
                if !collect_nested_fields(document, ref_id, &mut expected, &mut seen, ctx)? {
                    push_access_diag(
                        &mut out.diagnostics,
                        "ACCESS_REFERENCE",
                        &source,
                        metered_path(vpath, &Utf16::from("fields"), ctx)?,
                        ctx,
                    )?;
                }
            }
        }
        let view_fields = array(view, "fields");
        let mut expected_mismatch = expected.len() != view_fields.len();
        if !expected_mismatch {
            for (expected_field, field_view) in expected.iter().zip(view_fields) {
                let fields_path = metered_path(vpath, &Utf16::from("fields"), ctx)?;
                ctx.charge_work(1, fields_path)?;
                if metered_reference(member(field_view, "field").unwrap_or(&Value::Null), ctx)?
                    .as_ref()
                    != Some(&expected_field.0)
                {
                    expected_mismatch = true;
                    break;
                }
            }
        }
        if expected_mismatch {
            push_access_diag(
                &mut out.diagnostics,
                "ACCESS_COVERAGE",
                &source,
                metered_path(vpath, &Utf16::from("fields"), ctx)?,
                ctx,
            )?;
        }
        let keys = array(record, "keys");
        let validation = &document_validation;
        let key_prefix = Utf16::from(format!("/modules/{mi}/elements/{ei}/keys"));
        let qualifier = Utf16::from("UNKNOWN_KEY_QUALIFIER");
        for diagnostic in validation.iter() {
            ctx.charge_work(diagnostic.path.len().saturating_add(1), Utf16::default())?;
            if diagnostic.code == qualifier
                && (diagnostic.path == key_prefix
                    || (diagnostic.path.units().starts_with(key_prefix.units())
                        && diagnostic.path.units().get(key_prefix.len()) == Some(&47)))
            {
                push_unknown_diag(&mut out.diagnostics, &source, key_prefix.clone(), ctx)?;
                break;
            }
        }
        let selection = member(view, "selectedKey").unwrap_or(&Value::Null);
        if let Some(key) = string_member(selection, "key") {
            ctx.charge_work(key.len(), Utf16::default())?;
        }
        let selected_key = string_member(selection, "key").cloned();
        ctx.charge_work(
            module_id
                .len()
                .saturating_add(element_id.len())
                .saturating_add(1),
            Utf16::default(),
        )?;
        let mut invalid_selection = string_member(selection, "module") != Some(&module_id)
            || string_member(selection, "element") != Some(&element_id);
        if !invalid_selection {
            if let Some(id) = &selected_key {
                let mut found = false;
                for candidate in keys {
                    ctx.charge_work(
                        id.len()
                            .saturating_add(string_member(candidate, "id").map_or(0, Utf16::len))
                            .saturating_add(1),
                        Utf16::default(),
                    )?;
                    if string_member(candidate, "id") == Some(id) {
                        found = true;
                        break;
                    }
                }
                invalid_selection = !found;
            } else {
                invalid_selection = true;
            }
        }
        if !invalid_selection {
            if let Some(entries) = object(selection) {
                for (key, _) in entries {
                    ctx.charge_work(key.len(), Utf16::default())?;
                    if !key_allowed(key, &["module", "element", "key"]) {
                        invalid_selection = true;
                        break;
                    }
                }
            }
        }
        if invalid_selection {
            push_access_diag(
                &mut out.diagnostics,
                "ACCESS_REFERENCE",
                &source,
                metered_path(vpath, &Utf16::from("selectedKey"), ctx)?,
                ctx,
            )?;
        }
        ctx.charge_work(
            keys.len(),
            Utf16::from(format!("/modules/{mi}/elements/{ei}/keys")),
        )?;
        let mut key_field_count = 0usize;
        for key in keys {
            ctx.charge_work(1, key_prefix.clone())?;
            key_field_count = key_field_count.saturating_add(array(key, "fields").len());
        }
        ctx.charge_work(
            key_field_count,
            Utf16::from(format!("/modules/{mi}/elements/{ei}/keys")),
        )?;
        ctx.charge_work(keys.len().saturating_mul(4), key_prefix.clone())?;
        let mut ordered_keys = Vec::with_capacity(keys.len());
        for key in keys {
            ctx.charge_work(1, key_prefix.clone())?;
            let id_value = member(key, "id").unwrap_or(&Value::Null);
            binding_value_work(id_value, ctx)?;
            let id = id_value.clone();
            let fields = array(key, "fields");
            ctx.charge_work(fields.len().saturating_mul(4), key_prefix.clone())?;
            let mut key_fields = Vec::with_capacity(fields.len());
            for field_ref in fields {
                ctx.charge_work(1, key_prefix.clone())?;
                if let Some((m, e)) = metered_reference(field_ref, ctx)? {
                    ctx.charge_work(
                        m.len().saturating_add(e.len()).saturating_add(18),
                        Utf16::default(),
                    )?;
                    key_fields.push(ref_value(&m, &e));
                }
            }
            ordered_keys.push(obj([("id", id), ("fields", arr(key_fields))]));
        }
        ordered_keys = selected_keys_first(ordered_keys, selected_key.as_ref(), ctx)?;
        ctx.charge_work(member_refs.len().saturating_mul(64), Utf16::default())?;
        let mut resolved = Vec::with_capacity(member_refs.len());
        let mut owned = BTreeSet::new();
        for member_ref in member_refs {
            ctx.charge_work(1, Utf16::from("/members"))?;
            if let Some(member_ref) = metered_reference(member_ref, ctx)? {
                ctx.charge_work(
                    member_ref
                        .0
                        .len()
                        .saturating_add(member_ref.1.len())
                        .saturating_mul(64),
                    Utf16::default(),
                )?;
                owned.insert(member_ref);
            }
        }
        for (fi, fv) in array(view, "fields").iter().enumerate() {
            ctx.charge_work(
                vpath
                    .len()
                    .saturating_add(fi.to_string().len())
                    .saturating_add(8),
                Utf16::default(),
            )?;
            let fp = format!("{vp}/fields/{fi}");
            let fp16 = Utf16::from(fp.as_str());
            let Some(fr) = metered_reference(member(fv, "field").unwrap_or(&Value::Null), ctx)?
            else {
                push_access_diag(
                    &mut out.diagnostics,
                    "ACCESS_REFERENCE",
                    &source,
                    metered_path(&fp16, &Utf16::from("field"), ctx)?,
                    ctx,
                )?;
                continue;
            };
            let Some((fmi, fei, fmodule, field)) =
                find_element_metered(document, &fr.0, &fr.1, ctx)?
            else {
                push_access_diag(
                    &mut out.diagnostics,
                    "ACCESS_REFERENCE",
                    &source,
                    metered_path(&fp16, &Utf16::from("field"), ctx)?,
                    ctx,
                )?;
                continue;
            };
            let mut expected_field = None;
            for entry in &expected {
                ctx.charge_work(
                    fr.0.len()
                        .saturating_add(fr.1.len())
                        .saturating_add(entry.0 .0.len())
                        .saturating_add(entry.0 .1.len())
                        .saturating_add(1),
                    Utf16::default(),
                )?;
                if entry.0 == fr {
                    expected_field = Some(entry);
                    break;
                }
            }
            let Some(expected_field) = expected_field else {
                push_access_diag(
                    &mut out.diagnostics,
                    "ACCESS_REFERENCE",
                    &source,
                    metered_path(&fp16, &Utf16::from("field"), ctx)?,
                    ctx,
                )?;
                continue;
            };
            let nested = expected_field.1;
            let owned_field = owned.contains(&fr);
            for (k, _) in js_object_members(fv, ctx)? {
                if !key_allowed(
                    k,
                    &["field", "row", "create", "mutable", "generated", "temporal"],
                ) {
                    push_unknown_diag(
                        &mut out.diagnostics,
                        &source,
                        metered_raw_path(&fp16, k, ctx)?,
                        ctx,
                    )?;
                }
            }
            for label in ["row", "create"] {
                for (k, _) in js_object_members(member(fv, label).unwrap_or(&Value::Null), ctx)? {
                    if !key_allowed(k, &["missing", "null"]) {
                        let row_path = metered_path(&fp16, &Utf16::from(label), ctx)?;
                        push_unknown_diag(
                            &mut out.diagnostics,
                            &source,
                            metered_raw_path(&row_path, k, ctx)?,
                            ctx,
                        )?;
                    }
                }
            }
            let nullability =
                get_metered(field, "nullability", ctx)?.unwrap_or_else(|| "unspecified".into());
            let admits_null = validate_nullable(engine, document, field, ctx)?;
            let admitted_field = crate::value::admit_json(field, ctx)?;
            let (facet_values, unknown_facets) = known_or_partial_facets(
                &admitted_field,
                &document_validation,
                &Utf16::from(format!("/modules/{fmi}/elements/{fei}")),
                ctx,
            )?;
            for path_value in unknown_facets {
                if let Value::String(p) = path_value {
                    push_unknown_diag(&mut out.diagnostics, &source, p, ctx)?;
                }
            }
            let mut field_column_capacity = 0usize;
            for (set, _) in &columns {
                ctx.charge_work(1, Utf16::default())?;
                field_column_capacity =
                    field_column_capacity.saturating_add(array(set, "columns").len());
            }
            ctx.charge_work(field_column_capacity.saturating_mul(16), Utf16::default())?;
            let mut field_columns = Vec::with_capacity(field_column_capacity);
            for (set, set_path) in &columns {
                for column in array(set, "columns") {
                    ctx.charge_work(
                        fr.0.len().saturating_add(fr.1.len()).saturating_add(1),
                        (*set_path).clone(),
                    )?;
                    if metered_reference(member(column, "field").unwrap_or(&Value::Null), ctx)?
                        .is_some_and(|(m, e)| m == fr.0 && e == fr.1)
                    {
                        field_columns.push((column, set, set_path));
                    }
                }
            }
            let mut key = false;
            for ordered_key in &ordered_keys {
                for field_ref in array(ordered_key, "fields") {
                    ctx.charge_work(
                        fr.0.len().saturating_add(fr.1.len()).saturating_add(1),
                        Utf16::default(),
                    )?;
                    if metered_reference(field_ref, ctx)?.as_ref() == Some(&fr) {
                        key = true;
                        break;
                    }
                }
                if key {
                    break;
                }
            }
            let properties_value = properties(&admitted_field, ctx)?;
            let row = member(fv, "row").unwrap_or(&Value::Null);
            let create = member(fv, "create").unwrap_or(&Value::Null);
            let mutable = js_truth(member(fv, "mutable").unwrap_or(&Value::Null));
            let generated = js_truth(member(fv, "generated").unwrap_or(&Value::Null));
            let row_missing = truth(member(row, "missing").unwrap_or(&Value::Null));
            let row_null = truth(member(row, "null").unwrap_or(&Value::Null));
            let create_missing = truth(member(create, "missing").unwrap_or(&Value::Null));
            let create_null = truth(member(create, "null").unwrap_or(&Value::Null));
            ctx.charge_work(field_columns.len(), Utf16::default())?;
            let mut not_nulls = Vec::with_capacity(field_columns.len());
            for (column, _, column_path) in &field_columns {
                ctx.charge_work(1, (*column_path).clone())?;
                not_nulls.push(truth(member(column, "notNull").unwrap_or(&Value::Null)));
            }
            let default_on = member(&properties_value, "default")
                .and_then(|v| get(v, "on"))
                .unwrap_or_else(|| "none".into());
            let valid = (!owned_field
                || check_presence_metered(
                    nullability.as_str(),
                    admits_null,
                    &default_on,
                    key,
                    mutable,
                    generated,
                    !field_columns.is_empty(),
                    &not_nulls,
                    false,
                    row_missing,
                    row_null,
                    create_missing,
                    create_null,
                    ctx,
                )?)
                && (!nested
                    || check_presence_metered(
                        nullability.as_str(),
                        admits_null,
                        &default_on,
                        false,
                        mutable,
                        generated,
                        !field_columns.is_empty(),
                        &not_nulls,
                        true,
                        row_missing,
                        row_null,
                        create_missing,
                        create_null,
                        ctx,
                    )?);
            if !valid
                || key
                    && matches!(
                        get_metered(field, "scalarType", ctx)?.as_deref(),
                        Some("date" | "timestamp")
                    )
                || (get_metered(field, "scalarType", ctx)?.as_deref() == Some("timestamp"))
                    != member(fv, "temporal").is_some()
                || generated && {
                    let mut null_generation = false;
                    for (column, _, column_path) in &field_columns {
                        ctx.charge_work(1, (*column_path).clone())?;
                        if member(column, "generation") == Some(&Value::Null) {
                            null_generation = true;
                            break;
                        }
                    }
                    null_generation
                }
            {
                push_access_diag(
                    &mut out.diagnostics,
                    "ACCESS_CONFLICT",
                    &source,
                    fp16.clone(),
                    ctx,
                )?;
            }
            for (column, set, set_path) in &field_columns {
                if !native_compatible(field, fv, column, set, &facet_values, &vectors, ctx)? {
                    push_access_diag(
                        &mut out.diagnostics,
                        "ACCESS_NATIVE",
                        &source,
                        metered_path(set_path, &Utf16::from("columns"), ctx)?,
                        ctx,
                    )?;
                }
            }
            ctx.charge_work(16, Utf16::default())?;
            ctx.charge_work(fr.0.len().saturating_add(fr.1.len()), Utf16::default())?;
            let cardinality_value = member(field, "cardinality");
            if let Some(Value::String(cardinality)) = cardinality_value {
                ctx.charge_work(cardinality.len(), Utf16::default())?;
            }
            let mut field_value = vec![
                (Utf16::from("ref"), ref_value(&fr.0, &fr.1)),
                (
                    Utf16::from("pointer"),
                    s(format!("/modules/{fmi}/elements/{fei}")),
                ),
                (Utf16::from("owned"), Value::Bool(owned_field)),
                (Utf16::from("viewPointer"), s(&fp)),
                (Utf16::from("python"), s("")),
                (
                    Utf16::from("logicalName"),
                    member(field, "name")
                        .map(|v| crate::value::admit_json(v, ctx))
                        .transpose()?
                        .unwrap_or(Value::Null),
                ),
                (
                    Utf16::from("scalarType"),
                    member(field, "scalarType")
                        .map(|v| crate::value::admit_json(v, ctx))
                        .transpose()?
                        .unwrap_or(Value::Null),
                ),
                (
                    Utf16::from("cardinality"),
                    cardinality_value
                        .filter(|v| {
                            matches!(
                                text(v).as_deref(),
                                Some("one" | "array" | "map" | "unspecified")
                            )
                        })
                        .map(|v| crate::value::admit_json(v, ctx))
                        .transpose()?
                        .unwrap_or_else(|| s("unspecified")),
                ),
                (Utf16::from("row"), crate::value::admit_json(row, ctx)?),
                (
                    Utf16::from("create"),
                    crate::value::admit_json(create, ctx)?,
                ),
                (Utf16::from("mutable"), Value::Bool(mutable)),
                (Utf16::from("generated"), Value::Bool(generated)),
            ];
            if let Some(temporal) = member(fv, "temporal") {
                field_value.push((
                    Utf16::from("temporal"),
                    crate::value::admit_json(temporal, ctx)?,
                ));
            }
            field_value.push((
                Utf16::from("facets"),
                crate::value::admit_json(&facet_values, ctx)?,
            ));
            field_value.push((
                Utf16::from("properties"),
                crate::value::admit_json(&properties_value, ctx)?,
            ));
            if matches!(
                get_metered(field, "cardinality", ctx)?.as_deref(),
                Some("array" | "map")
            ) {
                if let Some(item) = member(field, "itemType") {
                    field_value.push((Utf16::from("item"), crate::value::admit_json(item, ctx)?));
                }
            }
            let _ = fmodule;
            resolved.push(Value::Object(field_value));
        }
        let name = member(record, "name")
            .map(|v| crate::value::admit_json(v, ctx))
            .transpose()?
            .unwrap_or(Value::Null);
        let namespace = member(module, "namespace")
            .map(|v| crate::value::admit_json(v, ctx))
            .transpose()?
            .unwrap_or(Value::Null);
        ctx.charge_work(
            module_id
                .len()
                .saturating_add(element_id.len())
                .saturating_add(128),
            Utf16::default(),
        )?;
        out.records.push(obj([
            ("ref", ref_value(&module_id, &element_id)),
            ("pointer", s(format!("/modules/{mi}/elements/{ei}"))),
            ("python", s("")),
            ("namespace", namespace),
            ("logicalName", name),
            ("fields", arr(resolved)),
            ("keys", arr(ordered_keys)),
            ("selected", Value::Bool(true)),
        ]));
    }
    Ok(out)
}

fn selected_keys_first(
    keys: Vec<Value>,
    selected: Option<&Utf16>,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    ctx.charge_work(keys.len().saturating_mul(8), Utf16::default())?;
    let mut first = Vec::with_capacity(keys.len());
    let mut rest = Vec::with_capacity(keys.len());
    for key in keys {
        let id = string_member(&key, "id");
        ctx.charge_work(
            id.map_or(0, Utf16::len)
                .saturating_add(selected.map_or(0, Utf16::len))
                .saturating_add(1),
            Utf16::default(),
        )?;
        if id == selected {
            first.push(key);
        } else {
            rest.push(key);
        }
    }
    for key in rest {
        ctx.charge_work(1, Utf16::default())?;
        first.push(key);
    }
    Ok(first)
}
fn check_presence_metered(
    availability: &str,
    admits_null: bool,
    default_on: &str,
    key: bool,
    mutable: bool,
    generated: bool,
    bound: bool,
    not_null: &[bool],
    nested: bool,
    row_missing: bool,
    row_null: bool,
    create_missing: bool,
    create_null: bool,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    if availability == "unspecified" || !matches!(availability, "required" | "absent-allowed") {
        return Ok(false);
    }
    if key && (availability != "required" || admits_null || mutable) {
        return Ok(false);
    }
    if availability == "required" && admits_null {
        return Ok(false);
    }
    if nested {
        return Ok(!generated
            && !mutable
            && !row_missing
            && !create_missing
            && row_null == admits_null
            && create_null == admits_null);
    }
    if bound {
        if not_null.is_empty() {
            return Ok(false);
        }
        for value in not_null {
            ctx.charge_work(1, Utf16::default())?;
            if *value == row_null {
                return Ok(false);
            }
        }
        if row_missing {
            return Ok(false);
        }
    }
    if generated {
        return Ok(create_missing
            && !create_null
            && !row_missing
            && (!row_null || (bound && admits_null)));
    }
    if key || availability == "required" {
        let omittable = !key && matches!(default_on, "missing" | "missing-or-null");
        return Ok(!row_missing && !row_null && !create_null && (!create_missing || omittable));
    }
    if create_null && !admits_null {
        return Ok(false);
    }
    if bound {
        return Ok(admits_null || !row_null);
    }
    Ok(row_missing && row_null == admits_null)
}
#[cfg(test)]
fn check_presence(
    availability: &str,
    admits_null: bool,
    default_on: &str,
    key: bool,
    mutable: bool,
    generated: bool,
    bound: bool,
    not_null: &[bool],
    nested: bool,
    row_missing: bool,
    row_null: bool,
    create_missing: bool,
    create_null: bool,
) -> bool {
    check_presence_metered(
        availability,
        admits_null,
        default_on,
        key,
        mutable,
        generated,
        bound,
        not_null,
        nested,
        row_missing,
        row_null,
        create_missing,
        create_null,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn native_name(value: &Utf16, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    if value.is_empty() || value.len() > 63 {
        return Ok(false);
    }
    let mut bytes = 0;
    let mut index = 0;
    while index < value.len() {
        ctx.charge_work(1, Utf16::default())?;
        let unit = value.units()[index];
        if unit == 0 {
            return Ok(false);
        }
        bytes += if unit <= 0x7f {
            1
        } else if unit <= 0x7ff {
            2
        } else if (0xd800..=0xdbff).contains(&unit)
            && value
                .units()
                .get(index + 1)
                .is_some_and(|next| (0xdc00..=0xdfff).contains(next))
        {
            index += 1;
            4
        } else {
            3
        };
        if bytes > 63 {
            return Ok(false);
        }
        index += 1;
    }
    Ok(true)
}
// Pinned Bun17 oracle: these are every non-ASCII scalar whose toUpperCase()
// result is entirely ASCII. Native accepted spellings are entirely ASCII.
fn native_ascii_uppercase(
    value: &str,
    ctx: &mut Context<'_>,
) -> Result<Option<String>, EngineError> {
    ctx.charge_work(
        value.len().saturating_mul(3).saturating_add(1),
        Utf16::default(),
    )?;
    let mut result = String::new();
    for (index, ch) in value.chars().enumerate() {
        if index % 1024 == 0 {
            ctx.charge_work(1, Utf16::default())?;
        }
        if ch.is_ascii() {
            result.push(ch.to_ascii_uppercase());
        } else {
            let expansion = match ch {
                '\u{df}' => "SS",
                '\u{131}' => "I",
                '\u{17f}' => "S",
                '\u{fb00}' => "FF",
                '\u{fb01}' => "FI",
                '\u{fb02}' => "FL",
                '\u{fb03}' => "FFI",
                '\u{fb04}' => "FFL",
                '\u{fb05}' | '\u{fb06}' => "ST",
                _ => return Ok(None),
            };
            result.push_str(expansion);
        }
    }
    Ok(Some(result))
}
fn presence(v: &Value) -> bool {
    matches!(member(v, "missing"), Some(Value::Bool(_)))
        && matches!(member(v, "null"), Some(Value::Bool(_)))
}
fn native_compatible(
    field: &Value,
    view: &Value,
    column: &Value,
    set: &Value,
    facets: &Value,
    vectors: &BTreeMap<(Utf16, Utf16), i64>,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let scalar = get_metered(field, "scalarType", ctx)?.unwrap_or_default();
    let card = get_metered(field, "cardinality", ctx)?.unwrap_or_default();
    let ty = get_metered(column, "type", ctx)?.unwrap_or_default();
    let platform = get_metered(
        member(set, "target").unwrap_or(&Value::Null),
        "platform",
        ctx,
    )?
    .unwrap_or_default();
    let major = get_metered(
        member(set, "target").unwrap_or(&Value::Null),
        "majorVersion",
        ctx,
    )?
    .unwrap_or_default();
    let field_ref = member(column, "field").unwrap_or(&Value::Null);
    let vector = if let (Some(module), Some(element)) = (
        string_member(field_ref, "module"),
        string_member(field_ref, "element"),
    ) {
        ctx.charge_work(module.len().saturating_add(element.len()), Utf16::default())?;
        vectors.get(&(module.clone(), element.clone())).copied()
    } else {
        None
    };
    let size = member(facets, "collectionSize").unwrap_or(&Value::Null);
    let vector_ok = card == "array"
        && vector.is_some_and(|d| d > 0)
        && number(member(size, "min").unwrap_or(&Value::Null)) == vector.map(|x| x as f64)
        && number(member(size, "max").unwrap_or(&Value::Null)) == vector.map(|x| x as f64);
    if card != "one" && !vector_ok {
        return Ok(false);
    }
    let uppercase = if ["unity-catalog", "spark-delta"].contains(&platform.as_str()) {
        native_ascii_uppercase(&ty, ctx)?
    } else {
        None
    };
    let temporal = get_metered(view, "temporal", ctx)?;
    Ok((|| {
        if ["unity-catalog", "spark-delta"].contains(&platform.as_str()) {
            let Some(t) = uppercase else { return false };
            match scalar.as_str() {
                "integer" => {
                    let w = member(facets, "integerWidth").unwrap_or(&Value::Null);
                    let bits = number(member(w, "bits").unwrap_or(&Value::Null));
                    return truth(member(w, "signed").unwrap_or(&Value::Null))
                        && match bits {
                            Some(8.0) => t == "TINYINT",
                            Some(16.0) => t == "SMALLINT",
                            Some(32.0) => t == "INT",
                            Some(64.0) => t == "BIGINT",
                            _ => false,
                        };
                }
                "decimal" => {
                    return number(member(facets, "precision").unwrap_or(&Value::Null))
                        .is_some_and(|p| p >= 1.0 && p <= 38.0)
                        && t == format!(
                            "DECIMAL({},{})",
                            num_text(member(facets, "precision").unwrap_or(&Value::Null)),
                            num_text(member(facets, "scale").unwrap_or(&Value::Null))
                        )
                }
                _ if vector_ok => return t == "ARRAY<FLOAT>",
                _ => {
                    return match scalar.as_str() {
                        "string" => t == "STRING",
                        "boolean" => t == "BOOLEAN",
                        "binary" => t == "BINARY",
                        _ => false,
                    }
                }
            }
        }
        if !((platform == "postgresql" && major == "18")
            || (platform == "lakebase" && matches!(major.as_str(), "17" | "18")))
        {
            return false;
        }
        if vector_ok {
            return ty == format!("vector({})", vector.unwrap_or_default());
        }
        if scalar == "integer" {
            let w = member(facets, "integerWidth").unwrap_or(&Value::Null);
            let bits = number(member(w, "bits").unwrap_or(&Value::Null));
            return truth(member(w, "signed").unwrap_or(&Value::Null))
                && match bits {
                    Some(16.0) => matches!(ty.as_str(), "smallint" | "int2"),
                    Some(32.0) => matches!(ty.as_str(), "integer" | "int" | "int4"),
                    Some(64.0) => matches!(ty.as_str(), "bigint" | "int8"),
                    _ => false,
                };
        }
        if scalar == "decimal" {
            return number(member(facets, "precision").unwrap_or(&Value::Null))
                .is_some_and(|p| p >= 1.0)
                && ty
                    == format!(
                        "numeric({},{})",
                        num_text(member(facets, "precision").unwrap_or(&Value::Null)),
                        num_text(member(facets, "scale").unwrap_or(&Value::Null))
                    );
        }
        if scalar == "timestamp" {
            return if temporal.as_deref() == Some("instant") {
                matches!(ty.as_str(), "timestamptz" | "timestamp with time zone")
            } else {
                matches!(ty.as_str(), "timestamp" | "timestamp without time zone")
            };
        }
        match scalar.as_str() {
            "string" => ty == "text",
            "boolean" => matches!(ty.as_str(), "boolean" | "bool"),
            "binary" => ty == "bytea",
            "date" => ty == "date",
            _ => false,
        }
    })())
}

/// Rust port of the registered binding package callback. The callback is run
/// by Engine validation after the actual package schema has been evaluated;
/// it deliberately keeps unknown authored properties as warnings.
struct BindingSemantics;
impl Capabilities for BindingSemantics {
    fn validate_extension(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        {
            let _ = (token, payload, context);
            Err(Utf16::from(
                "Binding semantics requires an invocation context",
            ))
        }
    }
    fn validate_extension_with_context(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        ctx.charge_work(1, context.path.clone())
            .map_err(CapabilityError::Engine)?;
        let diagnostics =
            binding_semantics(token, payload, context, ctx).map_err(CapabilityError::Engine)?;
        ctx.charge_work(diagnostics.len(), context.path.clone())
            .map_err(CapabilityError::Engine)?;
        Ok(diagnostics)
    }
}

fn binding_identity_work(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let units = ["module", "element", "field", "id", "name"]
        .iter()
        .filter_map(|name| string_member(value, name))
        .map(Utf16::len)
        .fold(1usize, usize::saturating_add);
    ctx.charge_work(units.saturating_mul(64), Utf16::default())
}
fn binding_label(value: &Value, name: &str, expected: &str) -> bool {
    string_member(value, name) == Some(&Utf16::from(expected))
}
fn binding_pair_ref(value: &Value) -> Option<(&Utf16, &Utf16)> {
    Some((
        string_member(value, "module")?,
        string_member(value, "element")?,
    ))
}
fn binding_field_key(value: &Value) -> (Option<&Utf16>, Option<&Utf16>, Option<&Utf16>) {
    (
        string_member(value, "module"),
        string_member(value, "element"),
        string_member(value, "field"),
    )
}
fn binding_add(
    out: &mut Vec<Diagnostic>,
    base: &Utf16,
    suffix: &str,
    code: &str,
    message: &str,
    severity: Severity,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(
        base.len() + suffix.len() + code.len() + message.len() + 128,
        Utf16::default(),
    )?;
    let mut path = base.units().to_vec();
    path.extend(suffix.encode_utf16());
    out.push(Diagnostic {
        code: Utf16::from(code),
        path: Utf16::new(path),
        python_source_path: false,
        message: Utf16::from(message),
        severity,
        python_text_origin: None,
    });
    Ok(())
}
fn binding_unknown(
    value: &Value,
    allowed: &[&str],
    base: &Utf16,
    prefix: &str,
    out: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    for (key, _) in js_object_members(value, ctx)? {
        ctx.charge_work(
            key.len()
                .saturating_mul(2)
                .saturating_add(base.len() + prefix.len() + 128),
            Utf16::default(),
        )?;
        if !key_allowed(key, allowed) {
            let mut path = base.units().to_vec();
            path.extend(prefix.encode_utf16());
            path.push(47);
            for (index, unit) in key.units().iter().enumerate() {
                if index % 1024 == 0 {
                    ctx.charge_work(1, Utf16::default())?;
                }
                match *unit {
                    126 => path.extend([126, 48]),
                    47 => path.extend([126, 49]),
                    unit => path.push(unit),
                }
            }
            out.push(Diagnostic {
                code: Utf16::from("BINDING_UNKNOWN"),
                path: Utf16::new(path),
                python_source_path: false,
                message: Utf16::from("Unknown binding content retained"),
                severity: Severity::Warning,
                python_text_origin: None,
            });
        }
    }
    Ok(())
}
fn binding_semantics(
    token: u64,
    payload: &Value,
    context: &SemanticContext,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let mut out = Vec::new();
    let base = &context.path;
    macro_rules! add {
        ($code:expr,$suffix:expr,$message:expr) => {
            binding_add(
                &mut out,
                base,
                $suffix,
                $code,
                $message,
                Severity::Error,
                ctx,
            )?
        };
    }
    if context.scope != "document" {
        add!(
            "BINDING_SCOPE",
            "",
            "Binding payload belongs to its own document"
        );
    }
    if !array(&context.document, "modules").is_empty() {
        add!(
            "BINDING_SCOPE",
            "/modules",
            "A binding document does not contain logical modules"
        );
    }
    if token != 3 && token != 4 {
        return Ok(out);
    }
    binding_unknown(
        payload,
        &[
            "profile",
            "logical",
            "target",
            "elements",
            "fields",
            "relationships",
            "indexes",
        ],
        base,
        "",
        &mut out,
        ctx,
    )?;
    binding_unknown(
        member(payload, "logical").unwrap_or(&Value::Null),
        &["documentId", "coreVersion"],
        base,
        "/logical",
        &mut out,
        ctx,
    )?;
    binding_unknown(
        member(payload, "target").unwrap_or(&Value::Null),
        &["system", "version", "subset"],
        base,
        "/target",
        &mut out,
        ctx,
    )?;
    let mut seen = BTreeSet::new();
    for (i, row) in array(payload, "elements").iter().enumerate() {
        binding_identity_work(row, ctx)?;
        if !seen.insert(binding_pair_ref(row)) {
            add!(
                "BINDING_DUPLICATE",
                &format!("/elements/{i}"),
                "Duplicate elements assignment"
            );
        }
    }
    for (i, row) in array(payload, "elements").iter().enumerate() {
        binding_unknown(
            row,
            &["module", "element", "partition", "table"],
            base,
            &format!("/elements/{i}"),
            &mut out,
            ctx,
        )?;
    }
    let mut seen = BTreeSet::new();
    for (i, row) in array(payload, "fields").iter().enumerate() {
        binding_identity_work(row, ctx)?;
        if !seen.insert(binding_field_key(row)) {
            add!(
                "BINDING_DUPLICATE",
                &format!("/fields/{i}"),
                "Duplicate fields assignment"
            );
        }
    }
    for (i, row) in array(payload, "fields").iter().enumerate() {
        binding_unknown(
            row,
            &[
                "module",
                "element",
                "field",
                "storage",
                "column",
                "documentColumn",
                "path",
            ],
            base,
            &format!("/fields/{i}"),
            &mut out,
            ctx,
        )?;
    }
    let stable = token == 4;
    let mut seen = BTreeSet::new();
    for (i, row) in array(payload, "relationships").iter().enumerate() {
        binding_identity_work(row, ctx)?;
        let id = (
            string_member(row, "module"),
            string_member(row, if stable { "id" } else { "name" }),
        );
        if !seen.insert(id) {
            add!(
                "BINDING_DUPLICATE",
                &format!("/relationships/{i}"),
                "Duplicate relationships assignment"
            );
        }
    }
    for (i, row) in array(payload, "relationships").iter().enumerate() {
        binding_unknown(
            row,
            if stable {
                &["module", "id", "storage"]
            } else {
                &["module", "name", "storage"]
            },
            base,
            &format!("/relationships/{i}"),
            &mut out,
            ctx,
        )?;
    }
    for (i, row) in array(payload, "fields").iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        if binding_label(row, "storage", "column")
            && !string_member(row, "column").is_some_and(|s| !s.is_empty())
        {
            add!(
                "BINDING_COLUMN",
                &format!("/fields/{i}/column"),
                "Column storage needs an explicit column name"
            );
        }
        if binding_label(row, "storage", "column")
            && (member(row, "documentColumn").is_some() || member(row, "path").is_some())
        {
            add!(
                "BINDING_PATH",
                &format!("/fields/{i}"),
                "Column storage cannot also declare an embedded path"
            );
        }
        if binding_label(row, "storage", "embedded")
            && (member(row, "documentColumn").is_none()
                || array_items(member(row, "path").unwrap_or(&Value::Null))
                    .is_none_or(|a| a.is_empty()))
        {
            add!(
                "BINDING_PATH",
                &format!("/fields/{i}"),
                "Embedded storage needs a document column and nonempty path"
            );
        }
        if binding_label(row, "storage", "embedded") && member(row, "column").is_some() {
            add!(
                "BINDING_COLUMN",
                &format!("/fields/{i}/column"),
                "Embedded storage cannot also declare a standalone column"
            );
        }
    }
    let mut fields = BTreeMap::new();
    for field in array(payload, "fields") {
        binding_identity_work(field, ctx)?;
        fields.insert(binding_field_key(field), field);
    }
    let mut index_names = BTreeSet::new();
    for (i, item) in array(payload, "indexes").iter().enumerate() {
        binding_identity_work(item, ctx)?;
        let bp = format!("/indexes/{i}");
        binding_unknown(
            item,
            &["name", "kind", "on", "predicate", "unique", "include"],
            base,
            &bp,
            &mut out,
            ctx,
        )?;
        if let Some(pred) = member(item, "predicate") {
            binding_unknown(
                pred,
                &["language", "version", "expression"],
                base,
                &format!("{bp}/predicate"),
                &mut out,
                ctx,
            )?;
        }
        if binding_label(item, "kind", "unique")
            && !truth(member(item, "unique").unwrap_or(&Value::Null))
        {
            add!(
                "BINDING_INDEX",
                &format!("{bp}/unique"),
                "Unique kind requires unique true"
            );
        }
        if binding_label(item, "kind", "clustering")
            && truth(member(item, "unique").unwrap_or(&Value::Null))
        {
            add!(
                "BINDING_INDEX",
                &format!("{bp}/unique"),
                "Clustering cannot be unique"
            );
        }
        if binding_label(item, "kind", "partial") && member(item, "predicate").is_none() {
            add!(
                "BINDING_INDEX",
                &format!("{bp}/predicate"),
                "Partial kind requires a predicate"
            );
        }
        if !binding_label(item, "kind", "partial") && member(item, "predicate").is_some() {
            add!(
                "BINDING_INDEX",
                &format!("{bp}/predicate"),
                "Predicate requires partial kind"
            );
        }
        let mut has_path = false;
        for target in array(item, "on") {
            ctx.charge_work(1, Utf16::default())?;
            has_path |= member(target, "documentPath").is_some();
        }
        if binding_label(item, "kind", "expression") && !has_path {
            add!(
                "BINDING_INDEX",
                &format!("{bp}/on"),
                "This expression profile needs a declared embedded document path"
            );
        }
        let mut owners = BTreeSet::new();
        let mut first_owner = None;
        let mut targets = BTreeSet::new();
        let mut direct_targets = BTreeSet::new();
        for (j, target) in array(item, "on").iter().enumerate() {
            ctx.charge_work(1, Utf16::default())?;
            let document_path = member(target, "documentPath");
            let direct = member(target, "field");
            let reference = direct.unwrap_or_else(|| {
                member(document_path.unwrap_or(&Value::Null), "field").unwrap_or(&Value::Null)
            });
            let tp = format!("{bp}/on/{j}");
            binding_unknown(target, &["field", "documentPath"], base, &tp, &mut out, ctx)?;
            if let Some(path) = document_path {
                binding_unknown(
                    path,
                    &["field", "path"],
                    base,
                    &format!("{tp}/documentPath"),
                    &mut out,
                    ctx,
                )?;
            }
            binding_unknown(
                reference,
                &["module", "element", "field"],
                base,
                &format!(
                    "{tp}/{}",
                    if direct.is_some() {
                        "field"
                    } else {
                        "documentPath/field"
                    }
                ),
                &mut out,
                ctx,
            )?;
            binding_identity_work(reference, ctx)?;
            let key = binding_field_key(reference);
            let owner = (key.0, key.1);
            owners.insert(owner);
            if first_owner.is_none() {
                first_owner = Some(owner);
            }
            let ordered = javascript_ordered_value(target, ctx)?;
            let identity = umf_core::serialization::stringify_compact_metered(&ordered, ctx)?;
            ctx.charge_work(identity.len().saturating_mul(64), Utf16::default())?;
            if !targets.insert(identity) {
                add!("BINDING_INDEX", &tp, "Duplicate ordered index target");
            }
            if direct.is_some() {
                direct_targets.insert(key);
            }
            if let Some(field) = fields.get(&key) {
                if let Some(document_path) = document_path {
                    let ordered = javascript_ordered_value(
                        member(field, "path").unwrap_or(&Value::Null),
                        ctx,
                    )?;
                    let authored = javascript_ordered_value(
                        member(document_path, "path").unwrap_or(&Value::Null),
                        ctx,
                    )?;
                    let ordered =
                        umf_core::serialization::stringify_compact_metered(&ordered, ctx)?;
                    let authored =
                        umf_core::serialization::stringify_compact_metered(&authored, ctx)?;
                    ctx.charge_work(
                        ordered.len().min(authored.len()).saturating_add(1),
                        Utf16::default(),
                    )?;
                    if !binding_label(field, "storage", "embedded") || ordered != authored {
                        add!(
                            "BINDING_INDEX",
                            &tp,
                            "Document path differs from embedded field binding"
                        );
                    }
                } else if !binding_label(field, "storage", "column") {
                    add!("BINDING_INDEX", &tp, "Field target requires column storage");
                }
            } else {
                add!(
                    "BINDING_INDEX",
                    &tp,
                    "Index target has no declared field binding"
                );
            }
        }
        if owners.len() != 1 {
            add!(
                "BINDING_INDEX",
                &format!("{bp}/on"),
                "One index cannot span logical owner elements"
            );
        }
        let owner = first_owner.unwrap_or_default();
        if !index_names.insert((owner, string_member(item, "name"))) {
            add!(
                "BINDING_DUPLICATE",
                &format!("{bp}/name"),
                "Duplicate index name in table scope"
            );
        }
        let mut includes = BTreeSet::new();
        for (j, reference) in array(item, "include").iter().enumerate() {
            binding_identity_work(reference, ctx)?;
            let ip = format!("{bp}/include/{j}");
            binding_unknown(
                reference,
                &["module", "element", "field"],
                base,
                &ip,
                &mut out,
                ctx,
            )?;
            let key = binding_field_key(reference);
            if fields
                .get(&key)
                .is_none_or(|field| !binding_label(field, "storage", "column"))
            {
                add!(
                    "BINDING_INDEX",
                    &ip,
                    "Included field requires declared column storage"
                );
            }
            if (key.0, key.1) != owner {
                add!(
                    "BINDING_INDEX",
                    &ip,
                    "Included field belongs to another table"
                );
            }
            if !includes.insert(key) || direct_targets.contains(&key) {
                add!(
                    "BINDING_INDEX",
                    &ip,
                    "Duplicate or overlapping include field"
                );
            }
        }
    }
    Ok(out)
}

fn binding_locate<'a>(
    document: &'a Value,
    module: &Utf16,
    element: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Option<(usize, usize, &'a Value, &'a Value)>, EngineError> {
    for (mi, m) in array(document, "modules").iter().enumerate() {
        ctx.charge_work(module.len().saturating_add(1), Utf16::default())?;
        if string_member(m, "id") != Some(module) {
            continue;
        }
        for (ei, e) in array(m, "elements").iter().enumerate() {
            ctx.charge_work(element.len().saturating_add(1), Utf16::default())?;
            if string_member(e, "id") == Some(element) {
                return Ok(Some((mi, ei, m, e)));
            }
        }
        return Ok(None);
    }
    Ok(None)
}
fn binding_value_work(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    let mut pending = vec![value];
    while let Some(value) = pending.pop() {
        ctx.charge_work(1, Utf16::default())?;
        match value {
            Value::String(text) => ctx.charge_work(text.len(), Utf16::default())?,
            Value::Array(items) => {
                ctx.charge_work(items.len(), Utf16::default())?;
                pending.extend(items);
            }
            Value::Object(fields) => {
                ctx.charge_work(fields.len(), Utf16::default())?;
                for (key, value) in fields {
                    ctx.charge_work(key.len(), Utf16::default())?;
                    pending.push(value);
                }
            }
            _ => {}
        }
    }
    Ok(())
}
fn binding_access_add(
    out: &mut Vec<Value>,
    source: &Utf16,
    code: &str,
    path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(
        source
            .len()
            .saturating_add(path.len())
            .saturating_add(code.len())
            .saturating_add(160),
        Utf16::default(),
    )?;
    out.push(access_diag(code, source, path.clone()));
    Ok(())
}
fn binding_child(base: &Utf16, segment: &str, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_work(
        base.len().saturating_add(segment.len()).saturating_add(1),
        Utf16::default(),
    )?;
    let mut units = base.units().to_vec();
    units.push(47);
    units.extend(segment.encode_utf16());
    Ok(Utf16::new(units))
}
fn inspect_binding_declaration(
    engine: &CodegenEngine<'_>,
    source: &Utf16,
    logical: &Value,
    logical_validation: &[Diagnostic],
    binding_doc: &Value,
    set: &Value,
    set_path: &Utf16,
    selected: &[Value],
    selected_member_ids: &BTreeSet<(Utf16, Utf16)>,
    diagnostics: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let profile_path = binding_child(set_path, "target", ctx)?;
    let payload = member(
        member(binding_doc, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .unwrap_or(&Value::Null);
    let binding_path = binding_child(set_path, "binding", ctx)?;
    let platform = string_member(member(set, "target").unwrap_or(&Value::Null), "platform");
    let major = string_member(
        member(set, "target").unwrap_or(&Value::Null),
        "majorVersion",
    );
    let logical_id = string_member(logical, "id");
    let logical_version = string_member(logical, "umf");
    let profile = string_member(payload, "profile");

    // `getBinding` first copies and validates the complete binding document
    // against both registered package schemas and their semantic callback.
    // Keep the operation's live Context so schema work and host controls are
    // cumulative with access inspection.
    let vocabulary = member(
        member(binding_doc, "vocabularies").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .and_then(|v| string_member(v, "version"));
    let registry = engine.resources().binding_registry();
    if let Some(version) =
        vocabulary.filter(|v| *v == &Utf16::from("0.1.0") || *v == &Utf16::from("0.2.0"))
    {
        let (package, compiled, expected_token) = if version == &Utf16::from("0.1.0") {
            (
                engine.resources().binding_package(),
                engine.resources().binding_compiled(),
                3,
            )
        } else {
            (
                engine.resources().stable_binding_package(),
                engine.resources().stable_binding_compiled(),
                4,
            )
        };
        let registration = registry.get(&Utf16::from("umf.binding"), version);
        let package_schema = member(package, "schema");
        // These immutable snapshots are equal by construction; the retained
        // consistency guard still accounts for both complete comparisons.
        binding_value_work(compiled.schema_value(), ctx)?;
        binding_value_work(compiled.schema_value(), ctx)?;
        if package_schema != Some(compiled.schema_value())
            || registration.is_none_or(|r| {
                r.token() != Some(expected_token)
                    || r.schema().schema_value() != compiled.schema_value()
            })
        {
            return Err(EngineError::new(
                "RESOURCE_BINDING_SCHEMA",
                binding_path,
                "Trusted binding package/schema registry is inconsistent",
            ));
        }
    }
    let mut capabilities = BindingSemantics;
    let validation = engine.resources().engine().validate_document(
        binding_doc,
        registry,
        &mut capabilities,
        ctx,
    )?;
    if vocabulary.is_none_or(|v| v != &Utf16::from("0.1.0") && v != &Utf16::from("0.2.0"))
        || !validation.valid
    {
        binding_access_add(diagnostics, source, "ACCESS_REFERENCE", &binding_path, ctx)?;
        return Ok(());
    }
    // `inspectBinding` resolves every authored reference against the supplied
    // logical document. Its failure is caught by the access inspector at the
    // binding declaration boundary, so preserve that single diagnostic.
    let mut correspondence_valid = true;
    if string_member(
        member(payload, "logical").unwrap_or(&Value::Null),
        "documentId",
    ) != logical_id
        || string_member(
            member(payload, "logical").unwrap_or(&Value::Null),
            "coreVersion",
        ) != logical_version
    {
        correspondence_valid = false;
    }
    for (index, row) in array(payload, "elements").iter().enumerate() {
        ctx.charge_work(1, indexed("/extensions/umf.binding/elements", index))?;
        binding_identity_work(row, ctx)?;
        let Some((module, element)) = binding_pair_ref(row) else {
            correspondence_valid = false;
            continue;
        };
        if binding_locate(logical, &module, &element, ctx)?.is_none() {
            correspondence_valid = false;
        }
    }
    for (index, row) in array(payload, "fields").iter().enumerate() {
        ctx.charge_work(1, indexed("/extensions/umf.binding/fields", index))?;
        binding_identity_work(row, ctx)?;
        let Some((module, element)) = binding_pair_ref(row) else {
            correspondence_valid = false;
            continue;
        };
        let owner = binding_locate(logical, &module, &element, ctx)?.map(|(_, _, _, e)| e);
        let mut found = owner.is_some_and(|e| binding_label(e, "kind", "field"));
        if let Some(field_name) = string_member(row, "field") {
            found = false;
            if let Some(fields) = member(
                member(
                    member(owner.unwrap_or(&Value::Null), "extensions").unwrap_or(&Value::Null),
                    "umf.ddd",
                )
                .unwrap_or(&Value::Null),
                "fields",
            )
            .and_then(object)
            {
                for (name, _) in fields {
                    ctx.charge_work(
                        name.len()
                            .saturating_add(field_name.len())
                            .saturating_add(1),
                        Utf16::default(),
                    )?;
                    if name == field_name {
                        found = true;
                        break;
                    }
                }
            }
        }
        if !found {
            correspondence_valid = false;
        }
    }
    let stable = profile == Some(&Utf16::from("umf-binding-2"));
    for (index, row) in array(payload, "relationships").iter().enumerate() {
        ctx.charge_work(1, indexed("/extensions/umf.binding/relationships", index))?;
        binding_identity_work(row, ctx)?;
        let Some(module_id) = string_member(row, "module") else {
            correspondence_valid = false;
            continue;
        };
        let mut module = None;
        for candidate in array(logical, "modules") {
            ctx.charge_work(module_id.len() + 1, Utf16::default())?;
            if string_member(candidate, "id") == Some(module_id) {
                module = Some(candidate);
                break;
            }
        }
        let authored = module.map(|m| array(m, "relationships")).unwrap_or(&[]);
        ctx.charge_work(authored.len(), indexed("/modules", 0))?;
        let mut matches = 0;
        for relation in authored {
            binding_identity_work(relation, ctx)?;
            if (stable
                && string_member(row, "id")
                    .is_some_and(|id| string_member(relation, "id") == Some(id)))
                || (!stable
                    && string_member(row, "name")
                        .is_some_and(|name| string_member(relation, "name") == Some(name)))
            {
                matches += 1;
            }
        }
        if matches != 1 || stable && logical_version != Some(&Utf16::from("0.10.0")) {
            correspondence_valid = false;
        }
    }
    if !correspondence_valid {
        binding_access_add(diagnostics, source, "ACCESS_REFERENCE", &binding_path, ctx)?;
        return Ok(());
    }

    // TypeScript calls getBinding and checks reference correspondence before
    // projecting binding completeness or unknown ColumnSet content.
    if !validation.complete {
        ctx.charge_work(
            source
                .len()
                .saturating_add(binding_path.len())
                .saturating_add(160),
            Utf16::default(),
        )?;
        diagnostics.push(unknown_diag(source, binding_path.clone()));
    }
    let mut selected_set = false;
    for column in array(set, "columns") {
        ctx.charge_work(1, set_path.clone())?;
        if let Some(field) =
            metered_reference(member(column, "field").unwrap_or(&Value::Null), ctx)?
        {
            ctx.charge_work(
                field.0.len().saturating_add(field.1.len()),
                Utf16::default(),
            )?;
            if selected_member_ids.contains(&field) {
                selected_set = true;
                break;
            }
        }
    }
    if selected_set {
        for (value, allowed, base) in [
            (set, &["binding", "target", "columns"][..], set_path.clone()),
            (
                member(set, "binding").unwrap_or(&Value::Null),
                &["sourceId", "module"][..],
                binding_path.clone(),
            ),
            (
                member(set, "target").unwrap_or(&Value::Null),
                &["platform", "majorVersion"][..],
                profile_path.clone(),
            ),
        ] {
            for (key, _) in js_object_members(value, ctx)? {
                if !key_allowed(key, allowed) {
                    let unknown_path = metered_path(&base, key, ctx)?;
                    ctx.charge_work(
                        source
                            .len()
                            .saturating_add(unknown_path.len())
                            .saturating_add(160),
                        Utf16::default(),
                    )?;
                    diagnostics.push(unknown_diag(source, unknown_path));
                }
            }
        }
        for (index, column) in array(set, "columns").iter().enumerate() {
            let column_path = binding_child(set_path, &format!("columns/{index}"), ctx)?;
            for (key, _) in js_object_members(column, ctx)? {
                if !key_allowed(
                    key,
                    &["field", "type", "notNull", "generation", "collation"],
                ) {
                    let unknown_path = metered_path(&column_path, key, ctx)?;
                    ctx.charge_work(
                        source
                            .len()
                            .saturating_add(unknown_path.len())
                            .saturating_add(160),
                        Utf16::default(),
                    )?;
                    diagnostics.push(unknown_diag(source, unknown_path));
                }
            }
            if let Some(collation) = member(column, "collation") {
                if !platform.is_some_and(|p| {
                    p == &Utf16::from("postgresql") || p == &Utf16::from("lakebase")
                }) {
                    let native_path = binding_child(&column_path, "collation", ctx)?;
                    binding_access_add(diagnostics, source, "ACCESS_NATIVE", &native_path, ctx)?;
                }
                if object(collation).is_some() {
                    let collation_path = binding_child(&column_path, "collation", ctx)?;
                    for (key, _) in js_object_members(collation, ctx)? {
                        if !key_allowed(key, &["schema", "name"]) {
                            let unknown_path = metered_path(&collation_path, key, ctx)?;
                            ctx.charge_work(
                                source
                                    .len()
                                    .saturating_add(unknown_path.len())
                                    .saturating_add(160),
                                Utf16::default(),
                            )?;
                            diagnostics.push(unknown_diag(source, unknown_path));
                        }
                    }
                }
            }
        }
    }

    let target = member(payload, "target").unwrap_or(&Value::Null);
    let raw_profile = platform.is_some_and(|p| {
        ["lakebase", "unity-catalog", "spark-delta"]
            .iter()
            .any(|x| p == &Utf16::from(*x))
    });
    let profile_ok = (raw_profile
        && profile == Some(&Utf16::from("umf-binding-2"))
        && binding_label(target, "subset", "typed-access-columns/0.1")
        && string_member(target, "system") == platform
        && string_member(target, "version") == major
        && binding_label(binding_doc, "umf", "0.10.0")
        && binding_label(
            member(
                member(binding_doc, "vocabularies").unwrap_or(&Value::Null),
                "umf.binding",
            )
            .unwrap_or(&Value::Null),
            "version",
            "0.2.0",
        )
        && only_keys(
            member(set, "target").unwrap_or(&Value::Null),
            &["platform", "majorVersion"],
            ctx,
        )?
        && binding_label(
            member(payload, "logical").unwrap_or(&Value::Null),
            "coreVersion",
            "0.10.0",
        ))
        || (platform == Some(&Utf16::from("postgresql"))
            && binding_label(target, "system", "postgresql")
            && string_member(target, "version")
                .zip(major)
                .is_some_and(|(v, m)| v.units().split(|u| *u == 46).next() == Some(m.units())));
    if !profile_ok || !array(binding_doc, "modules").is_empty() {
        binding_access_add(diagnostics, source, "ACCESS_REFERENCE", &profile_path, ctx)?;
    }
    if string_member(
        member(payload, "logical").unwrap_or(&Value::Null),
        "documentId",
    ) != logical_id
        || string_member(
            member(payload, "logical").unwrap_or(&Value::Null),
            "coreVersion",
        ) != logical_version
    {
        binding_access_add(diagnostics, source, "ACCESS_REFERENCE", &binding_path, ctx)?;
    }
    let bound_module = string_member(member(set, "binding").unwrap_or(&Value::Null), "module");
    let binding_elements = array(payload, "elements");
    let mut module_bound = false;
    for row in binding_elements {
        binding_identity_work(row, ctx)?;
        if string_member(row, "module") == bound_module && string_member(row, "element").is_some() {
            module_bound = true;
            break;
        }
    }
    if raw_profile && (!module_bound || bound_module.is_none_or(Utf16::is_empty)) {
        binding_access_add(diagnostics, source, "ACCESS_REFERENCE", &profile_path, ctx)?;
    }
    let fields = array(payload, "fields");
    let relationships = array(payload, "relationships");
    let indexes = array(payload, "indexes");
    if raw_profile && (!relationships.is_empty() || !indexes.is_empty()) {
        binding_access_add(diagnostics, source, "ACCESS_REFERENCE", &profile_path, ctx)?;
    }
    let mut selected_members = BTreeSet::new();
    for selected_ref in selected {
        ctx.charge_work(1, Utf16::from("/records"))?;
        binding_identity_work(selected_ref, ctx)?;
        if let Some((module, element)) = binding_pair_ref(selected_ref) {
            let mut supplied = false;
            for row in binding_elements {
                binding_identity_work(row, ctx)?;
                if binding_pair_ref(row) == Some((module, element)) {
                    supplied = true;
                    break;
                }
            }
            if !supplied {
                continue;
            }
            if let Some((_, _, _, record)) = binding_locate(logical, &module, &element, ctx)? {
                ctx.charge_work(array(record, "members").len(), Utf16::from("/members"))?;
                for field in array(record, "members") {
                    binding_identity_work(field, ctx)?;
                    if let Some(field) = binding_pair_ref(field) {
                        selected_members.insert(field);
                    }
                }
            }
        }
    }
    if raw_profile {
        let mut owners: BTreeMap<(&Utf16, &Utf16), Vec<(&Utf16, &Utf16)>> = BTreeMap::new();
        let mut seen_tables = BTreeSet::new();
        let mut raw_members_complete = true;
        for (i, row) in binding_elements.iter().enumerate() {
            ctx.charge_work(1, indexed("/extensions/umf.binding/elements", i))?;
            binding_identity_work(row, ctx)?;
            let Some((m, e)) = binding_pair_ref(row) else {
                binding_access_add(diagnostics, source, "ACCESS_REFERENCE", &binding_path, ctx)?;
                continue;
            };
            let table = string_member(row, "table");
            ctx.charge_work(
                table.map_or(0, Utf16::len).saturating_mul(64),
                Utf16::default(),
            )?;
            if table.is_none_or(Utf16::is_empty)
                || member(row, "partition").is_some()
                || binding_locate(logical, &m, &e, ctx)?
                    .is_none_or(|(_, _, _, el)| !binding_label(el, "kind", "record"))
            {
                binding_access_add(diagnostics, source, "ACCESS_REFERENCE", &profile_path, ctx)?;
            }
            if let Some(table) = table {
                if !seen_tables.insert(table) {
                    binding_access_add(
                        diagnostics,
                        source,
                        "ACCESS_REFERENCE",
                        &profile_path,
                        ctx,
                    )?;
                }
            }
            if let Some((mi, ei, _, record)) = binding_locate(logical, &m, &e, ctx)? {
                let members_path = Utf16::from(format!("/modules/{mi}/elements/{ei}/members"));
                let mut partial = false;
                for d in logical_validation {
                    ctx.charge_work(
                        d.code.len() + d.path.len() + members_path.len() + 1,
                        Utf16::default(),
                    )?;
                    if d.severity == Severity::Warning
                        && d.code == Utf16::from("UNKNOWN_KEY_QUALIFIER")
                        && (d.path == members_path
                            || (d.path.units().starts_with(members_path.units())
                                && d.path.units().get(members_path.len()) == Some(&47)))
                    {
                        partial = true;
                        break;
                    }
                }
                if !binding_label(record, "kind", "record")
                    || member(record, "members").and_then(array_items).is_none()
                    || partial
                {
                    raw_members_complete = false;
                }
                ctx.charge_work(array(record, "members").len(), members_path.clone())?;
                for field in array(record, "members") {
                    binding_identity_work(field, ctx)?;
                    if let Some(field) = binding_pair_ref(field) {
                        owners.entry(field).or_default().push((m, e));
                    }
                }
            }
        }
        let mut physical_columns = BTreeSet::<(&Utf16, &Utf16, &Utf16)>::new();
        for (i, row) in fields.iter().enumerate() {
            ctx.charge_work(1, indexed("/extensions/umf.binding/fields", i))?;
            binding_identity_work(row, ctx)?;
            let Some(key) = binding_pair_ref(row) else {
                binding_access_add(diagnostics, source, "ACCESS_REFERENCE", &binding_path, ctx)?;
                continue;
            };
            let owner_count = owners.get(&key).map_or(0, Vec::len);
            let column = string_member(row, "column");
            ctx.charge_work(
                column.map_or(0, Utf16::len).saturating_mul(64),
                Utf16::default(),
            )?;
            if !binding_label(row, "storage", "column")
                || member(row, "field").is_some()
                || column.is_none_or(Utf16::is_empty)
                || member(row, "documentColumn").is_some()
                || member(row, "path").is_some()
                || owner_count != 1
            {
                binding_access_add(diagnostics, source, "ACCESS_REFERENCE", &profile_path, ctx)?;
            }
            if let (Some(table_owner), Some(column)) =
                (owners.get(&key).and_then(|v| v.first()), column)
            {
                let physical = (table_owner.0, table_owner.1, column);
                if !physical_columns.insert(physical) {
                    binding_access_add(
                        diagnostics,
                        source,
                        "ACCESS_REFERENCE",
                        &profile_path,
                        ctx,
                    )?;
                }
            }
        }
        if raw_profile && !raw_members_complete {
            binding_access_add(diagnostics, source, "ACCESS_REFERENCE", &profile_path, ctx)?;
        }
    }
    let mut seen_columns = BTreeSet::<(&Utf16, &Utf16)>::new();
    for (i, column) in array(set, "columns").iter().enumerate() {
        ctx.charge_work(1, indexed(&set_path.to_utf8().unwrap_or_default(), i))?;
        let column_ref = member(column, "field").unwrap_or(&Value::Null);
        binding_identity_work(column_ref, ctx)?;
        let Some((module, element)) = binding_pair_ref(column_ref) else {
            binding_access_add(
                diagnostics,
                source,
                "ACCESS_REFERENCE",
                &binding_child(set_path, &format!("columns/{i}"), ctx)?,
                ctx,
            )?;
            continue;
        };
        let mut binding_field = None;
        for row in fields {
            ctx.charge_work(module.len() + element.len() + 1, Utf16::default())?;
            if string_member(row, "module") == Some(module)
                && string_member(row, "element") == Some(element)
                && binding_label(row, "storage", "column")
                && member(row, "column").is_some()
            {
                binding_field = Some(row);
                break;
            }
        }
        if Some(module) != bound_module || binding_field.is_none() {
            binding_access_add(
                diagnostics,
                source,
                "ACCESS_REFERENCE",
                &binding_child(
                    &binding_child(set_path, &format!("columns/{i}"), ctx)?,
                    "field",
                    ctx,
                )?,
                ctx,
            )?;
        }
        if !seen_columns.insert((module, element)) {
            binding_access_add(
                diagnostics,
                source,
                "ACCESS_REFERENCE",
                &binding_child(set_path, &format!("columns/{i}"), ctx)?,
                ctx,
            )?;
        }
    }
    for (module, element) in selected_members {
        let mut bound = false;
        for row in fields {
            ctx.charge_work(module.len() + element.len() + 1, Utf16::default())?;
            if string_member(row, "module") == Some(module)
                && string_member(row, "element") == Some(element)
                && binding_label(row, "storage", "column")
                && member(row, "column").is_some()
            {
                bound = true;
                break;
            }
        }
        let mut listed = false;
        for row in array(set, "columns") {
            ctx.charge_work(module.len() + element.len() + 1, Utf16::default())?;
            if binding_pair_ref(member(row, "field").unwrap_or(&Value::Null))
                == Some((module, element))
            {
                listed = true;
                break;
            }
        }
        if !bound || !listed {
            binding_access_add(
                diagnostics,
                source,
                "ACCESS_COVERAGE",
                &binding_child(set_path, "columns", ctx)?,
                ctx,
            )?;
        }
    }
    // Unknown content is retained by the schema/semantic callback. Raw
    // profiles require complete interpretation, so they cannot claim a
    // declarative projection when any warning remains.
    if !validation.complete && raw_profile {
        binding_access_add(diagnostics, source, "ACCESS_REFERENCE", &profile_path, ctx)?;
    }
    Ok(())
}

#[cfg(test)]
mod inspection_tests {
    use super::*;

    #[test]
    fn native_presence_key_order_and_reference_scans_keep_live_host_controls() {
        let field = obj([("scalarType", s("string")), ("cardinality", s("one"))]);
        let view = obj([]);
        let column = obj([("type", s("I".repeat(20_000)))]);
        let set = obj([(
            "target",
            obj([("platform", s("spark-delta")), ("majorVersion", s("4"))]),
        )]);
        let keys: Vec<_> = (0..128)
            .map(|index| obj([("id", s(format!("k{index}")))]))
            .collect();
        let selected = Utf16::from("k64");
        let mut observed = Context::ordinary();
        let sorted = selected_keys_first(keys.clone(), Some(&selected), &mut observed).unwrap();
        assert_eq!(string_member(&sorted[0], "id"), Some(&selected));
        assert_eq!(string_member(&sorted[1], "id"), Some(&Utf16::from("k0")));
        assert_eq!(string_member(&sorted[65], "id"), Some(&Utf16::from("k65")));
        for code in ["LIMIT", "CANCELLED", "VALUE_INVALID"] {
            let mut rendering = false;
            let mut polls = 0;
            let mut meter = |amount: usize| {
                if amount >= 60_000 {
                    rendering = true;
                } else if rendering && amount == 1 {
                    polls += 1;
                    if polls == 8 {
                        return Err(EngineError::new(
                            code,
                            Utf16::from("/host/native"),
                            "inside native spelling",
                        ));
                    }
                }
                Ok(())
            };
            let error = native_compatible(
                &field,
                &view,
                &column,
                &set,
                &obj([]),
                &BTreeMap::new(),
                &mut Context::ordinary().with_meter(&mut meter),
            )
            .unwrap_err();
            assert!(error.is_control_failure());
            assert_eq!(error.code, code);
            assert_eq!(error.path, Utf16::from("/host/native"));
            assert_eq!(polls, 8);
            let mut calls = 0;
            let mut meter = |_: usize| {
                calls += 1;
                if calls == 96 {
                    Err(EngineError::new(
                        code,
                        Utf16::from("/host/presence"),
                        "inside not-null scan",
                    ))
                } else {
                    Ok(())
                }
            };
            let error = check_presence_metered(
                "absent-allowed",
                false,
                "none",
                false,
                false,
                false,
                true,
                &vec![true; 128],
                false,
                false,
                false,
                false,
                false,
                &mut Context::ordinary().with_meter(&mut meter),
            )
            .unwrap_err();
            assert!(error.is_control_failure());
            assert_eq!(error.code, code);
            assert_eq!(error.path, Utf16::from("/host/presence"));
            assert_eq!(calls, 96);
            let mut calls = 0;
            let mut meter = |_: usize| {
                calls += 1;
                if calls == 96 {
                    Err(EngineError::new(
                        code,
                        Utf16::from("/host/key-order"),
                        "inside key comparison",
                    ))
                } else {
                    Ok(())
                }
            };
            let error = selected_keys_first(
                keys.clone(),
                Some(&selected),
                &mut Context::ordinary().with_meter(&mut meter),
            )
            .unwrap_err();
            assert!(error.is_control_failure());
            assert_eq!(error.code, code);
            assert_eq!(error.path, Utf16::from("/host/key-order"));
            assert_eq!(calls, 96);
        }
    }

    fn assert_meter_preserves_host_origin<F>(expected_work: u64, mut operation: F)
    where
        F: FnMut(&mut Context<'_>) -> Result<(), EngineError>,
    {
        for code in ["LIMIT", "NUMBER", "VALUE_INVALID"] {
            let mut work = 0u64;
            let stop_after = expected_work.saturating_mul(3) / 4;
            let mut meter = |amount: usize| {
                work = work.saturating_add(amount as u64);
                if work > stop_after {
                    Err(EngineError::new(code, Utf16::from("/host"), "host control"))
                } else {
                    Ok(())
                }
            };
            let result = operation(&mut Context::ordinary().with_meter(&mut meter));
            let error = result.expect_err("late resource control should interrupt the operation");
            assert!(error.is_control_failure());
            assert_eq!(error.code, code);
            assert_eq!(error.path, Utf16::from("/host"));
            assert!(work < expected_work);
        }
    }

    #[test]
    fn nested_field_lookup_propagates_late_host_control_origins() {
        let count = 48;
        let mut elements = Vec::new();
        for i in 0..count {
            let mut fields = vec![
                (Utf16::from("id"), s(format!("f{i}"))),
                (Utf16::from("kind"), s("field")),
                (
                    Utf16::from("cardinality"),
                    s(if i + 1 == count { "one" } else { "array" }),
                ),
            ];
            if i + 1 < count {
                fields.push((
                    Utf16::from("itemType"),
                    ref_value(&Utf16::from("m"), &Utf16::from(format!("f{}", i + 1))),
                ));
            }
            elements.push(Value::Object(fields));
        }
        let document = obj([(
            "modules",
            arr([obj([("id", s("m")), ("elements", Value::Array(elements))])]),
        )]);
        let start = (Utf16::from("m"), Utf16::from("f0"));
        let mut expected = Vec::new();
        let mut seen = BTreeSet::new();
        let mut observed = Context::ordinary();
        assert!(collect_nested_fields(
            &document,
            start.clone(),
            &mut expected,
            &mut seen,
            &mut observed
        )
        .unwrap());
        assert_eq!(expected.len(), count);
        let expected_work = observed.charged_work();
        assert_meter_preserves_host_origin(expected_work, |ctx| {
            let mut expected = Vec::new();
            let mut seen = BTreeSet::new();
            collect_nested_fields(&document, start.clone(), &mut expected, &mut seen, ctx)
                .map(|_| ())
        });
    }

    #[test]
    fn repeated_property_copies_propagate_late_host_control_origins() {
        let large = s("x".repeat(16 * 1024));
        let aliases = arr((0..8).map(|_| s("y".repeat(1024))));
        let field = obj([("title", large), ("aliases", aliases)]);
        let mut observed = Context::ordinary();
        properties(&field, &mut observed).unwrap();
        let expected_work = observed.charged_work();
        assert_meter_preserves_host_origin(expected_work, |ctx| {
            properties(&field, ctx).map(|_| ())
        });
    }

    #[test]
    fn binding_callback_observes_late_host_errors_before_diagnostic_copies() {
        let mut fields = vec![(Utf16::from("profile"), s("umf-binding-1"))];
        for i in 0..512 {
            fields.push((
                Utf16::from(format!("unknown-{i}-{}", "x".repeat(256))),
                Value::Null,
            ));
        }
        let payload = Value::Object(fields);
        let context = SemanticContext {
            document: obj([("modules", arr([]))]),
            source_document: None,
            source_payload: None,
            path: Utf16::from("/extensions/umf.binding"),
            scope: "document".into(),
        };
        let mut observed = Context::ordinary();
        let diagnostics = binding_semantics(3, &payload, &context, &mut observed).unwrap();
        assert_eq!(diagnostics.len(), 512);
        for code in ["LIMIT", "NUMBER", "VALUE_INVALID"] {
            let mut work = 0u64;
            let mut meter = |amount: usize| {
                work += amount as u64;
                if work > observed.charged_work() * 3 / 4 {
                    Err(EngineError::new(
                        code,
                        Utf16::from("/host"),
                        "stop before binding diagnostic copy",
                    ))
                } else {
                    Ok(())
                }
            };
            let error = BindingSemantics
                .validate_extension_with_context(
                    3,
                    &payload,
                    &context,
                    &mut Context::ordinary().with_meter(&mut meter),
                )
                .unwrap_err();
            let CapabilityError::Engine(error) = error else {
                panic!("host origin was erased")
            };
            assert!(error.is_control_failure());
            assert_eq!(error.code, code);
            assert_eq!(error.path, Utf16::from("/host"));
            assert!(work < observed.charged_work());
        }
    }

    #[test]
    fn inspection_presence_policy_covers_bound_generated_nested_and_optional_fields() {
        assert!(check_presence(
            "required",
            false,
            "none",
            true,
            false,
            false,
            false,
            &[],
            false,
            false,
            false,
            false,
            false
        ));
        assert!(!check_presence(
            "required",
            true,
            "none",
            false,
            false,
            false,
            false,
            &[],
            false,
            false,
            false,
            false,
            false
        ));
        assert!(check_presence(
            "absent-allowed",
            true,
            "missing",
            false,
            false,
            false,
            false,
            &[],
            false,
            true,
            true,
            true,
            false
        ));
        assert!(check_presence(
            "required",
            false,
            "none",
            false,
            false,
            true,
            true,
            &[true],
            false,
            false,
            false,
            true,
            false
        ));
        assert!(!check_presence(
            "required",
            false,
            "none",
            false,
            false,
            false,
            true,
            &[false],
            false,
            false,
            false,
            false,
            false
        ));
        assert!(check_presence(
            "required",
            false,
            "none",
            false,
            false,
            false,
            false,
            &[],
            true,
            false,
            false,
            false,
            false
        ));
        assert!(!check_presence(
            "unspecified",
            false,
            "none",
            false,
            false,
            false,
            false,
            &[],
            false,
            false,
            false,
            false,
            false
        ));
    }

    #[test]
    fn inspection_facet_projection_preserves_types_and_contract_order() {
        let facets = Value::Object(vec![
            (
                Utf16::from("range"),
                obj([
                    ("maxInclusive", Value::Bool(false)),
                    ("min", Value::Number(1.0)),
                    ("max", Value::Number(4.0)),
                    ("minInclusive", Value::Bool(true)),
                ]),
            ),
            (
                Utf16::from("length"),
                obj([
                    ("unit", s("unicode-scalar")),
                    ("min", Value::Number(2.0)),
                    ("max", Value::Number(9.0)),
                ]),
            ),
            (Utf16::from("precision"), Value::Number(10.0)),
            (Utf16::from("scale"), Value::Number(2.0)),
        ]);
        let projected =
            interpreted_facets(&obj([("facets", facets)]), &mut Context::ordinary()).unwrap();
        let keys = object(&projected)
            .unwrap()
            .iter()
            .map(|(k, _)| k.to_utf8().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(keys, ["length", "precision", "scale", "range"]);
        let length = member(&projected, "length").unwrap();
        assert_eq!(
            object(length)
                .unwrap()
                .iter()
                .map(|(k, _)| k.to_utf8().unwrap())
                .collect::<Vec<_>>(),
            ["max", "min", "unit"]
        );
        let range = member(&projected, "range").unwrap();
        assert_eq!(
            object(range)
                .unwrap()
                .iter()
                .map(|(k, _)| k.to_utf8().unwrap())
                .collect::<Vec<_>>(),
            ["min", "max", "minInclusive", "maxInclusive"]
        );
    }

    #[test]
    fn binding_semantics_preserves_unknown_utf16_keys_and_duplicate_assignments() {
        let lone = Utf16::new(vec![0xd800]);
        let payload = Value::Object(vec![
            (Utf16::from("profile"), s("umf-binding-1")),
            (
                Utf16::from("logical"),
                obj([("documentId", s("d")), ("coreVersion", s("0.10.0"))]),
            ),
            (
                Utf16::from("target"),
                obj([
                    ("system", s("postgresql")),
                    ("version", s("18.1")),
                    ("subset", s("x")),
                ]),
            ),
            (Utf16::from("elements"), arr([])),
            (Utf16::from("fields"), arr([])),
            (Utf16::from("relationships"), arr([])),
            (Utf16::from("indexes"), arr([])),
            (lone.clone(), s("retained")),
        ]);
        let context = SemanticContext {
            document: obj([("modules", arr([]))]),
            source_document: None,
            source_payload: None,
            path: Utf16::from("/extensions/umf.binding"),
            scope: "document".into(),
        };
        let diagnostics =
            binding_semantics(3, &payload, &context, &mut Context::ordinary()).unwrap();
        let unknown = diagnostics
            .iter()
            .find(|d| d.code == Utf16::from("BINDING_UNKNOWN"))
            .unwrap();
        assert!(unknown.path.units().ends_with(lone.units()));
        assert_eq!(unknown.severity, Severity::Warning);
    }
    fn chain_document(count: usize) -> Value {
        let mut fields = Vec::with_capacity(count);
        for i in 0..count {
            let mut field = obj([
                ("id", s(format!("f{i}"))),
                ("kind", s("field")),
                (
                    "cardinality",
                    s(if i + 1 < count { "array" } else { "one" }),
                ),
            ]);
            if i + 1 < count {
                if let Value::Object(members) = &mut field {
                    members.push((
                        Utf16::from("itemType"),
                        obj([("module", s("m")), ("element", s(format!("f{}", i + 1)))]),
                    ));
                }
            }
            fields.push(field);
        }
        let module = obj([("id", s("m")), ("elements", arr(fields))]);
        obj([("modules", arr([module]))])
    }
    #[test]
    fn nested_reference_graph_is_iterative_and_observes_late_host_failure() {
        let doc = chain_document(2048);
        let root = (Utf16::from("m"), Utf16::from("f0"));
        let mut expected = vec![(root.clone(), false)];
        let mut seen = BTreeSet::from([root.clone()]);
        let mut ctx = Context::ordinary();
        assert!(
            collect_nested_fields(&doc, root.clone(), &mut expected, &mut seen, &mut ctx).unwrap()
        );
        assert_eq!(expected.len(), 2048);
        assert!(!expected[0].1);
        assert!(expected[1..].iter().all(|(_, nested)| *nested));
        let limit = ctx.charged_work() as usize * 3 / 4;
        let mut spent = 0;
        let mut stop = |amount| {
            spent += amount;
            if spent >= limit {
                Err(EngineError::new(
                    "VALUE_INVALID",
                    Utf16::from("/host"),
                    "late collection graph stop",
                ))
            } else {
                Ok(())
            }
        };
        let mut expected = vec![(root.clone(), false)];
        let mut seen = BTreeSet::from([root.clone()]);
        let error = collect_nested_fields(
            &doc,
            root,
            &mut expected,
            &mut seen,
            &mut Context::ordinary().with_meter(&mut stop),
        )
        .unwrap_err();
        assert!(error.is_control_failure());
        assert!(spent >= limit && spent < (ctx.charged_work() as usize));
    }
    #[test]
    fn nested_invalid_reference_does_not_invent_reached_field() {
        let mut doc = chain_document(2);
        if let Value::Object(root) = &mut doc {
            let Value::Array(modules) = &mut root[0].1 else {
                unreachable!()
            };
            let Value::Object(module) = &mut modules[0] else {
                unreachable!()
            };
            let Value::Array(fields) = &mut module[1].1 else {
                unreachable!()
            };
            let Value::Object(last) = &mut fields[1] else {
                unreachable!()
            };
            last[1].1 = s("group");
        }
        let root = (Utf16::from("m"), Utf16::from("f0"));
        let mut expected = vec![(root.clone(), false)];
        let mut seen = BTreeSet::from([root.clone()]);
        assert!(!collect_nested_fields(
            &doc,
            root,
            &mut expected,
            &mut seen,
            &mut Context::ordinary()
        )
        .unwrap());
        assert_eq!(expected.len(), 1);
    }
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Selected search declaration admission; native proof remains catalog-owned.
use super::{arr, at, get_str, has_keys, obj, s};
use crate::value::{array_items, member};
use std::collections::BTreeSet;
use umf_core::{Context, EngineError, Utf16, Value};
fn items<'a>(v: &'a Value, key: &str) -> &'a [Value] {
    array_items(at(v, key)).unwrap_or(&[])
}
fn reference(v: &Value) -> bool {
    has_keys(v, &["module", "element"], &[])
        && matches!(member(v, "module"), Some(Value::String(_)))
        && matches!(member(v, "element"), Some(Value::String(_)))
}
fn string_is(
    v: &Value,
    key: &str,
    expected: &str,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let Some(Value::String(value)) = member(v, key) else {
        return Ok(false);
    };
    ctx.charge_work(value.units().len(), Utf16::default())?;
    Ok(value.units().iter().copied().eq(expected.encode_utf16()))
}
fn string_in(
    v: &Value,
    key: &str,
    expected: &[&str],
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let Some(value) = member(v, key) else {
        return Ok(false);
    };
    let max = expected.iter().map(|value| value.len()).max().unwrap_or(0);
    let mut output = Vec::<u16>::new();
    ctx.charge_work(max.saturating_add(1), Utf16::default())?;
    output
        .try_reserve_exact(max.saturating_add(1))
        .map_err(|_| {
            EngineError::new(
                "LIMIT",
                Utf16::default(),
                "Search enum coercion allocation failed",
            )
        })?;
    enum Part<'a> {
        Value(&'a Value),
        ArrayItem(&'a Value),
        ArrayNext(&'a [Value], usize),
    }
    fn append(
        output: &mut Vec<u16>,
        units: &[u16],
        max: usize,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        ctx.charge_work(units.len(), Utf16::default())?;
        let remaining = max.saturating_add(1).saturating_sub(output.len());
        output.extend(units.iter().take(remaining).copied());
        Ok(())
    }
    let mut pending = Vec::<Part<'_>>::new();
    ctx.charge_work(1, Utf16::default())?;
    pending.try_reserve(1).map_err(|_| {
        EngineError::new(
            "LIMIT",
            Utf16::default(),
            "Search enum coercion allocation failed",
        )
    })?;
    pending.push(Part::Value(value));
    while let Some(part) = pending.pop() {
        ctx.charge_work(1, Utf16::default())?;
        match part {
            Part::Value(Value::Null) => append(&mut output, &[110, 117, 108, 108], max, ctx)?,
            Part::Value(Value::Bool(value)) => {
                let text: &[u16] = if *value {
                    &[116, 114, 117, 101]
                } else {
                    &[102, 97, 108, 115, 101]
                };
                append(&mut output, text, max, ctx)?;
            }
            Part::Value(Value::Number(value)) => {
                ctx.charge_work(32, Utf16::default())?;
                let text = umf_core::ecma_number_to_string(*value);
                let units = text.encode_utf16().collect::<Vec<_>>();
                append(&mut output, &units, max, ctx)?;
            }
            Part::Value(Value::String(value)) => append(&mut output, value.units(), max, ctx)?,
            Part::Value(Value::Array(items)) => {
                ctx.charge_work(1, Utf16::default())?;
                pending.try_reserve(1).map_err(|_| {
                    EngineError::new(
                        "LIMIT",
                        Utf16::default(),
                        "Search enum coercion allocation failed",
                    )
                })?;
                pending.push(Part::ArrayNext(items, 0));
            }
            Part::Value(Value::Object(fields)) => {
                for (name, _) in fields {
                    ctx.charge_work(name.units().len().saturating_add(1), Utf16::default())?;
                    if name.units() == &[116, 111, 83, 116, 114, 105, 110, 103] {
                        return Err(EngineError::new(
                            "GENERATION_FAILED",
                            Utf16::default(),
                            "No default value",
                        ));
                    }
                }
                append(
                    &mut output,
                    &[
                        91, 111, 98, 106, 101, 99, 116, 32, 79, 98, 106, 101, 99, 116, 93,
                    ],
                    max,
                    ctx,
                )?;
            }
            Part::ArrayItem(Value::Null) => {}
            Part::ArrayItem(value) => {
                ctx.charge_work(1, Utf16::default())?;
                pending.try_reserve(1).map_err(|_| {
                    EngineError::new(
                        "LIMIT",
                        Utf16::default(),
                        "Search enum coercion allocation failed",
                    )
                })?;
                pending.push(Part::Value(value));
            }
            Part::ArrayNext(items, index) if index < items.len() => {
                if index > 0 {
                    append(&mut output, &[44], max, ctx)?;
                }
                ctx.charge_work(2, Utf16::default())?;
                pending.try_reserve(2).map_err(|_| {
                    EngineError::new(
                        "LIMIT",
                        Utf16::default(),
                        "Search enum coercion allocation failed",
                    )
                })?;
                pending.push(Part::ArrayNext(items, index + 1));
                pending.push(Part::ArrayItem(&items[index]));
            }
            Part::ArrayNext(_, _) => {}
        }
    }
    Ok(expected
        .iter()
        .any(|candidate| output.iter().copied().eq(candidate.encode_utf16())))
}
fn same(a: &Value, b: &Value) -> bool {
    member(a, "module") == member(b, "module") && member(a, "element") == member(b, "element")
}
fn owns(field: &Value, r: &Value) -> bool {
    member(field, "owned") != Some(&Value::Bool(false)) && same(at(field, "ref"), r)
}
fn is_object(v: &Value) -> bool {
    matches!(v, Value::Object(_))
}
fn safe_integer(v: &Value, min: f64, max: f64) -> bool {
    matches!(v,Value::Number(n)if n.is_finite()&&n.fract()==0.0&&*n>=min&&*n<=max)
}
fn charge_text_copy(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    if let Value::String(text) = value {
        ctx.charge_work(text.units().len(), Utf16::default())?;
    }
    Ok(())
}
fn charge_reference_copy(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    for key in ["module", "element"] {
        if let Some(value) = member(value, key) {
            charge_text_copy(value, ctx)?;
        }
    }
    Ok(())
}
fn find_index(
    values: &[Value],
    ctx: &mut Context<'_>,
    mut predicate: impl FnMut(&Value) -> bool,
) -> Result<Option<usize>, EngineError> {
    for (index, value) in values.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        if predicate(value) {
            return Ok(Some(index));
        }
    }
    Ok(None)
}
fn any_match(
    values: &[Value],
    ctx: &mut Context<'_>,
    mut predicate: impl FnMut(&Value) -> bool,
) -> Result<bool, EngineError> {
    for value in values {
        ctx.charge_work(1, Utf16::default())?;
        charge_text_copy(member(value, "scalarType").unwrap_or(&Value::Null), ctx)?;
        charge_text_copy(member(value, "cardinality").unwrap_or(&Value::Null), ctx)?;
        if predicate(value) {
            return Ok(true);
        }
    }
    Ok(false)
}
fn invalid_reference_list(values: &[Value], ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    for value in values {
        ctx.charge_work(1, Utf16::default())?;
        if !reference(value) {
            return Ok(true);
        }
    }
    Ok(false)
}
fn add(
    diags: &mut Vec<Value>,
    source: &str,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(source.len(), Utf16::default())?;
    ctx.charge_work(path.len(), Utf16::default())?;
    ctx.charge_work(4, Utf16::default())?;
    diags.push(obj([
        ("code", s("SEARCH_DECLARATION")),
        ("sourceId", s(source)),
        ("pointer", s(path)),
        (
            "message",
            s("Typed access declaration refused: SEARCH_DECLARATION"),
        ),
    ]));
    Ok(())
}
fn put(v: &mut Value, key: &str, value: Value) {
    if let Value::Object(members) = v {
        if let Some((_, v)) = members.iter_mut().find(|(k, _)| k == &Utf16::from(key)) {
            *v = value;
        } else {
            members.push((Utf16::from(key), value));
        }
    }
}
pub(super) fn inspect_selected_search(
    document: &Value,
    records: &mut [Value],
    source: &str,
    ctx: &mut Context<'_>,
) -> Result<(Vec<Value>, Vec<Value>), EngineError> {
    let mut out = Vec::new();
    let mut diags = Vec::new();
    let mut seen = BTreeSet::<Utf16>::new();
    for (mi, module) in items(document, "modules").iter().enumerate() {
        let payload = at(at(module, "extensions"), "umf.access");
        if !is_object(payload)
            || array_items(at(payload, "search")).is_none()
            || array_items(at(payload, "searchBindings")).is_none()
        {
            continue;
        }
        for (ii, index) in items(payload, "search").iter().enumerate() {
            ctx.charge_work(1, Utf16::from("/search"))?;
            if !is_object(index) || !reference(at(index, "record")) {
                continue;
            }
            let Some(ri) = find_index(records, ctx, |r| {
                member(r, "selected") == Some(&Value::Bool(true))
                    && same(at(r, "ref"), at(index, "record"))
            })?
            else {
                continue;
            };
            ctx.charge_work(
                40 + mi.to_string().len() + ii.to_string().len(),
                Utf16::default(),
            )?;
            let path = format!("/modules/{mi}/extensions/umf.access/search/{ii}");
            let fields = items(&records[ri], "fields");
            let Some(Value::String(id_value)) = member(index, "id") else {
                add(&mut diags, source, &path, ctx)?;
                continue;
            };
            charge_text_copy(member(index, "id").unwrap(), ctx)?;
            charge_text_copy(member(index, "kind").unwrap_or(&Value::Null), ctx)?;
            charge_text_copy(member(index, "exactness").unwrap_or(&Value::Null), ctx)?;
            let kind = get_str(index, "kind").unwrap_or_default();
            let invalid_filter_refs = match array_items(at(index, "filterable")) {
                Some(refs) => invalid_reference_list(refs, ctx)?,
                None => true,
            };
            if !has_keys(
                index,
                &["id", "record", "kind", "exactness", "filterable"],
                &["vector", "keyword"],
            ) || id_value.units().is_empty()
                || seen.contains(id_value)
                || !string_in(index, "kind", &["vector", "keyword"], ctx)?
                || !string_in(index, "exactness", &["exact", "approximate"], ctx)?
                || invalid_filter_refs
            {
                add(&mut diags, source, &path, ctx)?;
                continue;
            }
            let mut invalid_filter = false;
            if let Some(refs) = array_items(at(index, "filterable")) {
                for r in refs {
                    if !any_match(fields, ctx, |f| owns(f, r))? {
                        invalid_filter = true;
                        break;
                    }
                }
            }
            if invalid_filter {
                add(&mut diags, source, &path, ctx)?;
                continue;
            }
            ctx.charge_work(id_value.units().len(), Utf16::default())?;
            seen.insert(id_value.clone());
            let mut vector_fields = None;
            if kind == "keyword" {
                let keyword = at(index, "keyword");
                let ranking = at(keyword, "ranking");
                let analyzer = at(keyword, "analyzer");
                let invalid_keyword_refs = match array_items(at(keyword, "source")) {
                    Some(refs) => refs.is_empty() || invalid_reference_list(refs, ctx)?,
                    None => true,
                };
                if member(index, "vector").is_some()
                    || !has_keys(keyword, &["source", "ranking", "analyzer", "syntax"], &[])
                    || invalid_keyword_refs
                    || !string_is(keyword, "syntax", "plain", ctx)?
                    || !has_keys(ranking, &["family"], &["k1", "b"])
                    || !string_in(ranking, "family", &["bm25", "implementation-defined"], ctx)?
                    || !string_is(keyword, "analyzer", "implementation-defined", ctx)?
                        && (!has_keys(analyzer, &["language", "stemming"], &[])
                            || !matches!(member(analyzer, "language"), Some(Value::String(_)))
                            || !matches!(member(analyzer, "stemming"), Some(Value::Bool(_))))
                {
                    add(&mut diags, source, &path, ctx)?;
                    continue;
                }
                let mut invalid_source = false;
                if let Some(refs) = array_items(at(keyword, "source")) {
                    for r in refs {
                        if !any_match(fields, ctx, |f| {
                            owns(f, r)
                                && get_str(f, "scalarType").as_deref() == Some("string")
                                && get_str(f, "cardinality").as_deref() == Some("one")
                        })? {
                            invalid_source = true;
                            break;
                        }
                    }
                }
                if invalid_source {
                    add(&mut diags, source, &path, ctx)?;
                    continue;
                }
                if ["k1", "b"].iter().any(|k| {
                    member(ranking, k)
                        .is_some_and(|v| !matches!(v,Value::Number(n)if n.is_finite()))
                }) {
                    add(&mut diags, source, &path, ctx)?;
                    continue;
                }
            } else {
                let vector = at(index, "vector");
                let model = at(vector, "model");
                charge_text_copy(member(model, "id").unwrap_or(&Value::Null), ctx)?;
                charge_text_copy(member(model, "version").unwrap_or(&Value::Null), ctx)?;
                if member(index, "keyword").is_some()
                    || !has_keys(
                        vector,
                        &["field", "model", "dimensions", "metric", "computedBy"],
                        &["source"],
                    )
                    || !reference(at(vector, "field"))
                    || !has_keys(model, &["id", "version"], &[])
                    || !matches!(member(model, "id"), Some(Value::String(_)))
                    || !matches!(member(model, "version"), Some(Value::String(_)))
                    || !safe_integer(at(vector, "dimensions"), 1.0, 16000.0)
                    || !string_in(vector, "metric", &["cosine", "dot", "l2"], ctx)?
                    || !string_in(vector, "computedBy", &["host", "target"], ctx)?
                    || member(vector, "source").is_some_and(|r| !reference(r))
                {
                    add(&mut diags, source, &path, ctx)?;
                    continue;
                }
                let field_index = find_index(fields, ctx, |f| owns(f, at(vector, "field")))?;
                let leaf_index = if let Some(fi) = field_index {
                    if let Some(item) = member(&fields[fi], "item") {
                        find_index(fields, ctx, |f| same(at(f, "ref"), item))?
                    } else {
                        None
                    }
                } else {
                    None
                };
                let mut invalid_vector_source = false;
                if let Some(source_ref) = member(vector, "source") {
                    invalid_vector_source = !any_match(fields, ctx, |f| {
                        same(at(f, "ref"), source_ref)
                            && get_str(f, "scalarType").as_deref() == Some("string")
                            && get_str(f, "cardinality").as_deref() == Some("one")
                    })?;
                }
                if invalid_vector_source {
                    add(&mut diags, source, &path, ctx)?;
                    continue;
                }
                let valid = match (field_index, leaf_index) {
                    (Some(fi), Some(li)) => {
                        let field = &fields[fi];
                        let leaf = &fields[li];
                        get_str(field, "cardinality").as_deref() == Some("array")
                            && get_str(leaf, "scalarType").as_deref() == Some("float")
                            && get_str(leaf, "cardinality").as_deref() == Some("one")
                            && member(at(leaf, "row"), "missing") != Some(&Value::Bool(true))
                            && member(at(leaf, "row"), "null") != Some(&Value::Bool(true))
                            && member(leaf, "owned") == Some(&Value::Bool(false))
                            && matches!(member(leaf,"facets"),Some(Value::Object(m))if m.is_empty())
                            && member(at(leaf, "properties"), "allowedValues").is_none()
                            && is_object(at(at(field, "facets"), "collectionSize"))
                            && member(at(at(field, "facets"), "collectionSize"), "min")
                                == member(vector, "dimensions")
                            && member(at(at(field, "facets"), "collectionSize"), "max")
                                == member(vector, "dimensions")
                            && member(field, "vectorDimensions")
                                .is_none_or(|d| Some(d) == member(vector, "dimensions"))
                    }
                    _ => false,
                };
                if !valid {
                    add(&mut diags, source, &path, ctx)?;
                    continue;
                }
                vector_fields = Some((
                    field_index.unwrap(),
                    leaf_index.unwrap(),
                    at(vector, "dimensions").clone(),
                ));
            }
            if let Some((fi, li, dimension)) = vector_fields {
                if let Value::Object(m) = &mut records[ri] {
                    if let Some((_, Value::Array(fields))) =
                        m.iter_mut().find(|(k, _)| k == &Utf16::from("fields"))
                    {
                        put(&mut fields[fi], "vectorDimensions", dimension);
                        put(&mut fields[li], "vectorComponent", Value::Bool(true));
                    }
                }
            }
            let mut bindings = Vec::new();
            let mut targets = BTreeSet::new();
            for (bi, binding) in items(payload, "searchBindings").iter().enumerate() {
                ctx.charge_work(1, Utf16::from("/searchBindings"))?;
                if !is_object(binding) || member(binding, "index") != member(index, "id") {
                    continue;
                }
                ctx.charge_work(
                    48 + mi.to_string().len() + bi.to_string().len(),
                    Utf16::default(),
                )?;
                let bp = format!("/modules/{mi}/extensions/umf.access/searchBindings/{bi}");
                let target = at(binding, "target");
                let key = umf_core::serialization::stringify_compact_metered(target, ctx)?;
                if !has_keys(
                    binding,
                    &[
                        "index",
                        "target",
                        "native",
                        "freshness",
                        "maxK",
                        "filtering",
                    ],
                    &[],
                ) || !has_keys(target, &["platform", "majorVersion"], &[])
                    || !string_in(
                        target,
                        "platform",
                        &["postgresql", "lakebase", "spark-delta", "unity-catalog"],
                        ctx,
                    )?
                    || !matches!(member(target, "majorVersion"), Some(Value::String(_)))
                    || !matches!(member(binding, "native"), Some(Value::String(value)) if !value.units().is_empty())
                    || !string_in(
                        binding,
                        "freshness",
                        &["transactional", "asynchronous"],
                        ctx,
                    )?
                    || !string_in(binding, "filtering", &["complete", "partial"], ctx)?
                    || !safe_integer(at(binding, "maxK"), 1.0, 1000.0)
                    || targets.contains(&key)
                {
                    add(&mut diags, source, &bp, ctx)?;
                    continue;
                }
                targets.insert(key);
                bindings.push(crate::value::admit_json(binding, ctx)?);
            }
            out.push(obj([
                ("record", {
                    let record_ref = at(&records[ri], "ref");
                    charge_reference_copy(record_ref, ctx)?;
                    record_ref.clone()
                }),
                ("id", {
                    charge_text_copy(member(index, "id").unwrap_or(&Value::Null), ctx)?;
                    member(index, "id").cloned().unwrap_or(Value::Null)
                }),
                ("python", s("")),
                ("pointer", s(path)),
                ("declaration", crate::value::admit_json(index, ctx)?),
                ("bindings", arr(bindings)),
            ]));
        }
    }
    Ok((out, diags))
}

#[cfg(test)]
mod resource_control_tests {
    use super::*;

    #[test]
    fn enum_gates_use_bounded_javascript_string_coercion() {
        let nested = obj([("kind", Value::Array(vec![Value::Array(vec![s("vector")])]))]);
        assert!(string_in(
            &nested,
            "kind",
            &["vector", "keyword"],
            &mut Context::ordinary()
        )
        .unwrap());
        let object = obj([("kind", obj([]))]);
        assert!(!string_in(
            &object,
            "kind",
            &["vector", "keyword"],
            &mut Context::ordinary()
        )
        .unwrap());
        let throwing = obj([(
            "kind",
            Value::Array(vec![s("other"), obj([("toString", Value::Null)])]),
        )]);
        let error = string_in(
            &throwing,
            "kind",
            &["vector", "keyword"],
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "GENERATION_FAILED");
        assert_eq!(error.message.to_utf8().unwrap(), "No default value");
    }

    #[test]
    fn late_object_key_scan_preserves_control_error_origin() {
        let mut fields = (0..64)
            .map(|index| (Utf16::from(format!("k{index}")), Value::Null))
            .collect::<Vec<_>>();
        fields.push((Utf16::from("toString"), Value::Null));
        let value = obj([("kind", Value::Object(fields))]);
        for code in ["LIMIT", "NUMBER", "VALUE_INVALID"] {
            let mut calls = 0;
            let mut meter = |_: usize| {
                calls += 1;
                if calls == 20 {
                    Err(EngineError::new(
                        code,
                        Utf16::from("/host/coercion"),
                        "injected",
                    ))
                } else {
                    Ok(())
                }
            };
            let error = string_in(
                &value,
                "kind",
                &["vector", "keyword"],
                &mut Context::ordinary().with_meter(&mut meter),
            )
            .unwrap_err();
            assert!(error.is_control_failure());
            assert_eq!(error.code, code);
            assert_eq!(error.path, Utf16::from("/host/coercion"));
        }
    }

    #[test]
    fn raw_utf16_search_identity_and_string_type_are_preserved() {
        let raw = Utf16::new(vec![0x6d, 0xd800]);
        let left = obj([
            ("module", Value::String(raw.clone())),
            ("element", s("field")),
        ]);
        let right = obj([
            ("module", Value::String(Utf16::new(vec![0x6d, 0xdc00]))),
            ("element", s("field")),
        ]);
        assert!(reference(&left));
        assert!(reference(&right));
        assert!(!same(&left, &right));
        let analyzer = obj([("language", Value::String(raw))]);
        assert!(matches!(
            member(&analyzer, "language"),
            Some(Value::String(_))
        ));
        assert!(!string_is(&analyzer, "language", "m�", &mut Context::ordinary()).unwrap());
    }

    #[test]
    fn late_record_scan_preserves_meter_failure_code_and_path() {
        let records = (0..128)
            .map(|i| {
                obj([
                    ("selected", Value::Bool(false)),
                    (
                        "ref",
                        obj([("module", s("m")), ("element", s(i.to_string()))]),
                    ),
                ])
            })
            .collect::<Vec<_>>();
        for code in ["LIMIT", "NUMBER", "VALUE_INVALID"] {
            let mut calls = 0;
            let mut meter = |_: usize| {
                calls += 1;
                if calls == 100 {
                    Err(EngineError::new(
                        code,
                        Utf16::from("/host/search"),
                        "injected host-looking failure",
                    ))
                } else {
                    Ok(())
                }
            };
            let mut ctx = Context::ordinary().with_meter(&mut meter);
            let target = obj([("module", s("m")), ("element", s("127"))]);
            let result = find_index(&records, &mut ctx, |r| same(at(r, "ref"), &target));
            let error = result.unwrap_err();
            assert!(error.is_control_failure());
            assert_eq!(error.code, code);
            assert_eq!(error.path, Utf16::from("/host/search"));
        }
    }
}

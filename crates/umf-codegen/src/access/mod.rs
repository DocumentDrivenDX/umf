// SPDX-License-Identifier: MIT OR Apache-2.0
//! Stage-one typed access package generation and compatibility diffing.

mod admission;
mod emitter;
mod inspection;
mod lowercase;
mod profile;
mod search;

use std::collections::{BTreeMap, BTreeSet};

use umf_core::{Context, EngineError, Utf16, Value};

use crate::{
    resources::CodegenEngine,
    value::{array_items, member, string_member},
};

#[cfg(test)]
thread_local! {
    static PRIVATE_ACCESS_CAPTURE: std::cell::RefCell<Option<(Value, Vec<(String, Utf16)>, Vec<Value>)>> = const { std::cell::RefCell::new(None) };
}

impl CodegenEngine<'_> {
    /// Build one typed Python access package from explicit request/profile values.
    pub fn generate_access_package(
        &self,
        request: &Value,
        profile: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        generate(self, request, profile, ctx)
    }
}

fn obj(items: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    Value::Object(
        items
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn arr(items: impl IntoIterator<Item = Value>) -> Value {
    Value::Array(items.into_iter().collect())
}
fn s(value: impl AsRef<str>) -> Value {
    Value::String(Utf16::from(value.as_ref()))
}
fn charge_clone_tree(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    match value {
        Value::String(text) => ctx.charge_work(text.len().saturating_add(1), Utf16::default())?,
        Value::Array(items) => {
            ctx.charge_work(items.len().saturating_add(1), Utf16::default())?;
            for item in items {
                charge_clone_tree(item, ctx)?;
            }
        }
        Value::Object(items) => {
            ctx.charge_work(items.len().saturating_add(1), Utf16::default())?;
            for (key, item) in items {
                ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
                charge_clone_tree(item, ctx)?;
            }
        }
        _ => ctx.charge_work(1, Utf16::default())?,
    }
    Ok(())
}
fn get_str(value: &Value, key: &str) -> Option<String> {
    string_member(value, key).and_then(|x| x.to_utf8().ok())
}
fn snake(value: &str) -> String {
    let mut out = String::new();
    let chars = value.chars().collect::<Vec<_>>();
    for (i, c) in chars.iter().enumerate() {
        if c.is_ascii_uppercase()
            && i > 0
            && (chars[i - 1].is_ascii_lowercase() || chars[i - 1].is_ascii_digit())
        {
            out.push('_');
        }
        out.push(c.to_ascii_lowercase());
    }
    out
}
fn class_name(value: &str) -> String {
    snake(value)
        .split('_')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            chars
                .next()
                .map(|c| c.to_ascii_uppercase().to_string() + chars.as_str())
                .unwrap_or_default()
        })
        .collect()
}
fn at<'a>(value: &'a Value, key: &str) -> &'a Value {
    member(value, key).unwrap_or(&Value::Null)
}
fn index<'a>(value: &'a Value, i: usize) -> &'a Value {
    array_items(value)
        .and_then(|x| x.get(i))
        .unwrap_or(&Value::Null)
}
fn ref_matches(value: &Value, module: &str, element: &str) -> bool {
    get_str(value, "module").as_deref() == Some(module)
        && get_str(value, "element").as_deref() == Some(element)
}
fn has_keys(value: &Value, required: &[&str], optional: &[&str]) -> bool {
    let Some(members) = crate::value::object_members(value) else {
        return false;
    };
    required
        .iter()
        .all(|k| members.iter().any(|(name, _)| name == &Utf16::from(*k)))
        && members.iter().all(|(name, _)| {
            required
                .iter()
                .chain(optional)
                .any(|k| name == &Utf16::from(*k))
        })
}
fn string_array(value: &Value) -> Option<Vec<String>> {
    array_items(value)?
        .iter()
        .map(|v| match v {
            Value::String(s) => s.to_utf8().ok(),
            _ => None,
        })
        .collect()
}
fn exact_ref(value: &Value) -> bool {
    has_keys(value, &["module", "element"], &[])
        && string_member(value, "module").is_some_and(|x| !x.is_empty())
        && string_member(value, "element").is_some_and(|x| !x.is_empty())
}
fn is_version(value: &str) -> bool {
    let (release, build) = value
        .split_once('+')
        .map_or((value, None), |(a, b)| (a, Some(b)));
    if build
        .is_some_and(|b| b.is_empty() || !b.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'.'))
    {
        return false;
    }
    let suffix = [".dev", ".post", "rc", "a", "b"]
        .iter()
        .filter_map(|token| release.find(token).map(|index| (index, *token)))
        .min_by_key(|(index, _)| *index);
    let (core, suffix_ok) = if let Some((index, token)) = suffix {
        let tail = &release[index + token.len()..];
        (
            &release[..index],
            !tail.is_empty() && tail.bytes().all(|b| b.is_ascii_digit()),
        )
    } else {
        (release, true)
    };
    suffix_ok
        && !core.is_empty()
        && core
            .split('.')
            .all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()))
}
fn pointer_cmp_utf16(a: &Utf16, b: &Utf16) -> std::cmp::Ordering {
    let mut left = a.units().split(|unit| *unit == 47);
    let mut right = b.units().split(|unit| *unit == 47);
    loop {
        match (left.next(), right.next()) {
            (Some(x), Some(y)) => {
                if x == y {
                    continue;
                }
                let number = |part: &[u16]| -> Option<f64> {
                    if part.is_empty() || !part.iter().all(|unit| (48..=57).contains(unit)) {
                        return None;
                    }
                    let text = part
                        .iter()
                        .map(|unit| *unit as u8 as char)
                        .collect::<String>();
                    text.parse().ok()
                };
                if let (Some(x), Some(y)) = (number(x), number(y)) {
                    return x.partial_cmp(&y).unwrap_or(std::cmp::Ordering::Equal);
                }
                return x.cmp(y);
            }
            (None, None) => return std::cmp::Ordering::Equal,
            (None, Some(_)) => return std::cmp::Ordering::Less,
            (Some(_), None) => return std::cmp::Ordering::Greater,
        }
    }
}

// Reserve each conversion before allocating its UTF-8 representation.
fn metered_string(
    value: &Value,
    key: &str,
    ctx: &mut Context<'_>,
) -> Result<Option<String>, EngineError> {
    let text = string_member(value, key);
    ctx.charge_work(
        text.map_or(0, Utf16::len).saturating_add(1),
        Utf16::default(),
    )?;
    Ok(text.and_then(|text| text.to_utf8().ok()))
}
fn named_override(
    names: &[Value],
    source: &str,
    pointer: &str,
    ctx: &mut Context<'_>,
) -> Result<Option<String>, EngineError> {
    for name in names {
        ctx.charge_work(
            source.len().saturating_add(pointer.len()).saturating_add(1),
            Utf16::default(),
        )?;
        if metered_string(name, "sourceId", ctx)?.as_deref() == Some(source)
            && metered_string(name, "pointer", ctx)?.as_deref() == Some(pointer)
        {
            return metered_string(name, "python", ctx);
        }
    }
    Ok(None)
}
fn sort_disposition_indexes(
    indexes: &mut Vec<usize>,
    items: &[Value],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(
        indexes
            .len()
            .saturating_mul(2 + indexes.len().checked_ilog2().unwrap_or(0) as usize),
        Utf16::default(),
    )?;
    let mut decorated = Vec::with_capacity(indexes.len());
    for index in indexes.iter().copied() {
        let id = metered_string(&items[index], "id", ctx)?;
        let key = id
            .as_deref()
            .and_then(|s| s.strip_prefix('d')?.parse::<usize>().ok())
            .unwrap_or(usize::MAX);
        decorated.push((key, index));
    }
    decorated.sort_by_key(|(key, _)| *key);
    for (slot, (_, index)) in indexes.iter_mut().zip(decorated) {
        *slot = index;
    }
    Ok(())
}

fn diagnostic_unknown(
    diagnostics: &[Value],
    path: &Utf16,
    descendants: bool,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    for diagnostic in diagnostics {
        ctx.charge_work(
            path.len()
                .saturating_add(string_member(diagnostic, "pointer").map_or(0, Utf16::len))
                .saturating_add(1),
            Utf16::default(),
        )?;
        if metered_string(diagnostic, "code", ctx)?.as_deref() == Some("UNKNOWN_RELEVANT")
            && string_member(diagnostic, "pointer")
                .is_some_and(|p| path == p || descendants && is_under(path, p))
        {
            return Ok(true);
        }
    }
    Ok(false)
}
fn array_items_mut(value: &mut Value) -> &mut [Value] {
    if let Value::Array(items) = value {
        items
    } else {
        &mut []
    }
}
fn interleave_action_dispositions(
    dispositions: &mut Value,
    obligations: &mut [Value],
    base: usize,
    batches: &[(usize, usize)],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Array(items) = dispositions else {
        return Ok(());
    };
    let raw_count = batches.iter().map(|(raw, _)| raw).sum::<usize>();
    let semantic_count = batches.iter().map(|(_, semantic)| semantic).sum::<usize>();
    // Every admitted action appends one semantic disposition per obligation.
    if items.len() != base + raw_count + semantic_count {
        return Err(EngineError::new(
            "INTERNAL",
            Utf16::default(),
            "Action disposition batch invariant failed",
        ));
    }
    ctx.charge_work(
        items.len().saturating_mul(4).saturating_add(1),
        Utf16::default(),
    )?;
    let mut old = std::mem::take(items).into_iter();
    items.extend(old.by_ref().take(base));
    let mut raw = old.by_ref().take(raw_count).collect::<Vec<_>>().into_iter();
    let mut semantic = old;
    let mut remap = BTreeMap::new();
    for &(raw_len, semantic_len) in batches {
        for (iterator, count) in [
            (&mut raw as &mut dyn Iterator<Item = Value>, raw_len),
            (
                &mut semantic as &mut dyn Iterator<Item = Value>,
                semantic_len,
            ),
        ] {
            for mut item in iterator.take(count) {
                ctx.charge_work(1, Utf16::default())?;
                let prior = metered_string(&item, "id", ctx)?.unwrap_or_default();
                let next = format!("d{}", items.len());
                ctx.charge_work(
                    prior
                        .len()
                        .saturating_add(next.len().saturating_mul(2))
                        .saturating_add(1),
                    Utf16::default(),
                )?;
                remap.insert(prior, next.clone());
                if let Value::Object(fields) = &mut item {
                    if let Some((_, value)) =
                        fields.iter_mut().find(|(key, _)| key == &Utf16::from("id"))
                    {
                        *value = s(next);
                    }
                }
                items.push(item);
            }
        }
    }
    for obligation in obligations {
        if let Value::Object(fields) = obligation {
            for (key, value) in fields {
                ctx.charge_work(1, Utf16::default())?;
                if key == &Utf16::from("dispositionIds") {
                    if let Value::Array(ids) = value {
                        for id in ids {
                            if let Value::String(text) = id {
                                ctx.charge_work(text.len().saturating_add(1), Utf16::default())?;
                                if let Ok(old) = text.to_utf8() {
                                    if let Some(next) = remap.get(&old) {
                                        ctx.charge_work(
                                            next.len().saturating_add(1),
                                            Utf16::default(),
                                        )?;
                                        *text = Utf16::from(next.as_str());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(())
}
fn source_value(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(source.len().saturating_add(1), Utf16::default())?;
    Ok(s(source))
}
fn collect_dispositions(
    document: &Value,
    logical: &str,
    selected: &BTreeSet<(&Utf16, &Utf16)>,
    selected_actions: &BTreeSet<(Utf16, Utf16)>,
    relations: &[Value],
    searches: &[Value],
    records_ir: &[Value],
    selected_paths: &BTreeSet<Utf16>,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    fn reference_key(v: &Value) -> Option<(&Utf16, &Utf16)> {
        Some((string_member(v, "module")?, string_member(v, "element")?))
    }
    let modules = crate::value::array_items(member(document, "modules").unwrap_or(&Value::Null))
        .unwrap_or(&[]);
    let mut client_fields = BTreeSet::new();
    let mut selected_fields = BTreeSet::new();
    for record in records_ir {
        ctx.charge_work(1, Utf16::default())?;
        let is_selected = member(record, "selected") == Some(&Value::Bool(true));
        if is_selected {
            if let Some(reference) = reference_key(at(record, "ref")) {
                client_fields.insert(reference);
            }
        }
        for field in array_items(at(record, "fields")).unwrap_or(&[]) {
            ctx.charge_work(1, Utf16::default())?;
            if let Some(reference) = reference_key(at(field, "ref")) {
                client_fields.insert(reference.clone());
                if is_selected {
                    selected_fields.insert(reference);
                }
            }
        }
    }
    fn child_path(path: &Utf16, key: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
        ctx.charge_work(
            path.len()
                .saturating_add(key.len().saturating_mul(2))
                .saturating_add(1),
            path.clone(),
        )?;
        Ok(append_pointer(path, key))
    }
    fn walk(
        value: &Value,
        path: &Utf16,
        assertion: &Utf16,
        relevance: &str,
        client_checked: bool,
        logical: &str,
        id: &mut usize,
        out: &mut Vec<Value>,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        ctx.charge_work(1, path.clone())?;
        match value {
            Value::Object(items) if !items.is_empty() => {
                for (key, item) in crate::value::js_object_members(value, ctx)? {
                    walk(
                        item,
                        &child_path(path, key, ctx)?,
                        assertion,
                        relevance,
                        client_checked,
                        logical,
                        id,
                        out,
                        ctx,
                    )?;
                }
                return Ok(());
            }
            Value::Array(items) if !items.is_empty() => {
                for (index, item) in items.iter().enumerate() {
                    walk(
                        item,
                        &child_path(path, &Utf16::from(index.to_string()), ctx)?,
                        assertion,
                        relevance,
                        client_checked,
                        logical,
                        id,
                        out,
                        ctx,
                    )?;
                }
                return Ok(());
            }
            _ => {}
        }
        let number = *id;
        *id += 1;
        ctx.charge_work(path.len().saturating_add(assertion.len()), path.clone())?;
        let (fidelity, checks, reason) = if relevance == "unselected" {
            (
                "unknown",
                arr([s("informational")]),
                "Unselected content retained in exact source archive",
            )
        } else if assertion == &Utf16::from("umf.access") {
            (
                "exact",
                arr([s("client")]),
                "Authored view checked against core presence and retained",
            )
        } else if client_checked
            && [
                "kind",
                "nullability",
                "cardinality",
                "facets",
                "allowedValues",
                "members",
                "keys",
            ]
            .iter()
            .any(|name| assertion == &Utf16::from(*name))
        {
            ("exact",arr([s("client")]),"Public core admission and contextual inspectors resolve this authored assertion; metadata retention does not imply enforcement")
        } else {
            ("exact",arr([s("informational")]),"Public core admission and contextual inspectors resolve this authored assertion; metadata retention does not imply enforcement")
        };
        out.push(obj([
            ("id", s(format!("d{number}"))),
            ("sourceId", source_value(logical, ctx)?),
            ("pointer", Value::String(path.clone())),
            ("assertion", Value::String(assertion.clone())),
            ("relevance", s(relevance)),
            ("fidelity", s(fidelity)),
            ("checks", checks),
            ("reason", s(reason)),
            ("obligationIds", arr([])),
        ]));
        Ok(())
    }
    fn context_walk(
        value: &Value,
        path: &str,
        logical: &str,
        id: &mut usize,
        out: &mut Vec<Value>,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        ctx.charge_work(1, Utf16::from(path))?;
        match value {
            Value::Object(items) if !items.is_empty() => {
                for (k, v) in items {
                    ctx.charge_work(
                        path.len()
                            .saturating_add(k.len().saturating_mul(4))
                            .saturating_add(1),
                        Utf16::default(),
                    )?;
                    let key = k
                        .to_utf8()
                        .unwrap_or_default()
                        .replace('~', "~0")
                        .replace('/', "~1");
                    context_walk(v, &format!("{path}/{key}"), logical, id, out, ctx)?;
                }
                return Ok(());
            }
            Value::Array(items) if !items.is_empty() => {
                for (i, v) in items.iter().enumerate() {
                    ctx.charge_work(path.len().saturating_add(24), Utf16::default())?;
                    context_walk(v, &format!("{path}/{i}"), logical, id, out, ctx)?;
                }
                return Ok(());
            }
            _ => {}
        }
        ctx.charge_work(path.len().saturating_add(1), Utf16::default())?;
        let num = *id;
        *id += 1;
        out.push(obj([("id",s(format!("d{num}")),),("sourceId",source_value(logical,ctx)?),("pointer",s(path)),("assertion",s("source-context")),("relevance",s("selected")),("fidelity",s("exact")),("checks",arr([s("informational")])),("reason",s("Known source identity or annotation retained; no native enforcement or execution is established")),("obligationIds",arr([]))]));
        Ok(())
    }
    let mut out = Vec::new();
    let mut id = 0usize;
    // Only admitted relationships/searches contribute semantic dispositions.
    for relation in relations {
        charge_clone_tree(at(relation, "pointer"), ctx)?;
        let n = id;
        id += 1;
        out.push(obj([("id",s(format!("d{n}"))),("sourceId",source_value(logical,ctx)?),("pointer",at(relation,"pointer").clone()),("assertion",s("relationships")),("relevance",s("selected")),("fidelity",s("exact")),("checks",arr([s("informational")])),("reason",s("inspectCoreRelationships result2.0.0; native multiplicity/lifecycle enforcement remains engine-owned")),("obligationIds",arr([]))]));
    }
    if let Some(v) = member(document, "umf") {
        context_walk(v, "/umf", logical, &mut id, &mut out, ctx)?;
    } else {
        context_walk(&s("0.10.0"), "/umf", logical, &mut id, &mut out, ctx)?;
    }
    for key in ["id", "title", "aliases"] {
        if let Some(v) = member(document, key) {
            context_walk(v, &format!("/{key}"), logical, &mut id, &mut out, ctx)?;
        }
    }
    if let Some(version) = member(
        member(document, "vocabularies").unwrap_or(&Value::Null),
        "umf.access",
    )
    .and_then(|x| member(x, "version"))
    {
        context_walk(
            version,
            "/vocabularies/umf.access/version",
            logical,
            &mut id,
            &mut out,
            ctx,
        )?;
    }
    if !selected_actions.is_empty() {
        if let Some(version) = member(
            member(document, "vocabularies").unwrap_or(&Value::Null),
            "umf.actions",
        )
        .and_then(|x| member(x, "version"))
        {
            context_walk(
                version,
                "/vocabularies/umf.actions/version",
                logical,
                &mut id,
                &mut out,
                ctx,
            )?;
        }
    }
    for (mi, module) in modules.iter().enumerate() {
        let empty = Utf16::default();
        let mid = string_member(module, "id").unwrap_or(&empty);
        let module_prefix = Utf16::from(format!("/modules/{mi}/elements/"));
        let mut module_relevant = false;
        for (m, _) in selected_actions {
            ctx.charge_work(
                m.len().saturating_add(mid.len()).saturating_add(1),
                Utf16::default(),
            )?;
            if m == mid {
                module_relevant = true;
                break;
            }
        }
        for path in selected_paths {
            ctx.charge_work(1, Utf16::default())?;
            if path.units().starts_with(module_prefix.units()) {
                module_relevant = true;
                break;
            }
        }
        if module_relevant {
            for key in ["id", "namespace", "title", "aliases"] {
                if let Some(v) = member(module, key) {
                    context_walk(
                        v,
                        &format!("/modules/{mi}/{key}"),
                        logical,
                        &mut id,
                        &mut out,
                        ctx,
                    )?;
                }
            }
        }
        let access = member(
            member(module, "extensions").unwrap_or(&Value::Null),
            "umf.access",
        )
        .unwrap_or(&Value::Null);
        for (vi, view) in crate::value::array_items(member(access, "views").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            let reference = member(view, "record").unwrap_or(&Value::Null);
            if reference_key(reference).is_some_and(|key| selected.contains(&key)) {
                walk(
                    view,
                    &Utf16::from(format!("/modules/{mi}/extensions/umf.access/views/{vi}")),
                    &Utf16::from("umf.access"),
                    "selected",
                    true,
                    logical,
                    &mut id,
                    &mut out,
                    ctx,
                )?;
            }
        }
        for (ci, column_set) in array_items(member(access, "columns").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            let mut selected_column = false;
            for column in array_items(at(column_set, "columns")).unwrap_or(&[]) {
                ctx.charge_work(1, Utf16::default())?;
                if let Some(reference) = reference_key(at(column, "field")) {
                    ctx.charge_work(
                        reference
                            .0
                            .len()
                            .saturating_add(reference.1.len())
                            .saturating_add(1),
                        Utf16::default(),
                    )?;
                    if selected_fields.contains(&reference) {
                        selected_column = true;
                        break;
                    }
                }
            }
            if !selected_column {
                continue;
            }
            let marker = format!("__column_obligation_{mi}_{ci}");
            fn walk_column(
                value: &Value,
                path: &Utf16,
                logical: &str,
                marker: &str,
                id: &mut usize,
                out: &mut Vec<Value>,
                ctx: &mut Context<'_>,
            ) -> Result<(), EngineError> {
                ctx.charge_work(1, path.clone())?;
                match value {
                    Value::Object(items) if !items.is_empty() => {
                        for (key, item) in crate::value::js_object_members(value, ctx)? {
                            walk_column(
                                item,
                                &child_path(path, key, ctx)?,
                                logical,
                                marker,
                                id,
                                out,
                                ctx,
                            )?;
                        }
                        return Ok(());
                    }
                    Value::Array(items) if !items.is_empty() => {
                        for (index, item) in items.iter().enumerate() {
                            walk_column(
                                item,
                                &child_path(path, &Utf16::from(index.to_string()), ctx)?,
                                logical,
                                marker,
                                id,
                                out,
                                ctx,
                            )?;
                        }
                        return Ok(());
                    }
                    _ => {}
                }
                ctx.charge_work(path.len(), path.clone())?;
                let did = format!("d{}", *id);
                *id += 1;
                out.push(obj([("id",s(did)),("sourceId",source_value(logical,ctx)?),("pointer",Value::String(path.clone())),("assertion",s("umf.access")),("relevance",s("selected")),("fidelity",s("exact")),("checks",arr([s("informational")])),("reason",s("Authored ColumnSet fact retained and declaration-checked; no native table observation or enforcement implied")),("obligationIds",arr([s(marker)]))]));
                Ok(())
            }
            walk_column(
                column_set,
                &Utf16::from(format!("/modules/{mi}/extensions/umf.access/columns/{ci}")),
                logical,
                &marker,
                &mut id,
                &mut out,
                ctx,
            )?;
        }
        for search in searches {
            if !metered_string(search, "pointer", ctx)?
                .is_some_and(|pointer| pointer.starts_with(&format!("/modules/{mi}/")))
            {
                continue;
            }
            charge_clone_tree(at(search, "pointer"), ctx)?;
            let n = id;
            id += 1;
            out.push(obj([("id",s(format!("d{n}"))),("sourceId",source_value(logical,ctx)?),("pointer",at(search,"pointer").clone()),("assertion",s("umf.access")),("relevance",s("selected")),("fidelity",s("exact")),("checks",arr([s("informational")])),("reason",s("Complete authored search declaration and bindings retained; native mechanisms and filtering require catalog qualification")),("obligationIds",arr([]))]));
        }
        for (ei, element) in
            crate::value::array_items(member(module, "elements").unwrap_or(&Value::Null))
                .unwrap_or(&[])
                .iter()
                .enumerate()
        {
            let eid = string_member(element, "id").unwrap_or(&empty);
            let identity = (mid, eid);
            let path = Utf16::from(format!("/modules/{mi}/elements/{ei}"));
            let mut relevant = false;
            for selected_path in selected_paths {
                ctx.charge_work(1, Utf16::default())?;
                if is_under(&path, selected_path) {
                    relevant = true;
                    break;
                }
            }
            let relevance = if !relevant {
                "unselected"
            } else if selected.contains(&identity) {
                "selected"
            } else {
                "dependency"
            };
            for (key, item) in crate::value::js_object_members(element, ctx)? {
                walk(
                    item,
                    &child_path(&path, key, ctx)?,
                    key,
                    relevance,
                    client_fields.contains(&identity),
                    logical,
                    &mut id,
                    &mut out,
                    ctx,
                )?;
            }
        }
    }
    Ok(out)
}
fn apply_not_expressible(
    dispositions: &mut Value,
    paths: &[Utf16],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if let Value::Array(items) = dispositions {
        for item in items {
            ctx.charge_work(1, Utf16::default())?;
            let Some(pointer) = string_member(item, "pointer") else {
                continue;
            };
            let mut covered = false;
            for path in paths {
                ctx.charge_work(
                    pointer.len().saturating_add(path.len()).saturating_add(1),
                    pointer.clone(),
                )?;
                let child = pointer.len() > path.len()
                    && pointer.units().starts_with(path.units())
                    && pointer.units().get(path.len()) == Some(&(b'/' as u16));
                if pointer == path || child {
                    covered = true;
                    break;
                }
            }
            if covered {
                if let Value::Object(fields) = item {
                    for (key, value) in fields {
                        if key == &Utf16::from("fidelity") {
                            *value = s("not-expressible");
                        } else if key == &Utf16::from("checks") {
                            *value = arr([]);
                        } else if key == &Utf16::from("reason") {
                            *value = s("Carrier is not qualified by this emitter");
                        }
                    }
                }
            }
        }
    }
    Ok(())
}
fn deduplicate_diagnostics(
    diagnostics: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut positions = BTreeMap::new();
    let mut unique = Vec::new();
    for diagnostic in diagnostics.drain(..) {
        let units = ["sourceId", "pointer", "code", "accessCode"]
            .iter()
            .map(|key| string_member(&diagnostic, key).map_or(0, Utf16::len))
            .sum::<usize>();
        ctx.charge_work(units.saturating_mul(64).saturating_add(1), Utf16::default())?;
        let key = (
            string_member(&diagnostic, "sourceId").cloned(),
            string_member(&diagnostic, "pointer").cloned(),
            string_member(&diagnostic, "code").cloned(),
            string_member(&diagnostic, "accessCode").cloned(),
        );
        if let Some(index) = positions.get(&key) {
            unique[*index] = diagnostic;
        } else {
            positions.insert(key, unique.len());
            unique.push(diagnostic);
        }
    }
    *diagnostics = unique;
    Ok(())
}
fn is_under(path: &Utf16, parent: &Utf16) -> bool {
    path == parent
        || path.units().starts_with(parent.units())
            && path.units().get(parent.len()) == Some(&(b'/' as u16))
}
fn sort_values(
    items: &mut [Value],
    compare: impl Fn(&Value, &Value) -> std::cmp::Ordering,
    extra_work: usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let n = items.len();
    ctx.charge_work(n.saturating_mul(3), Utf16::default())?;
    let mut order = (0..n).collect::<Vec<_>>();
    let mut temporary = vec![0usize; n];
    let mut width = 1usize;
    while width < n {
        let mut start = 0;
        while start < n {
            let middle = start.saturating_add(width).min(n);
            let end = middle.saturating_add(width).min(n);
            let (mut left, mut right, mut dest) = (start, middle, start);
            while left < middle || right < end {
                ctx.charge_work(1, Utf16::default())?;
                let take_left = if right == end {
                    true
                } else if left == middle {
                    false
                } else {
                    let a = &items[order[left]];
                    let b = &items[order[right]];
                    ctx.charge_work(
                        string_member(a, "pointer")
                            .map_or(0, Utf16::len)
                            .saturating_add(string_member(b, "pointer").map_or(0, Utf16::len))
                            .saturating_add(extra_work),
                        Utf16::default(),
                    )?;
                    compare(a, b) != std::cmp::Ordering::Greater
                };
                temporary[dest] = if take_left {
                    let index = order[left];
                    left += 1;
                    index
                } else {
                    let index = order[right];
                    right += 1;
                    index
                };
                dest += 1;
            }
            start = end;
        }
        std::mem::swap(&mut order, &mut temporary);
        width = width.saturating_mul(2);
    }
    for (target, source) in order.into_iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        temporary[source] = target;
    }
    for index in 0..n {
        while temporary[index] != index {
            ctx.charge_work(1, Utf16::default())?;
            let target = temporary[index];
            items.swap(index, target);
            temporary.swap(index, target);
        }
    }
    Ok(())
}
fn sort_dispositions(value: &mut Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    if let Value::Array(items) = value {
        sort_values(
            items,
            |a, b| {
                pointer_cmp_utf16(
                    string_member(a, "pointer").unwrap(),
                    string_member(b, "pointer").unwrap(),
                )
                .then_with(|| string_member(a, "assertion").cmp(&string_member(b, "assertion")))
                .then_with(|| string_member(a, "id").cmp(&string_member(b, "id")))
            },
            1,
            ctx,
        )?;
    }
    Ok(())
}
fn sort_diagnostics(
    items: &mut [Value],
    sources: &[Value],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let source_order = |diagnostic: &Value| {
        sources
            .iter()
            .position(|source| string_member(source, "id") == string_member(diagnostic, "sourceId"))
            .map(|i| i as isize)
            .unwrap_or(-1)
    };
    sort_values(
        items,
        |a, b| {
            let empty = Utf16::default();
            source_order(a)
                .cmp(&source_order(b))
                .then_with(|| {
                    pointer_cmp_utf16(
                        string_member(a, "pointer").unwrap_or(&empty),
                        string_member(b, "pointer").unwrap_or(&empty),
                    )
                })
                .then_with(|| string_member(a, "code").cmp(&string_member(b, "code")))
        },
        sources.len().saturating_add(1),
        ctx,
    )
}
fn apply_unknown_dispositions(
    dispositions: &mut Value,
    diagnostics: &[Value],
    logical: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Array(items) = dispositions else {
        return Ok(());
    };
    for diagnostic in diagnostics {
        ctx.charge_work(1, Utf16::default())?;
        if get_str(diagnostic, "code").as_deref() != Some("UNKNOWN_RELEVANT") {
            continue;
        }
        ctx.charge_work(
            string_member(diagnostic, "sourceId")
                .map_or(logical.len(), Utf16::len)
                .saturating_add(string_member(diagnostic, "pointer").map_or(0, Utf16::len)),
            Utf16::default(),
        )?;
        let source = string_member(diagnostic, "sourceId")
            .cloned()
            .unwrap_or_else(|| Utf16::from(logical));
        let pointer = string_member(diagnostic, "pointer")
            .cloned()
            .unwrap_or_default();
        let mut found = false;
        for item in items.iter_mut() {
            ctx.charge_work(1, Utf16::default())?;
            if string_member(item, "sourceId") != Some(&source)
                || !string_member(item, "pointer").is_some_and(|path| is_under(path, &pointer))
            {
                continue;
            }
            found = true;
            if let Value::Object(fields) = item {
                for (key, value) in fields {
                    if key == &Utf16::from("fidelity") {
                        *value = s("unknown")
                    } else if key == &Utf16::from("checks") {
                        *value = arr([])
                    } else if key == &Utf16::from("reason") {
                        *value = s("Uninterpreted relevant assertion retained; generation refuses")
                    }
                }
            }
        }
        if !found {
            ctx.charge_work(
                source.len().saturating_add(pointer.len()).saturating_add(1),
                Utf16::default(),
            )?;
            let id = format!("d{}", items.len());
            items.push(obj([
                ("id", s(id)),
                ("sourceId", Value::String(source)),
                ("pointer", Value::String(pointer)),
                ("assertion", s("unknown")),
                ("relevance", s("selected")),
                ("fidelity", s("unknown")),
                ("checks", arr([])),
                (
                    "reason",
                    s("Uninterpreted relevant assertion retained; generation refuses"),
                ),
                ("obligationIds", arr([])),
            ]));
        }
    }
    Ok(())
}
fn normalize_action_unknowns(
    dispositions: &mut Value,
    diagnostics: &[Value],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Array(items) = dispositions else {
        return Ok(());
    };
    for diagnostic in diagnostics {
        if metered_string(diagnostic, "code", ctx)?.as_deref() != Some("UNKNOWN_RELEVANT") {
            continue;
        }
        ctx.charge_work(1, Utf16::default())?;
        ctx.charge_work(
            string_member(diagnostic, "pointer").map_or(0, Utf16::len),
            Utf16::default(),
        )?;
        let Some(pointer) = string_member(diagnostic, "pointer").cloned() else {
            continue;
        };
        let source = string_member(diagnostic, "sourceId");
        let mut matched = false;
        let mut exact = false;
        for item in items.iter_mut() {
            ctx.charge_work(
                source
                    .map_or(0, Utf16::len)
                    .saturating_add(pointer.len())
                    .saturating_add(string_member(item, "sourceId").map_or(0, Utf16::len))
                    .saturating_add(string_member(item, "pointer").map_or(0, Utf16::len))
                    .saturating_add(1),
                Utf16::default(),
            )?;
            if string_member(item, "sourceId") != source
                || metered_string(item, "assertion", ctx)?.as_deref() != Some("actions")
                || !string_member(item, "pointer").is_some_and(|p| is_under(p, &pointer))
            {
                continue;
            }
            matched = true;
            exact |= string_member(item, "pointer") == Some(&pointer);
            if let Value::Object(fields) = item {
                if let Some((_, value)) = fields
                    .iter_mut()
                    .find(|(key, _)| key == &Utf16::from("fidelity"))
                {
                    *value = s("unknown");
                }
                if let Some((_, value)) = fields
                    .iter_mut()
                    .find(|(key, _)| key == &Utf16::from("checks"))
                {
                    *value = arr([]);
                }
                if let Some((_, value)) = fields
                    .iter_mut()
                    .find(|(key, _)| key == &Utf16::from("reason"))
                {
                    *value = s("Uninterpreted relevant assertion retained; generation refuses");
                }
            }
        }
        if matched && exact {
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut retained = Vec::with_capacity(items.len());
            for item in items.drain(..) {
                ctx.charge_work(
                    pointer
                        .len()
                        .saturating_add(source.map_or(0, Utf16::len))
                        .saturating_add(1),
                    Utf16::default(),
                )?;
                if !(string_member(&item, "sourceId") == source
                    && string_member(&item, "pointer") == Some(&pointer)
                    && metered_string(&item, "assertion", ctx)?.as_deref() == Some("unknown"))
                {
                    retained.push(item);
                }
            }
            *items = retained;
        }
    }
    Ok(())
}
fn attach_column_obligations(
    dispositions: &mut Value,
    start: usize,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let Value::Array(items) = dispositions else {
        return Ok(Vec::new());
    };
    let mut groups = Vec::<(String, Vec<usize>)>::new();
    let mut indexes = BTreeMap::new();
    for (index, item) in items.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        for id in array_items(at(item, "obligationIds")).unwrap_or(&[]) {
            charge_clone_tree(id, ctx)?;
            let Some(marker) = (match id {
                Value::String(v) => v.to_utf8().ok(),
                _ => None,
            }) else {
                continue;
            };
            if !marker.starts_with("__column_obligation_") {
                continue;
            }
            if let Some(group) = indexes.get(&marker).copied() {
                let group: usize = group;
                groups[group].1.push(index);
            } else {
                ctx.charge_work(marker.len().saturating_add(1), Utf16::default())?;
                indexes.insert(marker.clone(), groups.len());
                groups.push((marker, vec![index]));
            }
        }
    }
    let mut obligations = Vec::new();
    for (marker, mut matching) in groups {
        ctx.charge_work(1, Utf16::default())?;
        sort_disposition_indexes(&mut matching, items, ctx)?;
        let id = format!("o{}", start + obligations.len());
        let mut ids = Vec::new();
        for index in matching {
            ctx.charge_work(1, Utf16::default())?;
            let item = &mut items[index];
            if let Some(did) = metered_string(item, "id", ctx)? {
                ctx.charge_work(did.len().saturating_add(1), Utf16::default())?;
                ids.push(s(did));
            }
            if let Value::Object(fields) = item {
                if let Some((_, Value::Array(values))) = fields
                    .iter_mut()
                    .find(|(key, _)| key == &Utf16::from("obligationIds"))
                {
                    for value in values {
                        ctx.charge_work(
                            marker.len().saturating_add(id.len()).saturating_add(1),
                            Utf16::default(),
                        )?;
                        if value == &s(&marker) {
                            *value = s(&id);
                        }
                    }
                }
            }
        }
        obligations.push(obj([("id",s(id)),("owner",s("qualifier")),("description",s("Pinned native schema, generation and transport require target verify/conformance evidence")),("dispositionIds",arr(ids))]));
    }
    Ok(obligations)
}
fn append_obligation_id(value: &mut Value, id: &str) {
    if let Value::Object(fields) = value {
        if let Some((_, Value::Array(ids))) = fields
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from("obligationIds"))
        {
            ids.push(s(id));
        }
    }
}
fn attach_key_obligations(
    dispositions: &mut Value,
    records: &[Value],
    start: usize,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let Value::Array(items) = dispositions else {
        return Ok(Vec::new());
    };
    let mut obligations = Vec::new();
    for record in records {
        ctx.charge_work(1, Utf16::default())?;
        let prefix = Utf16::from(format!(
            "{}/keys/",
            metered_string(record, "pointer", ctx)?.unwrap_or_default()
        ));
        let mut matching = Vec::new();
        for (index, item) in items.iter().enumerate() {
            ctx.charge_work(1, Utf16::default())?;
            if string_member(item, "pointer").is_some_and(|p| p.units().starts_with(prefix.units()))
            {
                matching.push(index);
            }
        }
        if matching.is_empty() {
            continue;
        }
        sort_disposition_indexes(&mut matching, items, ctx)?;
        let id = format!("o{}", start + obligations.len());
        let mut ids = Vec::new();
        for index in matching {
            ctx.charge_work(1, Utf16::default())?;
            let item = &mut items[index];
            if let Some(did) = metered_string(item, "id", ctx)? {
                ctx.charge_work(did.len().saturating_add(1), Utf16::default())?;
                ids.push(s(did));
            }
            ctx.charge_work(id.len().saturating_add(1), Utf16::default())?;
            append_obligation_id(item, &id);
            if let Value::Object(fields) = item {
                for (key, value) in fields {
                    if key == &Utf16::from("checks") {
                        *value = arr([s("informational")]);
                    } else if key == &Utf16::from("reason") {
                        *value=s("inspectCoreKeys result3.0.0 retains ordered identity; Python DTO equality is not UMF equality or store uniqueness");
                    }
                }
            }
        }
        obligations.push(obj([("id",s(id)),("owner",s("engine")),("description",s("Store enforces authored Key uniqueness/equality; generated DTO does not establish it")),("dispositionIds",arr(ids))]));
    }
    Ok(obligations)
}
fn attach_default_obligations(
    dispositions: &mut Value,
    records: &[Value],
    start: usize,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let Value::Array(items) = dispositions else {
        return Ok(Vec::new());
    };
    let mut obligations = Vec::new();
    for record in records {
        for field in array_items(at(record, "fields")).unwrap_or(&[]) {
            ctx.charge_work(1, Utf16::default())?;
            if member(at(field, "properties"), "default").is_none() {
                continue;
            }
            let prefix = Utf16::from(format!(
                "{}/default",
                metered_string(field, "pointer", ctx)?.unwrap_or_default()
            ));
            let id = format!("o{}", start + obligations.len());
            let mut matching = Vec::new();
            for (index, item) in items.iter().enumerate() {
                ctx.charge_work(1, Utf16::default())?;
                if string_member(item, "pointer")
                    .is_some_and(|p| p.units().starts_with(prefix.units()))
                {
                    matching.push(index);
                }
            }
            sort_disposition_indexes(&mut matching, items, ctx)?;
            let mut ids = Vec::new();
            for index in matching {
                ctx.charge_work(1, Utf16::default())?;
                let item = &mut items[index];
                if let Some(did) = metered_string(item, "id", ctx)? {
                    ctx.charge_work(did.len().saturating_add(1), Utf16::default())?;
                    ids.push(s(did));
                }
                ctx.charge_work(id.len().saturating_add(1), Utf16::default())?;
                append_obligation_id(item, &id);
                if let Value::Object(fields) = item {
                    if let Some((_, checks)) = fields
                        .iter_mut()
                        .find(|(key, _)| key == &Utf16::from("checks"))
                    {
                        *checks = arr([s("engine")]);
                    }
                }
            }
            obligations.push(obj([
                ("id", s(id)),
                ("owner", s("engine")),
                (
                    "description",
                    s("Engine applies authored default; generated input never executes defaults"),
                ),
                ("dispositionIds", arr(ids)),
            ]));
        }
    }
    Ok(obligations)
}

fn append_pointer(path: &Utf16, segment: &Utf16) -> Utf16 {
    let mut units = path.units().to_vec();
    units.push(b'/' as u16);
    for unit in segment.units() {
        match unit {
            0x7e => units.extend([b'~' as u16, b'0' as u16]),
            0x2f => units.extend([b'~' as u16, b'1' as u16]),
            other => units.push(*other),
        }
    }
    Utf16::new(units)
}
fn text_encoder_bytes(text: &Utf16) -> usize {
    let units = text.units();
    let mut i = 0;
    let mut bytes = 0usize;
    while i < units.len() {
        let unit = units[i];
        let scalar = if (0xd800..=0xdbff).contains(&unit)
            && units
                .get(i + 1)
                .is_some_and(|low| (0xdc00..=0xdfff).contains(low))
        {
            let low = units[i + 1];
            i += 1;
            0x10000 + (((unit as u32 - 0xd800) << 10) | (low as u32 - 0xdc00))
        } else if (0xd800..=0xdfff).contains(&unit) {
            0xfffd
        } else {
            unit as u32
        };
        bytes = bytes.saturating_add(if scalar <= 0x7f {
            1
        } else if scalar <= 0x7ff {
            2
        } else if scalar <= 0xffff {
            3
        } else {
            4
        });
        i += 1;
    }
    bytes
}
fn retain_action_leaves(
    value: &Value,
    path: &Utf16,
    source: &str,
    out: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, path.clone())?;
    match value {
        Value::Object(items) if !items.is_empty() => {
            for (k, v) in crate::value::js_object_members(value, ctx)? {
                ctx.charge_work(
                    path.len()
                        .saturating_add(k.len().saturating_mul(2))
                        .saturating_add(1),
                    path.clone(),
                )?;
                retain_action_leaves(v, &append_pointer(path, k), source, out, ctx)?;
            }
            return Ok(());
        }
        Value::Array(items) if !items.is_empty() => {
            for (i, v) in items.iter().enumerate() {
                ctx.charge_work(path.len().saturating_add(24), Utf16::default())?;
                retain_action_leaves(
                    v,
                    &append_pointer(path, &Utf16::from(i.to_string())),
                    source,
                    out,
                    ctx,
                )?;
            }
            return Ok(());
        }
        _ => {}
    }
    ctx.charge_work(path.len().saturating_add(1), Utf16::default())?;
    let id = format!("d{}", out.len());
    out.push(Value::Object(vec![(Utf16::from("id"),s(id)),(Utf16::from("sourceId"),source_value(source,ctx)?),(Utf16::from("pointer"),Value::String(path.clone())),(Utf16::from("assertion"),s("actions")),(Utf16::from("relevance"),s("selected")),(Utf16::from("fidelity"),s("exact")),(Utf16::from("checks"),arr([s("informational")])),(Utf16::from("reason"),s("Selected action assertion retained after inspectActions declaration checks; executor obligations are not discharged by generation")),(Utf16::from("obligationIds"),arr([]))]));
    Ok(())
}
fn access_input_error(path: &str) -> EngineError {
    EngineError::new(
        "INPUT",
        Utf16::from(path),
        "Typed access admission refused: INPUT",
    )
}
fn access_input_digest(
    request: &Value,
    profile: &Value,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    charge_clone_tree(request, ctx)?;
    charge_clone_tree(profile, ctx)?;
    let digest = crate::canonical::canonical_sha256_admitted(
        &obj([("request", request.clone()), ("profile", profile.clone())]),
        ctx,
    )
    .map_err(|error| {
        if !error.is_control_failure() && error.code == "CANONICAL_INVALID_UNICODE" {
            access_input_error("")
        } else {
            error
        }
    })?;
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}
fn add_action_key(
    items: &mut Vec<Value>,
    value: Value,
    records: &[Value],
    pointer: &str,
    logical: &str,
    ctx: &mut Context<'_>,
) -> Result<Option<Value>, EngineError> {
    let diagnostic = || {
        obj([
            ("code", s("REFERENCE")),
            ("sourceId", s(logical)),
            ("pointer", s(pointer)),
            ("message", s("Typed access declaration refused: REFERENCE")),
        ])
    };
    let (Some(module), Some(element), Some(key_id)) = (
        string_member(&value, "module"),
        string_member(&value, "element"),
        string_member(&value, "key"),
    ) else {
        ctx.charge_work(
            logical
                .len()
                .saturating_add(pointer.len())
                .saturating_add(1),
            Utf16::default(),
        )?;
        return Ok(Some(diagnostic()));
    };
    let mut valid = false;
    for record in records {
        ctx.charge_work(1, module.clone())?;
        if string_member(at(record, "ref"), "module") == Some(module)
            && string_member(at(record, "ref"), "element") == Some(element)
        {
            for key in array_items(at(record, "keys")).unwrap_or(&[]) {
                ctx.charge_work(key_id.len().saturating_add(1), module.clone())?;
                if string_member(key, "id") == Some(key_id) {
                    valid = true;
                    break;
                }
            }
            break;
        }
    }
    if !valid {
        ctx.charge_work(
            logical
                .len()
                .saturating_add(pointer.len())
                .saturating_add(1),
            Utf16::default(),
        )?;
        return Ok(Some(diagnostic()));
    }
    for existing in items.iter() {
        ctx.charge_work(
            module
                .len()
                .saturating_add(element.len())
                .saturating_add(key_id.len())
                .saturating_add(1),
            Utf16::default(),
        )?;
        if string_member(existing, "module") == Some(module)
            && string_member(existing, "element") == Some(element)
            && string_member(existing, "key") == Some(key_id)
        {
            return Ok(None);
        }
    }
    charge_clone_tree(&value, ctx)?;
    items.push(value);
    Ok(None)
}
fn generate(
    _engine: &CodegenEngine<'_>,
    request_input: &Value,
    profile_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let request = crate::value::admit_json(request_input, ctx)?;
    let profile = crate::value::admit_json(profile_input, ctx)?;
    ctx.charge_work(
        string_member(&request, "logical")
            .map_or(0, Utf16::len)
            .saturating_mul(3)
            .saturating_add(1),
        Utf16::default(),
    )?;
    let logical_raw = string_member(&request, "logical")
        .cloned()
        .unwrap_or_default();
    let logical = logical_raw.to_utf8().unwrap_or_default();
    let empty_ir = obj([
        ("documentId", s("")),
        ("sourceId", s(&logical)),
        ("records", arr([])),
    ]);
    let mut diagnostics = Vec::new();
    let add = |code: &str, pointer: &str, source: &str| {
        obj([
            ("code", s(code)),
            ("sourceId", s(source)),
            ("pointer", s(pointer)),
            (
                "message",
                s(format!("Typed access declaration refused: {code}")),
            ),
        ])
    };
    let add_raw = |code: &str, pointer: &str, source: &Utf16| {
        obj([
            ("code", s(code)),
            ("sourceId", Value::String(source.clone())),
            ("pointer", s(pointer)),
            (
                "message",
                s(format!("Typed access declaration refused: {code}")),
            ),
        ])
    };
    macro_rules! add {
        ($code:expr,$pointer:expr,$source:expr) => {{
            let code = $code;
            let pointer = $pointer;
            let source = $source;
            ctx.charge_work(
                source
                    .len()
                    .saturating_add(pointer.len())
                    .saturating_add(code.len())
                    .saturating_add(1),
                Utf16::default(),
            )?;
            add(code, pointer, source)
        }};
    }
    macro_rules! add_raw {
        ($code:expr,$pointer:expr,$source:expr) => {{
            let code = $code;
            let pointer = $pointer;
            let source = $source;
            ctx.charge_work(
                source
                    .len()
                    .saturating_add(pointer.len())
                    .saturating_add(code.len())
                    .saturating_add(1),
                Utf16::default(),
            )?;
            add_raw(code, pointer, source)
        }};
    }
    let mut runtime = None;
    for dependency in array_items(at(&profile, "dependencies")).unwrap_or(&[]) {
        if matches!(
            metered_string(dependency, "distribution", ctx)?.as_deref(),
            Some("umf_access" | "umf-access")
        ) {
            runtime = Some(dependency);
            break;
        }
    }
    let runtime_distribution = if let Some(runtime) = runtime {
        metered_string(runtime, "distribution", ctx)?.unwrap_or_else(|| "umf_access".into())
    } else {
        "umf_access".into()
    };
    let runtime_version = if let Some(runtime) = runtime {
        metered_string(runtime, "version", ctx)?.unwrap_or_else(|| "unqualified".into())
    } else {
        "unqualified".into()
    };
    let base =
        |outcome: &str, diags: Vec<Value>, ctx: &mut Context<'_>| -> Result<Value, EngineError> {
            let input_digest = access_input_digest(&request, &profile, ctx)?;
            ctx.charge_work(
                runtime_distribution
                    .len()
                    .saturating_add(runtime_version.len())
                    .saturating_add(input_digest.len())
                    .saturating_add(1),
                Utf16::default(),
            )?;
            Ok(obj([
                ("contract", s("umf-access-generate/0.1")),
                ("abi", s("umf-python-types/0.1")),
                (
                    "runtimeAbi",
                    obj([
                        ("distribution", s(&runtime_distribution)),
                        ("version", s(&runtime_version)),
                        ("abi", s("umf-access-runtime/0.1")),
                    ]),
                ),
                ("outcome", s(outcome)),
                ("inputDigest", s(&input_digest)),
                ("files", arr([])),
                ("symbols", arr([])),
                ("dispositions", arr([])),
                ("diagnostics", arr(diags)),
                ("obligations", arr([])),
            ]))
        };
    let required = [
        "contract",
        "sources",
        "logical",
        "bindings",
        "records",
        "actions",
        "projections",
        "package",
        "names",
        "mode",
        "profileId",
        "profileVersion",
        "coreVersion",
    ];
    if !has_keys(&request, &required, &[])
        || get_str(&request, "contract").as_deref() != Some("umf-access-generate/0.1")
        || get_str(&request, "coreVersion").as_deref() != Some("0.10.0")
        || !["strict", "report"].contains(&get_str(&request, "mode").as_deref().unwrap_or(""))
    {
        return Err(access_input_error(""));
    }
    for key in ["logical", "profileId", "profileVersion"] {
        if string_member(&request, key).is_none() {
            return Err(access_input_error(""));
        }
    }
    for key in [
        "sources",
        "bindings",
        "records",
        "actions",
        "projections",
        "names",
    ] {
        if array_items(member(&request, key).unwrap_or(&Value::Null)).is_none() {
            return Err(access_input_error(""));
        }
    }
    let package = get_str(&request, "package").unwrap_or_default();
    if !package
        .as_bytes()
        .first()
        .is_some_and(u8::is_ascii_lowercase)
        || !package
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
    {
        return Err(access_input_error(""));
    }
    let sources = crate::value::array_items(member(&request, "sources").unwrap_or(&Value::Null))
        .ok_or_else(|| access_input_error(""))?;
    if sources.is_empty() {
        return Err(access_input_error(""));
    }
    let records = crate::value::array_items(member(&request, "records").unwrap_or(&Value::Null))
        .ok_or_else(|| access_input_error(""))?;
    if records.is_empty() {
        return Err(access_input_error(""));
    }
    let action_items =
        crate::value::array_items(member(&request, "actions").unwrap_or(&Value::Null))
            .ok_or_else(|| access_input_error(""))?;
    let binding_items = array_items(at(&request, "bindings")).unwrap_or(&[]);
    let projection_items = array_items(at(&request, "projections")).unwrap_or(&[]);
    let name_items = array_items(at(&request, "names")).unwrap_or(&[]);
    if sources.iter().any(|x| {
        !has_keys(x, &["id", "format", "text"], &[])
            || string_member(x, "id").is_none_or(|s| s.is_empty())
            || !matches!(get_str(x, "format").as_deref(), Some("json" | "yaml"))
            || string_member(x, "text").is_none()
    }) || records.iter().any(|x| !exact_ref(x))
        || binding_items.iter().any(|x| !matches!(x, Value::String(_)))
        || action_items.iter().any(|x| {
            !has_keys(x, &["module", "action"], &[])
                || string_member(x, "module").is_none()
                || string_member(x, "action").is_none()
        })
        || projection_items.iter().any(|x| {
            !has_keys(x, &["name", "record", "fields"], &[])
                || string_member(x, "name").is_none()
                || !exact_ref(at(x, "record"))
                || array_items(at(x, "fields")).is_none_or(|fs| fs.iter().any(|f| !exact_ref(f)))
        })
        || name_items.iter().any(|x| {
            !has_keys(x, &["sourceId", "pointer", "python"], &[])
                || string_member(x, "sourceId").is_none()
                || string_member(x, "pointer").is_none()
                || string_member(x, "python").is_none()
        })
    {
        return Err(access_input_error(""));
    }
    let mut action_identities = Vec::new();
    for action in action_items {
        charge_clone_tree(action, ctx)?;
        for old in &action_identities {
            charge_clone_tree(old, ctx)?;
            if old == action {
                return Err(access_input_error(""));
            }
        }
        action_identities.push(action.clone());
    }
    let source_ids = sources
        .iter()
        .map(|x| string_member(x, "id").unwrap())
        .collect::<Vec<_>>();
    let mut record_ids = BTreeSet::new();
    for record in records {
        let key = (
            string_member(record, "module").unwrap(),
            string_member(record, "element").unwrap(),
        );
        ctx.charge_work(
            key.0
                .len()
                .saturating_add(key.1.len())
                .saturating_mul(64)
                .saturating_add(1),
            Utf16::default(),
        )?;
        if !record_ids.insert(key) {
            return Err(access_input_error(""));
        }
    }
    let bindings_text = binding_items
        .iter()
        .map(|x| match x {
            Value::String(text) => text,
            _ => unreachable!(),
        })
        .collect::<Vec<_>>();
    for (values, path) in [
        (&source_ids[..], "/sources"),
        (&bindings_text[..], "/bindings"),
    ] {
        let mut seen = BTreeSet::new();
        for value in values {
            ctx.charge_work(
                value.len().saturating_add(seen.len()).saturating_add(1),
                Utf16::from(path),
            )?;
            if !seen.insert((*value).clone()) {
                return Err(access_input_error(""));
            }
        }
    }
    if let Some(pointer) = profile::validate(
        &profile,
        string_member(&request, "profileId").expect("preflight checked profileId"),
        string_member(&request, "profileVersion").expect("preflight checked profileVersion"),
        &Utf16::from("0.10.0"),
        !action_items.is_empty(),
        ctx,
    )? {
        diagnostics.push(add_raw!("PROFILE", pointer, &logical_raw));
        return base("refused", diagnostics, ctx);
    }
    if sources.len() > 32 || records.len() > 10_000 || action_items.len() > 1_000 {
        diagnostics.push(add!("LIMIT", "", &logical));
        return base("refused", diagnostics, ctx);
    }
    let mut parsed_sources = Vec::new();
    for (index, source) in sources.iter().enumerate() {
        ctx.charge_work(1, Utf16::from(format!("/sources/{index}")))?;
        let id = string_member(source, "id").unwrap();
        ctx.charge_work(
            id.len().saturating_add(1),
            Utf16::from(format!("/sources/{index}/id")),
        )?;
        let id = id.clone();
        let format = if get_str(source, "format").as_deref() == Some("yaml") {
            umf_core::serialization::Format::Yaml
        } else {
            umf_core::serialization::Format::Json
        };
        let parsed = match _engine.read_document(
            string_member(source, "text").ok_or_else(|| access_input_error(""))?,
            format,
            ctx,
        ) {
            Ok(value) => value,
            Err(error) if error.is_control_failure() => return Err(error),
            Err(error) if error.code == "LIMIT" => {
                return base(
                    "refused",
                    vec![obj([
                        ("code", s("LIMIT")),
                        ("sourceId", Value::String(id.clone())),
                        ("pointer", s(format!("/sources/{index}/text"))),
                        ("message", s("Typed access declaration refused: LIMIT")),
                    ])],
                    ctx,
                )
            }
            Err(_) => return Err(access_input_error(&format!("/sources/{index}/text"))),
        };
        ctx.charge_work(
            id.len().saturating_add(1),
            Utf16::from(format!("/sources/{index}/id")),
        )?;
        parsed_sources.push((id, parsed));
    }
    let mut source_index = None;
    for (index, source) in sources.iter().enumerate() {
        ctx.charge_work(1, Utf16::from(format!("/sources/{index}/id")))?;
        let id = string_member(source, "id");
        ctx.charge_work(
            id.map_or(0, Utf16::len)
                .saturating_add(logical_raw.len())
                .saturating_add(1),
            Utf16::from(format!("/sources/{index}/id")),
        )?;
        if id == Some(&logical_raw) {
            source_index = Some(index);
            break;
        }
    }
    let si = source_index.ok_or_else(|| access_input_error("/logical"))?;
    let source_text = string_member(&sources[si], "text").ok_or_else(|| access_input_error(""))?;
    ctx.charge_work(source_text.len().saturating_add(1), Utf16::default())?;
    let source_text = source_text.clone();
    let document = crate::value::admit_json(&parsed_sources[si].1, ctx)?;
    if get_str(&document, "umf").as_deref() != Some("0.10.0") {
        return Err(access_input_error("/logical"));
    }
    let modules = array_items(at(&document, "modules")).unwrap_or(&[]);
    let mut supplied_bindings_raw = Vec::new();
    for id in &bindings_text {
        let mut found = None;
        for (name, document) in &parsed_sources {
            ctx.charge_work(1, Utf16::from("/bindings"))?;
            ctx.charge_work(
                name.len().saturating_add(id.len()).saturating_add(1),
                Utf16::from("/bindings"),
            )?;
            if name == *id {
                found = Some(document);
                break;
            }
        }
        if let Some(document) = found {
            supplied_bindings_raw.push((*id, crate::value::admit_json(document, ctx)?));
        } else {
            diagnostics.push(add!("REFERENCE", "/bindings", &logical));
        }
    }
    if supplied_bindings_raw.len() != bindings_text.len() {
        return base("refused", diagnostics, ctx);
    }
    let input_digest = access_input_digest(&request, &profile, ctx)?;
    let logical = logical_raw.to_utf8().map_err(|_| access_input_error(""))?;
    let supplied_bindings = supplied_bindings_raw
        .into_iter()
        .map(|(id, document)| Ok((id.to_utf8().map_err(|_| access_input_error(""))?, document)))
        .collect::<Result<Vec<_>, EngineError>>()?;
    let inspected = inspection::inspect_access_views(
        _engine,
        &document,
        records,
        &supplied_bindings,
        &logical,
        ctx,
    )?;
    diagnostics.extend(inspected.diagnostics);
    let mut resolved_records = inspected.records;
    for record in &mut resolved_records {
        let record_pointer = metered_string(record, "pointer", ctx)?.unwrap_or_default();
        let record_id = metered_string(at(record, "ref"), "element", ctx)?.unwrap_or_default();
        let mut authored = None;
        for module in modules {
            ctx.charge_work(1, Utf16::default())?;
            for key in ["id"] {
                if let Some(v) = member(module, key) {
                    charge_clone_tree(v, ctx)?;
                }
            }
            if member(module, "id") != member(at(record, "ref"), "module") {
                continue;
            }
            for element in array_items(at(module, "elements")).unwrap_or(&[]) {
                if metered_string(element, "id", ctx)?.as_deref() == Some(&record_id) {
                    authored = Some(element);
                    break;
                }
            }
            break;
        }
        let keys = authored
            .map(|r| array_items(at(r, "keys")).unwrap_or(&[]))
            .unwrap_or(&[]);
        let mut primary = Vec::new();
        for key in keys {
            ctx.charge_work(1, Utf16::default())?;
            if member(key, "primary") == Some(&Value::Bool(true)) {
                primary.push(key);
            }
        }
        let inverse = if primary.len() == 1 {
            primary.first().copied()
        } else if keys.len() == 1 {
            keys.first()
        } else {
            None
        };
        ctx.charge_work(
            record_id.len().saturating_mul(8).saturating_add(1),
            Utf16::default(),
        )?;
        let record_python = named_override(name_items, &logical, &record_pointer, ctx)?
            .unwrap_or_else(|| class_name(&record_id));
        if let Value::Object(members) = record {
            if let Some((_, python)) = members
                .iter_mut()
                .find(|(name, _)| name == &Utf16::from("python"))
            {
                *python = s(record_python);
            }
            if let Some(key) = inverse.and_then(|key| member(key, "id")) {
                charge_clone_tree(key, ctx)?;
                members.push((Utf16::from("inverseKey"), key.clone()));
            }
            if let Some((_, Value::Array(fields))) = members
                .iter_mut()
                .find(|(name, _)| name == &Utf16::from("fields"))
            {
                for field in fields {
                    let field_pointer = metered_string(field, "pointer", ctx)?.unwrap_or_default();
                    let eid = metered_string(at(field, "ref"), "element", ctx)?.unwrap_or_default();
                    ctx.charge_work(
                        eid.len().saturating_mul(8).saturating_add(1),
                        Utf16::default(),
                    )?;
                    let python = named_override(name_items, &logical, &field_pointer, ctx)?
                        .unwrap_or_else(|| snake(&eid));
                    if let Value::Object(members) = field {
                        if let Some((_, v)) = members
                            .iter_mut()
                            .find(|(name, _)| name == &Utf16::from("python"))
                        {
                            *v = s(python);
                        }
                    }
                }
            }
        }
    }
    let mut selected_record_refs = BTreeSet::new();
    for record in records {
        let module = string_member(record, "module").expect("request ref checked");
        let element = string_member(record, "element").expect("request ref checked");
        ctx.charge_work(
            module.len().saturating_add(element.len()).saturating_add(1),
            Utf16::from("/records"),
        )?;
        selected_record_refs.insert((module.clone(), element.clone()));
    }
    let mut relation_ir = Vec::new();
    let relationship_validation = inspection::core_validation(_engine, &document, ctx)?;
    for (mi, module) in modules.iter().enumerate() {
        if let Some(v) = member(module, "id") {
            charge_clone_tree(v, ctx)?;
        }
        let owner_module = string_member(module, "id").cloned().unwrap_or_default();
        for (ri, relation) in array_items(member(module, "relationships").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            ctx.charge_work(1, Utf16::from(format!("/modules/{mi}/relationships/{ri}")))?;
            let sources =
                array_items(member(relation, "source").unwrap_or(&Value::Null)).unwrap_or(&[]);
            let mut owners = Vec::new();
            for source in sources {
                ctx.charge_work(1, Utf16::default())?;
                if let (Some(module), Some(element)) = (
                    string_member(source, "module"),
                    string_member(source, "element"),
                ) {
                    ctx.charge_work(
                        module.len().saturating_add(element.len()).saturating_add(1),
                        Utf16::default(),
                    )?;
                    if selected_record_refs.contains(&(module.clone(), element.clone())) {
                        owners.push(source);
                    }
                }
            }
            if owners.is_empty() {
                continue;
            }
            let relation_pointer = Utf16::from(format!("/modules/{mi}/relationships/{ri}"));
            let mut partial = false;
            for warning in &relationship_validation {
                ctx.charge_work(1, Utf16::default())?;
                if warning
                    .code
                    .units()
                    .starts_with(Utf16::from("UNKNOWN_RELATIONSHIP_").units())
                    && is_under(&warning.path, &relation_pointer)
                {
                    partial = true;
                    break;
                }
            }
            if partial {
                diagnostics.push(add!(
                    "UNKNOWN_RELEVANT",
                    &format!("/modules/{mi}/relationships/{ri}"),
                    &logical
                ));
                continue;
            }

            let targets =
                array_items(member(relation, "target").unwrap_or(&Value::Null)).unwrap_or(&[]);
            if sources.len() != 1
                || targets.len() != 1
                || member(relation, "directed") != Some(&Value::Bool(true))
            {
                diagnostics.push(add!(
                    "LOSS",
                    &format!("/modules/{mi}/relationships/{ri}"),
                    &logical
                ));
                continue;
            }
            let owner = owners[0];
            let target = &targets[0];
            let Some(target_module_id) = string_member(target, "module") else {
                diagnostics.push(add!(
                    "REFERENCE",
                    &format!("/modules/{mi}/relationships/{ri}/target"),
                    &logical
                ));
                continue;
            };
            let Some(target_element_id) = string_member(target, "element") else {
                diagnostics.push(add!(
                    "REFERENCE",
                    &format!("/modules/{mi}/relationships/{ri}/target"),
                    &logical
                ));
                continue;
            };
            let Some(key_id) = string_member(target, "key") else {
                diagnostics.push(add!(
                    "REFERENCE",
                    &format!("/modules/{mi}/relationships/{ri}/target/key"),
                    &logical
                ));
                continue;
            };
            let mut target_module = None;
            for (candidate_index, candidate) in modules.iter().enumerate() {
                ctx.charge_work(1, Utf16::from(format!("/modules/{candidate_index}/id")))?;
                if let Some(id) = string_member(candidate, "id") {
                    ctx.charge_work(
                        id.len().saturating_add(target_module_id.len()),
                        Utf16::default(),
                    )?;
                    if id == target_module_id {
                        target_module = Some((candidate_index, candidate));
                        break;
                    }
                }
            }
            let Some((_target_mi, target_module)) = target_module else {
                diagnostics.push(add!(
                    "REFERENCE",
                    &format!("/modules/{mi}/relationships/{ri}/target"),
                    &logical
                ));
                continue;
            };
            let target_elements =
                array_items(member(target_module, "elements").unwrap_or(&Value::Null))
                    .unwrap_or(&[]);
            let mut target_record = None;
            for (candidate_index, candidate) in target_elements.iter().enumerate() {
                ctx.charge_work(
                    1,
                    Utf16::from(format!(
                        "/modules/{_target_mi}/elements/{candidate_index}/id"
                    )),
                )?;
                if let (Some(id), Some(kind)) = (
                    string_member(candidate, "id"),
                    string_member(candidate, "kind"),
                ) {
                    ctx.charge_work(
                        id.len()
                            .saturating_add(target_element_id.len())
                            .saturating_add(kind.len()),
                        Utf16::default(),
                    )?;
                    if id == target_element_id && kind == &Utf16::from("record") {
                        target_record = Some((candidate_index, candidate));
                        break;
                    }
                }
            }
            let Some((_target_ei, target_record)) = target_record else {
                diagnostics.push(add!(
                    "REFERENCE",
                    &format!("/modules/{mi}/relationships/{ri}/target"),
                    &logical
                ));
                continue;
            };
            let mut target_key_found = false;
            for key in
                array_items(member(target_record, "keys").unwrap_or(&Value::Null)).unwrap_or(&[])
            {
                ctx.charge_work(
                    1,
                    Utf16::from(format!("/modules/{_target_mi}/elements/{_target_ei}/keys")),
                )?;
                if let Some(id) = string_member(key, "id") {
                    ctx.charge_work(id.len().saturating_add(key_id.len()), Utf16::default())?;
                    if id == key_id {
                        target_key_found = true;
                        break;
                    }
                }
            }
            if !target_key_found {
                diagnostics.push(add!(
                    "REFERENCE",
                    &format!("/modules/{mi}/relationships/{ri}/target/key"),
                    &logical
                ));
                continue;
            };
            for value in [
                member(target, "module"),
                member(target, "element"),
                member(target, "key"),
                member(owner, "module"),
                member(owner, "element"),
                member(relation, "id"),
                member(relation, "logicalName").or_else(|| member(relation, "name")),
            ]
            .into_iter()
            .flatten()
            {
                charge_clone_tree(value, ctx)?;
            }
            ctx.charge_work(owner_module.len().saturating_add(1), Utf16::default())?;
            let target_ref = obj([
                ("module", Value::String(target_module_id.clone())),
                ("element", Value::String(target_element_id.clone())),
            ]);
            let relation_pointer = format!("/modules/{mi}/relationships/{ri}");
            let relation_id = string_member(relation, "id").cloned().unwrap_or_default();
            let relation_name = member(relation, "logicalName")
                .or_else(|| member(relation, "name"))
                .cloned()
                .unwrap_or(Value::Null);
            let relation_id_text = relation_id.to_utf8().unwrap_or_default();
            ctx.charge_work(
                relation_id.len().saturating_mul(8).saturating_add(1),
                Utf16::default(),
            )?;
            let python = named_override(name_items, &logical, &relation_pointer, ctx)?
                .unwrap_or_else(|| snake(&relation_id_text));
            let target_max = member(
                member(relation, "targetMultiplicity").unwrap_or(&Value::Null),
                "max",
            );
            let to_one = matches!(target_max,Some(Value::Number(n)) if *n==1.0);
            let optional = member(
                member(relation, "targetMultiplicity").unwrap_or(&Value::Null),
                "min",
            ) == Some(&Value::Number(0.0));
            relation_ir.push(obj([
                (
                    "owner",
                    obj([
                        (
                            "module",
                            member(owner, "module").cloned().unwrap_or(Value::Null),
                        ),
                        (
                            "element",
                            member(owner, "element").cloned().unwrap_or(Value::Null),
                        ),
                    ]),
                ),
                ("target", target_ref),
                ("key", Value::String(key_id.clone())),
                ("python", s(python)),
                ("pointer", s(relation_pointer)),
                ("module", Value::String(owner_module.clone())),
                ("id", Value::String(relation_id)),
                ("logicalName", relation_name),
                ("toOne", Value::Bool(to_one)),
                ("optional", Value::Bool(optional)),
            ]));
        }
    }
    let mut selected_actions = BTreeSet::new();
    for action in action_items {
        if let (Some(module), Some(id)) = (
            string_member(action, "module"),
            string_member(action, "action"),
        ) {
            ctx.charge_work(
                module.len().saturating_add(id.len()).saturating_add(1),
                Utf16::default(),
            )?;
            selected_actions.insert((module.clone(), id.clone()));
        }
    }
    let action_inspection = if action_items.is_empty() {
        crate::actions::ActionInspection::default()
    } else {
        match crate::actions::inspect_document(&document, _engine.resources(), None, ctx) {
            Ok(value) => value,
            Err(error) if !error.is_control_failure() => {
                // The access wrapper intentionally maps any thrown inspectActions
                // refusal to its historical reference diagnostic. The analyzer's
                // own public operation preserves its richer error separately.
                diagnostics.push(obj([
                    ("code", s("REFERENCE")),
                    ("sourceId", s(&logical)),
                    ("pointer", s("/actions")),
                    ("message", s("Typed access declaration refused: REFERENCE")),
                ]));
                crate::actions::ActionInspection::default()
            }
            Err(error) => return Err(error),
        }
    };
    if !action_inspection.validation.valid {
        diagnostics.push(obj([
            ("code", s("REFERENCE")),
            ("sourceId", s(&logical)),
            ("pointer", s("/actions")),
            ("message", s("Typed access declaration refused: REFERENCE")),
        ]));
    }
    let mut action_ir = Vec::new();
    let mut action_disposition_batches = Vec::new();
    let mut action_raw_dispositions = Vec::new();
    let mut action_semantic_obligations: Vec<(Utf16, Utf16)> = Vec::new();
    for requested in action_items {
        ctx.charge_work(1, Utf16::from("/actions"))?;
        let mut declaration = None;
        for candidate in &action_inspection.actions {
            ctx.charge_work(
                candidate
                    .module
                    .len()
                    .saturating_add(candidate.id.len())
                    .saturating_add(1),
                Utf16::default(),
            )?;
            if string_member(requested, "module") == Some(&candidate.module)
                && string_member(requested, "action") == Some(&candidate.id)
            {
                declaration = Some(candidate);
                break;
            }
        }
        let Some(declaration) = declaration else {
            diagnostics.push(add!("REFERENCE", "/actions", &logical));
            continue;
        };
        let action = &declaration.value;
        ctx.charge_work(
            declaration
                .pointer
                .len()
                .saturating_add(declaration.id.len())
                .saturating_add(1),
            Utf16::default(),
        )?;
        let pointer = declaration.pointer.to_utf8().unwrap_or_default();
        let raw_start = action_raw_dispositions.len();
        retain_action_leaves(
            action,
            &declaration.pointer,
            &logical,
            &mut action_raw_dispositions,
            ctx,
        )?;
        ctx.charge_work(1, Utf16::default())?;
        action_disposition_batches.push((
            action_raw_dispositions.len() - raw_start,
            declaration.obligations.len(),
        ));
        for obligation in &declaration.obligations {
            ctx.charge_work(
                obligation
                    .path
                    .len()
                    .saturating_mul(2)
                    .saturating_add(obligation.kind.len())
                    .saturating_add(logical.len())
                    .saturating_add(1),
                Utf16::default(),
            )?;
            if obligation.kind == Utf16::from("unknown") {
                diagnostics.push(obj([
                    ("code", s("UNKNOWN_RELEVANT")),
                    ("sourceId", s(&logical)),
                    ("pointer", Value::String(obligation.path.clone())),
                    (
                        "message",
                        s("Typed access declaration refused: UNKNOWN_RELEVANT"),
                    ),
                ]));
            }
            action_semantic_obligations.push((obligation.path.clone(), obligation.kind.clone()));
        }
        let action_id = declaration.id.to_utf8().unwrap_or_default();
        ctx.charge_work(
            action_id.len().saturating_mul(8).saturating_add(1),
            Utf16::default(),
        )?;
        let action_python = named_override(name_items, &logical, &pointer, ctx)?
            .unwrap_or_else(|| class_name(&action_id));
        let resolve_parameters =
            |key: &str, ctx: &mut Context<'_>| -> Result<Vec<Value>, EngineError> {
                let mut resolved = Vec::new();
                for (i, param) in array_items(member(action, key).unwrap_or(&Value::Null))
                    .unwrap_or(&[])
                    .iter()
                    .enumerate()
                {
                    ctx.charge_work(1, Utf16::from(format!("{pointer}/{key}/{i}")))?;
                    ctx.charge_work(
                        pointer.len().saturating_add(key.len()).saturating_add(24),
                        Utf16::default(),
                    )?;
                    let pp = format!("{pointer}/{key}/{i}");
                    let python_name = named_override(name_items, &logical, &pp, ctx)?;
                    let param_id = metered_string(param, "id", ctx)?.unwrap_or_default();
                    ctx.charge_work(
                        param_id
                            .len()
                            .saturating_mul(8)
                            .saturating_add(python_name.as_ref().map_or(0, String::len))
                            .saturating_add(1),
                        Utf16::default(),
                    )?;
                    let pname = python_name.unwrap_or_else(|| snake(&param_id));
                    if metered_string(param, "kind", ctx)?.as_deref() == Some("entity") {
                        let target = member(param, "target").unwrap_or(&Value::Null);
                        for value in [
                            member(param, "id"),
                            member(target, "module"),
                            member(target, "element"),
                            member(target, "key"),
                        ]
                        .into_iter()
                        .flatten()
                        {
                            charge_clone_tree(value, ctx)?;
                        }
                        resolved.push(obj([
                            ("id", member(param, "id").cloned().unwrap_or(Value::Null)),
                            ("python", s(pname)),
                            ("required", Value::Bool(true)),
                            ("pointer", s(pp)),
                            (
                                "entity",
                                obj([
                                    (
                                        "module",
                                        member(target, "module").cloned().unwrap_or(Value::Null),
                                    ),
                                    (
                                        "element",
                                        member(target, "element").cloned().unwrap_or(Value::Null),
                                    ),
                                ]),
                            ),
                            (
                                "entityKey",
                                member(target, "key").cloned().unwrap_or(Value::Null),
                            ),
                        ]));
                    } else {
                        let field_ref = member(param, "field").unwrap_or(&Value::Null);
                        let mut field = None;
                        for record in &resolved_records {
                            for candidate in
                                array_items(member(record, "fields").unwrap_or(&Value::Null))
                                    .unwrap_or(&[])
                            {
                                ctx.charge_work(1, Utf16::from("/records"))?;
                                let reference = member(candidate, "ref").unwrap_or(&Value::Null);
                                for key in ["module", "element"] {
                                    ctx.charge_work(
                                        string_member(reference, key)
                                            .map_or(0, Utf16::len)
                                            .saturating_add(
                                                string_member(field_ref, key).map_or(0, Utf16::len),
                                            )
                                            .saturating_add(1),
                                        Utf16::from("/records"),
                                    )?;
                                }
                                if diff_ref_equal(reference, field_ref) {
                                    charge_clone_tree(candidate, ctx)?;
                                    field = Some(candidate.clone());
                                    break;
                                }
                            }
                            if field.is_some() {
                                break;
                            }
                        }
                        if let Some(value) = member(param, "id") {
                            charge_clone_tree(value, ctx)?;
                        }
                        if let Some(value) = member(param, "required") {
                            charge_clone_tree(value, ctx)?;
                        }
                        resolved.push(obj([
                            ("id", member(param, "id").cloned().unwrap_or(Value::Null)),
                            ("python", s(pname)),
                            (
                                "required",
                                member(param, "required")
                                    .cloned()
                                    .unwrap_or(Value::Bool(false)),
                            ),
                            ("pointer", s(pp)),
                            ("field", field.unwrap_or(Value::Null)),
                        ]));
                    }
                }
                Ok(resolved)
            };
        let mut failures = Vec::new();
        for failure in array_items(at(action, "failures")).unwrap_or(&[]) {
            for value in [member(failure, "code"), member(failure, "retryable")]
                .into_iter()
                .flatten()
            {
                charge_clone_tree(value, ctx)?;
            }
            failures.push(obj([
                (
                    "code",
                    member(failure, "code").cloned().unwrap_or(Value::Null),
                ),
                (
                    "retryable",
                    member(failure, "retryable")
                        .cloned()
                        .unwrap_or(Value::Bool(false)),
                ),
            ]));
        }
        let binding_kind = metered_string(at(action, "binding"), "kind", ctx)?.unwrap_or_default();
        let mut created_keys = Vec::new();
        let mut changed_keys = Vec::new();
        let entity_key =
            |entity: &Value, ctx: &mut Context<'_>| -> Result<Option<Value>, EngineError> {
                let Some(param_id) = string_member(entity, "parameter") else {
                    return Ok(None);
                };
                let Some(parameters) =
                    array_items(member(action, "parameters").unwrap_or(&Value::Null))
                else {
                    return Ok(None);
                };
                let mut param = None;
                for candidate in parameters {
                    ctx.charge_work(1, Utf16::from("/actions"))?;
                    let id = string_member(candidate, "id");
                    let kind = string_member(candidate, "kind");
                    ctx.charge_work(
                        id.map_or(0, Utf16::len)
                            .saturating_add(kind.map_or(0, Utf16::len))
                            .saturating_add(param_id.len())
                            .saturating_add(1),
                        Utf16::from("/actions"),
                    )?;
                    if id == Some(param_id) && kind == Some(&Utf16::from("entity")) {
                        param = Some(candidate);
                        break;
                    }
                }
                let Some(target) = param.and_then(|v| member(v, "target")) else {
                    return Ok(None);
                };
                let (Some(module), Some(element), Some(key)) = (
                    member(target, "module"),
                    member(target, "element"),
                    member(target, "key"),
                ) else {
                    return Ok(None);
                };
                for value in [module, element, key] {
                    charge_clone_tree(value, ctx)?;
                }
                Ok(Some(obj([
                    ("module", module.clone()),
                    ("element", element.clone()),
                    ("key", key.clone()),
                ])))
            };
        let binding = member(action, "binding").unwrap_or(&Value::Null);
        if binding_kind == "recipe" {
            for (effect_index, effect) in
                array_items(member(binding, "effects").unwrap_or(&Value::Null))
                    .unwrap_or(&[])
                    .iter()
                    .enumerate()
            {
                ctx.charge_work(
                    1,
                    Utf16::from(format!("{pointer}/binding/effects/{effect_index}")),
                )?;
                let effect_pointer = format!("{pointer}/binding/effects/{effect_index}");
                match get_str(effect, "kind").as_deref() {
                    Some("create") => {
                        if let (Some(record), Some(Value::String(key))) =
                            (member(effect, "record"), member(effect, "key"))
                        {
                            charge_clone_tree(record, ctx)?;
                            ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
                            let mut pair =
                                crate::value::object_members(record).unwrap_or(&[]).to_vec();
                            pair.push((Utf16::from("key"), Value::String(key.clone())));
                            if let Some(diagnostic) = add_action_key(
                                &mut created_keys,
                                Value::Object(pair),
                                &resolved_records,
                                &effect_pointer,
                                &logical,
                                ctx,
                            )? {
                                diagnostics.push(diagnostic);
                            }
                        }
                    }
                    Some("set") => {
                        if let Some(entity) = member(effect, "entity") {
                            if let Some(key) = entity_key(entity, ctx)? {
                                if let Some(diagnostic) = add_action_key(
                                    &mut changed_keys,
                                    key,
                                    &resolved_records,
                                    &effect_pointer,
                                    &logical,
                                    ctx,
                                )? {
                                    diagnostics.push(diagnostic);
                                }
                            }
                        }
                    }
                    Some("link" | "unlink") => {
                        for endpoint in [member(effect, "source"), member(effect, "target")]
                            .into_iter()
                            .flatten()
                        {
                            if let Some(key) = entity_key(endpoint, ctx)? {
                                if let Some(diagnostic) = add_action_key(
                                    &mut changed_keys,
                                    key,
                                    &resolved_records,
                                    &effect_pointer,
                                    &logical,
                                    ctx,
                                )? {
                                    diagnostics.push(diagnostic);
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
        } else {
            for frame in
                array_items(member(action, "writes").unwrap_or(&Value::Null)).unwrap_or(&[])
            {
                ctx.charge_work(1, Utf16::from(format!("{pointer}/writes")))?;
                let Some(frame_record) = member(frame, "record") else {
                    continue;
                };
                if !exact_ref(frame_record) {
                    continue;
                }
                let mut record = None;
                for candidate in &resolved_records {
                    ctx.charge_work(1, Utf16::default())?;
                    let module = string_member(frame_record, "module").unwrap();
                    let element = string_member(frame_record, "element").unwrap();
                    ctx.charge_work(module.len().saturating_add(element.len()), Utf16::default())?;
                    if string_member(at(candidate, "ref"), "module") == Some(module)
                        && string_member(at(candidate, "ref"), "element") == Some(element)
                    {
                        record = Some(candidate);
                        break;
                    }
                }
                let Some(record) = record else {
                    diagnostics.push(add!("REFERENCE", &format!("{pointer}/writes"), &logical));
                    continue;
                };
                let keys = array_items(at(record, "keys")).unwrap_or(&[]);
                ctx.charge_work(keys.len().saturating_add(1), Utf16::default())?;
                let mut selected = keys.iter().collect::<Vec<_>>();
                let selector = at(frame, "selector");
                let expression = if string_member(selector, "language")
                    == Some(&Utf16::from("umf.actions.keys"))
                    && string_member(selector, "version") == Some(&Utf16::from("1"))
                {
                    if let Some(source) = string_member(selector, "expression") {
                        ctx.charge_work(
                            source.len(),
                            Utf16::from(format!("{pointer}/writes/selector/expression")),
                        )?;
                        match umf_core::serialization::read_json_value(
                            source.units(),
                            umf_core::serialization::Format::Json,
                            ctx,
                        ) {
                            Ok(value) => Some(value),
                            Err(error) if error.is_control_failure() => return Err(error),
                            Err(_) => None,
                        }
                    } else {
                        None
                    }
                } else {
                    None
                };
                if let Some(decoded) = expression.as_ref() {
                    if let Some(Value::String(key)) = member(decoded, "key") {
                        let mut filtered = Vec::new();
                        for candidate in selected {
                            ctx.charge_work(
                                string_member(candidate, "id")
                                    .map_or(0, Utf16::len)
                                    .saturating_add(key.len())
                                    .saturating_add(1),
                                Utf16::default(),
                            )?;
                            if string_member(candidate, "id") == Some(key) {
                                filtered.push(candidate);
                            }
                        }
                        selected = filtered;
                    } else if let Some(Value::String(entity)) = member(decoded, "entity") {
                        let parameters = array_items(at(action, "parameters")).unwrap_or(&[]);
                        ctx.charge_work(parameters.len().saturating_add(1), Utf16::default())?;
                        let mut parameter = None;
                        for candidate in parameters {
                            ctx.charge_work(
                                string_member(candidate, "id")
                                    .map_or(0, Utf16::len)
                                    .saturating_add(entity.len())
                                    .saturating_add(1),
                                Utf16::default(),
                            )?;
                            if string_member(candidate, "id") == Some(entity) {
                                parameter = Some(candidate);
                                break;
                            }
                        }
                        if let Some(parameter) = parameter.filter(|candidate| {
                            string_member(candidate, "kind") == Some(&Utf16::from("entity"))
                        }) {
                            let target = at(parameter, "target");
                            if let Some(key) = string_member(target, "key") {
                                let mut filtered = Vec::new();
                                for candidate in selected {
                                    ctx.charge_work(
                                        string_member(candidate, "id")
                                            .map_or(0, Utf16::len)
                                            .saturating_add(key.len())
                                            .saturating_add(1),
                                        Utf16::default(),
                                    )?;
                                    if string_member(candidate, "id") == Some(key) {
                                        filtered.push(candidate);
                                    }
                                }
                                selected = filtered;
                            }
                        }
                    }
                }
                for key in selected {
                    charge_clone_tree(frame_record, ctx)?;
                    ctx.charge_work(
                        string_member(key, "id").map_or(0, Utf16::len),
                        Utf16::default(),
                    )?;
                    let reference = obj([
                        (
                            "module",
                            Value::String(string_member(frame_record, "module").unwrap().clone()),
                        ),
                        (
                            "element",
                            Value::String(string_member(frame_record, "element").unwrap().clone()),
                        ),
                        (
                            "key",
                            Value::String(string_member(key, "id").unwrap().clone()),
                        ),
                    ]);
                    if member(frame, "create") == Some(&Value::Bool(true)) {
                        charge_clone_tree(&reference, ctx)?;
                        if let Some(diagnostic) = add_action_key(
                            &mut created_keys,
                            reference.clone(),
                            &resolved_records,
                            &format!("{pointer}/writes"),
                            &logical,
                            ctx,
                        )? {
                            diagnostics.push(diagnostic);
                        }
                    }
                    let fields_present =
                        array_items(at(frame, "fields")).is_some_and(|values| !values.is_empty());
                    let relationships_present = array_items(at(frame, "relationships"))
                        .is_some_and(|values| !values.is_empty());
                    if fields_present || relationships_present {
                        if let Some(diagnostic) = add_action_key(
                            &mut changed_keys,
                            reference,
                            &resolved_records,
                            &format!("{pointer}/writes"),
                            &logical,
                            ctx,
                        )? {
                            diagnostics.push(diagnostic);
                        }
                    }
                }
            }
        }
        ctx.charge_work(
            declaration
                .module
                .len()
                .saturating_add(declaration.id.len())
                .saturating_add(pointer.len())
                .saturating_add(1),
            Utf16::default(),
        )?;
        action_ir.push(obj([
            ("module", Value::String(declaration.module.clone())),
            ("id", Value::String(declaration.id.clone())),
            ("python", s(action_python)),
            ("pointer", s(pointer.clone())),
            ("parameters", arr(resolve_parameters("parameters", ctx)?)),
            ("outputs", arr(resolve_parameters("outputs", ctx)?)),
            ("failures", arr(failures)),
            ("kind", s(binding_kind)),
            ("createdKeys", arr(created_keys)),
            ("changedKeys", arr(changed_keys)),
        ]));
    }
    let (search_ir, search_diagnostics) =
        search::inspect_selected_search(&document, &mut resolved_records, &logical, ctx)?;
    diagnostics.extend(search_diagnostics);
    let mut admitted_ir = obj([
        ("documentId", at(&document, "id").clone()),
        ("sourceId", s(&logical)),
        ("records", arr(resolved_records)),
        ("relations", arr(relation_ir)),
        ("actions", arr(action_ir)),
        ("search", arr(search_ir)),
    ]);
    let target_admission = admission::inspect_target_admission(
        _engine,
        &document,
        &request,
        &profile,
        &mut admitted_ir,
        ctx,
    )?;
    diagnostics.extend(target_admission.diagnostics);
    let not_expressible = target_admission.not_expressible;
    let selected_paths = target_admission.selected_paths;
    for (path, kind) in &action_semantic_obligations {
        let mut covered = selected_paths.contains(path);
        for section in ["records", "relations"] {
            if covered {
                break;
            }
            for record in array_items(at(&admitted_ir, section)).unwrap_or(&[]) {
                ctx.charge_work(
                    path.len()
                        .saturating_add(string_member(record, "pointer").map_or(0, Utf16::len))
                        .saturating_add(1),
                    Utf16::default(),
                )?;
                if string_member(record, "pointer") == Some(path) {
                    covered = true;
                    break;
                }
            }
        }
        if kind == &Utf16::from("model") && !covered {
            ctx.charge_work(
                logical.len().saturating_add(path.len()).saturating_add(1),
                Utf16::default(),
            )?;
            diagnostics.push(obj([
                ("code", s("REFERENCE")),
                ("sourceId", s(&logical)),
                ("pointer", Value::String(path.clone())),
                ("message", s("Typed access declaration refused: REFERENCE")),
            ]));
        }
    }
    if !not_expressible.is_empty() {
        diagnostics.push(add!("LOSS", "", &logical));
    }
    deduplicate_diagnostics(&mut diagnostics, ctx)?;
    fn take_array(value: &mut Value, name: &str) -> Vec<Value> {
        if let Value::Object(members) = value {
            if let Some((_, items)) = members.iter_mut().find(|(k, _)| k == &Utf16::from(name)) {
                if let Value::Array(items) = std::mem::replace(items, Value::Null) {
                    return items;
                }
            }
        }
        Vec::new()
    }
    let resolved_records = take_array(&mut admitted_ir, "records");
    let relation_ir = take_array(&mut admitted_ir, "relations");
    let action_ir = take_array(&mut admitted_ir, "actions");
    let search_ir = take_array(&mut admitted_ir, "search");
    let selected_refs = records
        .iter()
        .filter_map(|r| Some((string_member(r, "module")?, string_member(r, "element")?)))
        .collect::<BTreeSet<_>>();
    let disposition_values = collect_dispositions(
        &document,
        &logical,
        &selected_refs,
        &selected_actions,
        &relation_ir,
        &search_ir,
        &resolved_records,
        &selected_paths,
        ctx,
    )?;
    let disposition_base = disposition_values.len();
    let mut reached = BTreeSet::new();
    for path in &selected_paths {
        ctx.charge_work(1, Utf16::default())?;
        let mut parts = path.units().split(|unit| *unit == 47);
        if parts.next() != Some(&[][..]) || parts.next() != Some(Utf16::from("modules").units()) {
            continue;
        }
        let Some(mi) = parts.next() else {
            continue;
        };
        if parts.next() != Some(Utf16::from("elements").units()) {
            continue;
        }
        let Some(ei) = parts.next() else {
            continue;
        };
        if mi.is_empty()
            || ei.is_empty()
            || !mi.iter().chain(ei).all(|unit| (48..=57).contains(unit))
        {
            continue;
        }
        ctx.charge_work(mi.len().saturating_add(ei.len()), Utf16::default())?;
        reached.insert((mi.to_vec(), ei.to_vec()));
    }
    if disposition_values
        .len()
        .saturating_add(action_raw_dispositions.len())
        .saturating_add(action_semantic_obligations.len())
        > 100_000
        || reached.len() > 10_000
    {
        diagnostics.push(add!("LIMIT", "", &logical));
    }
    deduplicate_diagnostics(&mut diagnostics, ctx)?;
    sort_diagnostics(&mut diagnostics, sources, ctx)?;
    if !diagnostics.is_empty() {
        let mut dispositions = arr(disposition_values);
        apply_not_expressible(&mut dispositions, &not_expressible, ctx)?;
        // The TypeScript refusal result still explains every selected action
        // leaf that was admitted before a later semantic refusal. Retain those
        // source dispositions (with final deterministic IDs) instead of
        // dropping them on this early return.
        if let Value::Array(items) = &mut dispositions {
            for mut raw in action_raw_dispositions {
                if let Value::Object(fields) = &mut raw {
                    if let Some((_, id)) =
                        fields.iter_mut().find(|(key, _)| key == &Utf16::from("id"))
                    {
                        *id = s(format!("d{}", items.len()));
                    }
                }
                items.push(raw);
            }
        }
        let mut obligation_values = attach_column_obligations(&mut dispositions, 0, ctx)?;
        let keys = attach_key_obligations(
            &mut dispositions,
            &resolved_records,
            obligation_values.len(),
            ctx,
        )?;
        obligation_values.extend(keys);
        let defaults = attach_default_obligations(
            &mut dispositions,
            &resolved_records,
            obligation_values.len(),
            ctx,
        )?;
        obligation_values.extend(defaults);
        let mut obligations = arr(obligation_values);
        if let Value::Array(items) = &mut dispositions {
            for (path, kind) in &action_semantic_obligations {
                let oid = format!("o{}", array_items(&obligations).map_or(0, |xs| xs.len()));
                ctx.charge_work(
                    logical.len().saturating_add(path.len()).saturating_add(1),
                    Utf16::default(),
                )?;
                let did = format!("d{}", items.len());
                items.push(Value::Object(vec![(Utf16::from("id"),s(&did)),(Utf16::from("sourceId"),s(&logical)),(Utf16::from("pointer"),Value::String(path.clone())),(Utf16::from("assertion"),s("actions")),(Utf16::from("relevance"),s("selected")),(Utf16::from("fidelity"),s("exact")),(Utf16::from("checks"),arr([s("informational")])),(Utf16::from("reason"),s("inspectActions declaration result; external execution duties remain undischargeable by generation")),(Utf16::from("obligationIds"),arr([s(&oid)]))]));
                ctx.charge_work(
                    kind.len().saturating_mul(2).saturating_add(1),
                    Utf16::default(),
                )?;
                let kind = kind.to_utf8().unwrap_or_else(|_| "unknown".into());
                if let Value::Array(obls) = &mut obligations {
                    obls.push(obj([
                        ("id", s(&oid)),
                        ("owner", s("engine")),
                        (
                            "description",
                            s(format!(
                                "Selected action {kind} remains an executor obligation"
                            )),
                        ),
                        ("dispositionIds", arr([s(&did)])),
                    ]));
                }
            }
        }
        interleave_action_dispositions(
            &mut dispositions,
            array_items_mut(&mut obligations),
            disposition_base,
            &action_disposition_batches,
            ctx,
        )?;
        apply_unknown_dispositions(&mut dispositions, &diagnostics, &logical, ctx)?;
        normalize_action_unknowns(&mut dispositions, &diagnostics, ctx)?;
        sort_dispositions(&mut dispositions, ctx)?;
        return Ok(obj([
            ("contract", s("umf-access-generate/0.1")),
            ("abi", s("umf-python-types/0.1")),
            (
                "runtimeAbi",
                obj([
                    ("distribution", s(&runtime_distribution)),
                    ("version", s(&runtime_version)),
                    ("abi", s("umf-access-runtime/0.1")),
                ]),
            ),
            ("outcome", s("refused")),
            ("inputDigest", s(&input_digest)),
            ("files", arr([])),
            ("symbols", arr([])),
            ("dispositions", dispositions),
            ("diagnostics", arr(diagnostics)),
            ("obligations", obligations),
        ]));
    }
    let _ = empty_ir;
    charge_clone_tree(at(&document, "id"), ctx)?;
    ctx.charge_work(logical.len().saturating_add(1), Utf16::default())?;
    let mut ir_fields = vec![
        (
            "documentId",
            member(&document, "id").cloned().unwrap_or(Value::Null),
        ),
        ("sourceId", s(&logical)),
        ("records", arr(resolved_records)),
    ];
    ir_fields.extend([
        ("relations", arr(relation_ir)),
        ("actions", arr(action_ir)),
        ("search", arr(search_ir)),
    ]);
    let ir = obj(ir_fields);
    let mut dispositions = arr(disposition_values);
    apply_not_expressible(&mut dispositions, &not_expressible, ctx)?;
    if let Value::Array(items) = &mut dispositions {
        for mut raw in action_raw_dispositions {
            if let Value::Object(fields) = &mut raw {
                if let Some((_, id)) = fields.iter_mut().find(|(k, _)| k == &Utf16::from("id")) {
                    *id = s(format!("d{}", items.len()));
                }
            }
            items.push(raw);
        }
    }
    let source_digest = crate::canonical::sha256_source_text(&source_text, ctx)?;
    let source_digest = source_digest
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    ctx.charge_work(runtime_version.len().saturating_add(1), Utf16::default())?;
    let runtime = runtime_version.clone();
    let emitted = emitter::emit(&ir, &request, &input_digest, &source_digest, &runtime, ctx)?;
    #[cfg(test)]
    PRIVATE_ACCESS_CAPTURE.with(|slot| {
        *slot.borrow_mut() = Some((ir.clone(), emitted.files.clone(), emitted.symbols.clone()));
    });
    let mut generated = emitted
        .files
        .into_iter()
        .map(|(path, text)| {
            let path = format!("{package}/{path}");
            let digest = crate::canonical::sha256_source_text(&text, ctx)?;
            let digest = digest
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>();
            Ok((path, text, digest))
        })
        .collect::<Result<Vec<_>, EngineError>>()?;
    let source_bytes = crate::canonical::canonical_json_admitted(&at(&request, "sources"), ctx)?;
    ctx.charge_work(
        source_bytes.len().saturating_mul(2).saturating_add(1),
        Utf16::default(),
    )?;
    let source_text = Utf16::from(
        String::from_utf8(source_bytes)
            .map_err(|_| EngineError::new("INPUT", Utf16::default(), "Invalid source archive"))?
            + "\n",
    );
    let source_hash = crate::canonical::sha256_source_text(&source_text, ctx)?;
    generated.push((
        format!("{package}/_umf/sources.json"),
        source_text,
        source_hash.iter().map(|b| format!("{b:02x}")).collect(),
    ));
    generated.sort_by(|a, b| a.0.cmp(&b.0));
    let runtime_abi = obj([
        ("distribution", s(&runtime_distribution)),
        ("version", s(&runtime_version)),
        ("abi", s("umf-access-runtime/0.1")),
    ]);
    let symbols = arr(emitted.symbols);
    let records_ir = array_items(at(&ir, "records")).unwrap_or(&[]);
    let mut obligations = attach_column_obligations(&mut dispositions, 0, ctx)?;
    let keys = attach_key_obligations(&mut dispositions, records_ir, obligations.len(), ctx)?;
    obligations.extend(keys);
    let defaults =
        attach_default_obligations(&mut dispositions, records_ir, obligations.len(), ctx)?;
    obligations.extend(defaults);
    if let Value::Array(items) = &mut dispositions {
        for (path, kind) in action_semantic_obligations {
            if diagnostic_unknown(&diagnostics, &path, true, ctx)? {
                continue;
            }
            ctx.charge_work(
                logical
                    .len()
                    .saturating_add(kind.len().saturating_mul(2))
                    .saturating_add(1),
                Utf16::default(),
            )?;
            let did = format!("d{}", items.len());
            let oid = format!("o{}", obligations.len());
            items.push(Value::Object(vec![(Utf16::from("id"),s(&did)),(Utf16::from("sourceId"),s(&logical)),(Utf16::from("pointer"),Value::String(path)),(Utf16::from("assertion"),s("actions")),(Utf16::from("relevance"),s("selected")),(Utf16::from("fidelity"),s("exact")),(Utf16::from("checks"),arr([s("informational")])),(Utf16::from("reason"),s("inspectActions declaration result; external execution duties remain undischargeable by generation")),(Utf16::from("obligationIds"),arr([s(&oid)]))]));
            let kind = kind.to_utf8().unwrap_or_else(|_| "unknown".into());
            obligations.push(obj([
                ("id", s(&oid)),
                ("owner", s("engine")),
                (
                    "description",
                    s(format!(
                        "Selected action {kind} remains an executor obligation"
                    )),
                ),
                ("dispositionIds", arr([s(did)])),
            ]));
        }
    }
    interleave_action_dispositions(
        &mut dispositions,
        &mut obligations,
        disposition_base,
        &action_disposition_batches,
        ctx,
    )?;
    apply_unknown_dispositions(&mut dispositions, &diagnostics, &logical, ctx)?;
    normalize_action_unknowns(&mut dispositions, &diagnostics, ctx)?;
    sort_dispositions(&mut dispositions, ctx)?;
    let obligations = arr(obligations);
    // Keep the TypeScript bundle ceilings at their original operation phase.
    // The manifest is intentionally measured with the generated files and is
    // not fed back through the ordinary per-Value four-megabyte admission cap.
    let mut source_bytes = 0usize;
    for source in crate::value::array_items(member(&request, "sources").unwrap_or(&Value::Null))
        .unwrap_or(&[])
    {
        if let Some(text) = string_member(source, "text") {
            ctx.charge_work(text.len(), Utf16::from("/sources"))?;
            source_bytes = source_bytes
                .checked_add(text_encoder_bytes(text))
                .ok_or_else(|| {
                    EngineError::new(
                        "LIMIT",
                        Utf16::default(),
                        "Aggregate package resource bound exceeded",
                    )
                })?;
        }
    }
    if generated.len() + 1 > 1_000 || source_bytes > 33_554_432 {
        for value in [&runtime_abi, &dispositions, &obligations] {
            charge_clone_tree(value, ctx)?;
        }
        return Ok(obj([
            ("contract", s("umf-access-generate/0.1")),
            ("abi", s("umf-python-types/0.1")),
            ("runtimeAbi", runtime_abi.clone()),
            ("outcome", s("refused")),
            ("inputDigest", s(&input_digest)),
            ("files", arr([])),
            ("symbols", arr([])),
            ("dispositions", dispositions.clone()),
            (
                "diagnostics",
                arr([obj([
                    ("code", s("LIMIT")),
                    ("sourceId", s(&logical)),
                    ("pointer", s("")),
                    ("message", s("Aggregate package resource bound exceeded")),
                ])]),
            ),
            ("obligations", obligations.clone()),
        ]));
    }
    let mut inventory_items = Vec::new();
    for (path, _, hash) in &generated {
        ctx.charge_work(
            path.len().saturating_add(hash.len()).saturating_add(2),
            Utf16::from("/files"),
        )?;
        inventory_items.push(obj([("path", s(path)), ("sha256", s(hash))]));
    }
    let inventory = arr(inventory_items);
    for value in [
        &runtime_abi,
        &profile,
        &symbols,
        &dispositions,
        &obligations,
    ] {
        charge_clone_tree(value, ctx)?;
    }
    let manifest = obj([
        ("contract", s("umf-access-generate/0.1")),
        ("abi", s("umf-python-types/0.1")),
        ("runtimeAbi", runtime_abi.clone()),
        ("inputDigest", s(&input_digest)),
        ("profile", profile.clone()),
        ("symbols", symbols.clone()),
        ("dispositions", dispositions.clone()),
        ("obligations", obligations.clone()),
        ("inventory", inventory),
    ]);
    let manifest_bytes = crate::canonical::canonical_json_admitted(&manifest, ctx)?;
    ctx.charge_work(
        manifest_bytes.len().saturating_mul(2).saturating_add(1),
        Utf16::default(),
    )?;
    let manifest_text = Utf16::from(
        String::from_utf8(manifest_bytes)
            .map_err(|_| EngineError::new("INPUT", Utf16::default(), "Invalid manifest"))?
            + "\n",
    );
    let manifest_hash = crate::canonical::sha256_source_text(&manifest_text, ctx)?;
    generated.push((
        format!("{package}/_umf/manifest.json"),
        manifest_text,
        manifest_hash.iter().map(|b| format!("{b:02x}")).collect(),
    ));
    generated.sort_by(|a, b| a.0.cmp(&b.0));
    let bundle_bytes = generated.iter().try_fold(0usize, |total, (_, text, _)| {
        ctx.charge_work(text.len().saturating_add(1), Utf16::default())?;
        let n = text_encoder_bytes(text);
        total.checked_add(n).ok_or_else(|| {
            EngineError::new(
                "LIMIT",
                Utf16::default(),
                "Aggregate package resource bound exceeded",
            )
        })
    })?;
    if generated.len() > 1_000 || bundle_bytes > 33_554_432 {
        for value in [&runtime_abi, &dispositions, &obligations] {
            charge_clone_tree(value, ctx)?;
        }
        return Ok(obj([
            ("contract", s("umf-access-generate/0.1")),
            ("abi", s("umf-python-types/0.1")),
            ("runtimeAbi", runtime_abi.clone()),
            ("outcome", s("refused")),
            ("inputDigest", s(&input_digest)),
            ("files", arr([])),
            ("symbols", arr([])),
            ("dispositions", dispositions.clone()),
            (
                "diagnostics",
                arr([obj([
                    ("code", s("LIMIT")),
                    ("sourceId", s(&logical)),
                    ("pointer", s("")),
                    ("message", s("Aggregate package resource bound exceeded")),
                ])]),
            ),
            ("obligations", obligations.clone()),
        ]));
    }
    let mut files = Vec::new();
    for (path, text, hash) in generated {
        ctx.charge_work(
            path.len()
                .saturating_add(text.len())
                .saturating_add(hash.len())
                .saturating_add(3),
            Utf16::from("/files"),
        )?;
        files.push(obj([
            ("path", s(path)),
            ("text", Value::String(text)),
            ("sha256", s(hash)),
        ]));
    }
    Ok(obj([
        ("contract", s("umf-access-generate/0.1")),
        ("abi", s("umf-python-types/0.1")),
        ("runtimeAbi", runtime_abi),
        ("outcome", s("candidate")),
        ("inputDigest", s(&input_digest)),
        ("files", arr(files)),
        ("symbols", symbols),
        ("dispositions", dispositions),
        ("diagnostics", arr([])),
        ("obligations", obligations),
    ]))
}

impl CodegenEngine<'_> {
    /// Compare two generated access results by their public symbol inventory.
    /// The stage-one generator owns semantic signature inspection; this first
    /// layer preserves exact input symbols and reports additions/removals and
    /// bundle-digest changes without claiming data compatibility.
    pub fn diff_access_packages(
        &self,
        before: &Value,
        after: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        diff(self, before, after, ctx)
    }
}

fn err() -> EngineError {
    EngineError::new(
        "ACCESS_DIFF_INPUT",
        Utf16::default(),
        "Access diff requires two candidate packages",
    )
}

#[derive(Clone)]
struct DiffSignature {
    fields: BTreeMap<String, (String, bool, bool)>,
    identity: String,
}

struct DiffPackage<'a> {
    result: &'a Value,
    documents: Vec<(Utf16, Value)>,
    records: BTreeMap<(Utf16, String), Option<Value>>,
}
impl<'a> DiffPackage<'a> {
    fn new(
        engine: &CodegenEngine<'_>,
        result: &'a Value,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        if get_str(result, "outcome").as_deref() != Some("candidate") {
            return Err(err());
        }
        let archive_suffix = Utf16::from("/_umf/sources.json");
        let mut archive = None;
        for file in array_items(at(result, "files")).unwrap_or(&[]) {
            ctx.charge_work(1, Utf16::from("/files"))?;
            if let Some(path) = string_member(file, "path") {
                ctx.charge_work(path.len(), Utf16::from("/files"))?;
                if path.len() >= archive_suffix.len()
                    && path.units()[path.len() - archive_suffix.len()..] == *archive_suffix.units()
                {
                    archive = Some(file);
                    break;
                }
            }
        }
        let archive = archive.ok_or_else(err)?;
        let source = string_member(archive, "text").ok_or_else(err)?;
        let sources = ctx
            .with_aggregate_text_limit(32 * 1024 * 1024, |ctx| {
                crate::value::read_source_value(source, umf_core::serialization::Format::Json, ctx)
            })
            .map_err(diff_input_error)?;
        let mut documents: Vec<(Utf16, Value)> = Vec::new();
        for source in array_items(&sources).ok_or_else(err)? {
            ctx.charge_work(1, Utf16::from("/files"))?;
            let id = string_member(source, "id").ok_or_else(err)?;
            ctx.charge_work(id.len().saturating_add(1), Utf16::from("/files"))?;
            let id = id.clone();
            let text = string_member(source, "text").ok_or_else(err)?;
            let format = match get_str(source, "format").as_deref() {
                Some("json") => umf_core::serialization::Format::Json,
                Some("yaml") => umf_core::serialization::Format::Yaml,
                _ => return Err(err()),
            };
            let document = engine
                .read_document(text, format, ctx)
                .map_err(diff_input_error)?;
            // JS Map construction retains the last document for duplicate IDs.
            let mut found = None;
            for (index, (name, _)) in documents.iter().enumerate() {
                ctx.charge_work(name.len().saturating_add(1), Utf16::from("/files"))?;
                if name == &id {
                    found = Some(index);
                    break;
                }
            }
            if let Some(index) = found {
                documents[index].1 = document;
            } else {
                ctx.charge_work(id.len().saturating_add(1), Utf16::from("/files"))?;
                documents.push((id, document));
            }
        }
        Ok(Self {
            result,
            documents,
            records: BTreeMap::new(),
        })
    }
    fn record(
        &mut self,
        engine: &CodegenEngine<'_>,
        symbol: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Option<Value>, EngineError> {
        let Some(id) = string_member(symbol, "sourceId") else {
            return Ok(None);
        };
        let pointer = metered_string(symbol, "pointer", ctx)?.unwrap_or_default();
        ctx.charge_work(
            id.len().saturating_add(pointer.len()).saturating_add(1),
            Utf16::from("/symbols"),
        )?;
        let key = (id.clone(), pointer.clone());
        if let Some(record) = self.records.get(&key) {
            return record
                .as_ref()
                .map(|v| crate::value::admit_json(v, ctx))
                .transpose();
        }
        let mut found = None;
        for (name, document) in &self.documents {
            ctx.charge_work(
                name.len().saturating_add(id.len()).saturating_add(1),
                Utf16::from("/symbols"),
            )?;
            if name == id {
                found = Some(document);
                break;
            }
        }
        let Some(document) = found else {
            return Ok(None);
        };
        let Some((module, element)) = diff_locate(document, &pointer) else {
            return Ok(None);
        };
        if metered_string(element, "kind", ctx)?.as_deref() != Some("record") {
            return Ok(None);
        }
        for value in [at(module, "id"), at(element, "id")] {
            charge_clone_tree(value, ctx)?;
        }
        let reference = obj([
            ("module", at(module, "id").clone()),
            ("element", at(element, "id").clone()),
        ]);
        let mut bindings = Vec::new();
        for (name, document) in &self.documents {
            ctx.charge_work(
                name.len().saturating_add(id.len()).saturating_add(1),
                Utf16::from("/symbols"),
            )?;
            if name != id {
                let binding_id = name.to_utf8().unwrap_or_default();
                ctx.charge_work(binding_id.len().saturating_add(1), Utf16::from("/symbols"))?;
                bindings.push((binding_id, crate::value::admit_json(document, ctx)?));
            }
        }
        let resolved = inspection::inspect_access_views(
            engine,
            document,
            &[reference],
            &bindings,
            &id.to_utf8().unwrap_or_default(),
            ctx,
        )?
        .records
        .into_iter()
        .next();
        if let Some(value) = resolved.as_ref() {
            charge_clone_tree(value, ctx)?;
        }
        let copy = resolved
            .as_ref()
            .map(|v| crate::value::admit_json(v, ctx))
            .transpose()?;
        ctx.charge_work(
            id.len().saturating_add(pointer.len()).saturating_add(1),
            Utf16::from("/symbols"),
        )?;
        self.records.insert(key, resolved);
        Ok(copy)
    }
    fn signature(
        &mut self,
        engine: &CodegenEngine<'_>,
        symbol: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Option<DiffSignature>, EngineError> {
        let Some(id) = string_member(symbol, "sourceId") else {
            return Ok(None);
        };
        let pointer = metered_string(symbol, "pointer", ctx)?.unwrap_or_default();
        let role = metered_string(symbol, "role", ctx)?.unwrap_or_default();
        let mut found = None;
        for (name, document) in &self.documents {
            ctx.charge_work(
                name.len().saturating_add(id.len()).saturating_add(1),
                Utf16::from("/symbols"),
            )?;
            if name == id {
                found = Some(document);
                break;
            }
        }
        let Some(document) = found else {
            return Ok(None);
        };
        let Some((_, element)) = diff_locate(document, &pointer) else {
            return Ok(None);
        };
        let is_field = metered_string(element, "kind", ctx)?.as_deref() == Some("field");
        let owner = if is_field {
            let name = metered_string(symbol, "symbol", ctx)?.unwrap_or_default();
            let owner = name
                .split(".c.")
                .next()
                .unwrap_or("")
                .split('.')
                .next()
                .unwrap_or("");
            let mut found = None;
            for candidate in array_items(at(self.result, "symbols")).unwrap_or(&[]) {
                ctx.charge_work(1, Utf16::from("/symbols"))?;
                let candidate_name = string_member(candidate, "symbol");
                let role = string_member(candidate, "role");
                ctx.charge_work(
                    candidate_name
                        .map_or(0, Utf16::len)
                        .saturating_add(role.map_or(0, Utf16::len))
                        .saturating_add(owner.len())
                        .saturating_add(1),
                    Utf16::from("/symbols"),
                )?;
                if candidate_name.and_then(|v| v.to_utf8().ok()).as_deref() == Some(owner)
                    && matches!(
                        role.and_then(|v| v.to_utf8().ok()).as_deref(),
                        Some("row" | "create" | "patch" | "update" | "key" | "projection")
                    )
                {
                    charge_clone_tree(candidate, ctx)?;
                    found = Some(candidate.clone());
                    break;
                }
            }
            found
        } else {
            Some(crate::value::admit_json(symbol, ctx)?)
        };
        let Some(owner) = owner else { return Ok(None) };
        let Some(record) = self.record(engine, &owner, ctx)? else {
            return Ok(None);
        };
        let all_fields = array_items(at(&record, "fields")).unwrap_or(&[]);
        if is_field {
            let mut found = None;
            for candidate in all_fields {
                ctx.charge_work(1, Utf16::from("/symbols"))?;
                let candidate_pointer = string_member(candidate, "pointer");
                ctx.charge_work(
                    candidate_pointer
                        .map_or(0, Utf16::len)
                        .saturating_add(pointer.len())
                        .saturating_add(1),
                    Utf16::from("/symbols"),
                )?;
                if candidate_pointer.and_then(|v| v.to_utf8().ok()).as_deref()
                    == Some(pointer.as_str())
                {
                    found = Some(candidate);
                    break;
                }
            }
            let Some(field) = found else { return Ok(None) };
            let (missing, null) = diff_presence(field, &role, true);
            return Ok(Some(DiffSignature {
                fields: BTreeMap::from([(
                    "value".into(),
                    (diff_shape(field, all_fields, ctx)?, missing, null),
                )]),
                identity: String::new(),
            }));
        }
        if !matches!(
            role.as_str(),
            "row" | "create" | "patch" | "update" | "fields" | "key" | "projection" | "codec"
        ) {
            return Ok(None);
        }
        let mut fields = Vec::new();
        for field in all_fields {
            ctx.charge_work(1, Utf16::from("/symbols"))?;
            if member(field, "owned") == Some(&Value::Bool(false)) {
                continue;
            }
            if role == "create" && member(field, "generated") == Some(&Value::Bool(true)) {
                continue;
            }
            if (role == "patch" || role == "update")
                && (member(field, "generated") == Some(&Value::Bool(true))
                    || member(field, "mutable") != Some(&Value::Bool(true)))
            {
                continue;
            }
            ctx.charge_work(1, Utf16::from("/symbols"))?;
            fields.push(field);
        }
        let keys = array_items(at(&record, "keys")).unwrap_or(&[]);
        let mut record_name = None;
        for candidate in array_items(at(self.result, "symbols")).unwrap_or(&[]) {
            ctx.charge_work(1, Utf16::from("/symbols"))?;
            for key in ["sourceId", "pointer", "role", "symbol"] {
                ctx.charge_work(
                    string_member(candidate, key)
                        .map_or(0, Utf16::len)
                        .saturating_add(1),
                    Utf16::from("/symbols"),
                )?;
            }
            if string_member(candidate, "sourceId") == Some(id)
                && string_member(candidate, "pointer")
                    .and_then(|v| v.to_utf8().ok())
                    .as_deref()
                    == Some(pointer.as_str())
                && string_member(candidate, "role")
                    .and_then(|v| v.to_utf8().ok())
                    .as_deref()
                    == Some("row")
            {
                record_name = string_member(candidate, "symbol").and_then(|v| v.to_utf8().ok());
                break;
            }
        }
        let selected_key = if role == "key" {
            if let Some(record_name) = record_name {
                let mut found = None;
                for (i, key) in keys.iter().enumerate() {
                    let key_id = metered_string(key, "id", ctx)?.unwrap_or_default();
                    ctx.charge_work(
                        key_id
                            .len()
                            .saturating_mul(8)
                            .saturating_add(record_name.len())
                            .saturating_add(4),
                        Utf16::default(),
                    )?;
                    let suffix = if i == 0 {
                        String::new()
                    } else {
                        diff_class_name(&key_id)
                    };
                    if metered_string(symbol, "symbol", ctx)?.as_deref()
                        == Some(format!("{record_name}{suffix}Key").as_str())
                    {
                        found = Some(key);
                        break;
                    }
                }
                found
            } else if keys.len() == 1 {
                keys.first()
            } else {
                None
            }
        } else {
            None
        };
        if role == "key" {
            let mut selected_fields = Vec::new();
            for reference in array_items(
                selected_key
                    .map(|key| at(key, "fields"))
                    .unwrap_or(&Value::Null),
            )
            .unwrap_or(&[])
            {
                for field in all_fields {
                    ctx.charge_work(1, Utf16::from("/symbols"))?;
                    if diff_ref_equal(at(field, "ref"), reference) {
                        ctx.charge_work(1, Utf16::from("/symbols"))?;
                        selected_fields.push(field);
                    }
                }
            }
            fields = selected_fields;
        }
        if role == "projection"
            || role == "codec"
                && metered_string(symbol, "symbol", ctx)?.is_some_and(|s| s.starts_with("decode_"))
        {
            let name = metered_string(symbol, "symbol", ctx)?.unwrap_or_default();
            let projection = if role == "codec" {
                name.strip_prefix("decode_").unwrap_or(&name)
            } else {
                &name
            };
            ctx.charge_work(projection.len().saturating_add(1), Utf16::default())?;
            let prefix = projection.to_owned() + ".";
            let mut attrs = Vec::new();
            for candidate in array_items(at(self.result, "symbols")).unwrap_or(&[]) {
                ctx.charge_work(1, Utf16::from("/symbols"))?;
                let role = string_member(candidate, "role");
                let candidate_name = string_member(candidate, "symbol");
                ctx.charge_work(
                    role.map_or(0, Utf16::len)
                        .saturating_add(candidate_name.map_or(0, Utf16::len))
                        .saturating_add(prefix.len())
                        .saturating_add(1),
                    Utf16::from("/symbols"),
                )?;
                if role.and_then(|v| v.to_utf8().ok()).as_deref() == Some("projection")
                    && candidate_name
                        .and_then(|v| v.to_utf8().ok())
                        .is_some_and(|name| name.starts_with(&prefix))
                {
                    attrs.push(candidate);
                }
            }
            if role == "projection" && attrs.is_empty() {
                return Ok(None);
            }
            if !attrs.is_empty() {
                let mut selected_fields = Vec::new();
                for field in fields {
                    let mut keep = false;
                    for attr in &attrs {
                        ctx.charge_work(1, Utf16::from("/symbols"))?;
                        let pointer = member(field, "pointer");
                        ctx.charge_work(
                            pointer
                                .and_then(|v| {
                                    if let Value::String(s) = v {
                                        Some(s.len())
                                    } else {
                                        None
                                    }
                                })
                                .unwrap_or(0)
                                .saturating_add(
                                    member(attr, "pointer")
                                        .and_then(|v| {
                                            if let Value::String(s) = v {
                                                Some(s.len())
                                            } else {
                                                None
                                            }
                                        })
                                        .unwrap_or(0),
                                )
                                .saturating_add(1),
                            Utf16::from("/symbols"),
                        )?;
                        if member(attr, "pointer") == pointer {
                            keep = true;
                            break;
                        }
                    }
                    if keep {
                        selected_fields.push(field);
                    }
                }
                fields = selected_fields;
            }
        }
        let mut signatures = BTreeMap::new();
        for field in &fields {
            ctx.charge_work(1, Utf16::from("/symbols"))?;
            let public = diff_public_name(self.result, field, ctx)?;
            ctx.charge_work(public.len().saturating_add(1), Utf16::from("/symbols"))?;
            let (missing, null) = diff_presence(field, &role, false);
            signatures.insert(public, (diff_shape(field, all_fields, ctx)?, missing, null));
        }
        let identity = if role == "key" {
            let mut document = None;
            for (name, value) in &self.documents {
                ctx.charge_work(
                    name.len().saturating_add(id.len()).saturating_add(1),
                    Utf16::default(),
                )?;
                if name == id {
                    document = Some(value);
                    break;
                }
            }
            let document = document.unwrap();
            for value in [
                at(document, "id"),
                at(document, "umf"),
                at(&record, "ref"),
                selected_key.unwrap_or(&Value::Null),
            ] {
                charge_clone_tree(value, ctx)?;
            }
            stable_value(
                &obj([
                    ("document", at(document, "id").clone()),
                    ("core", at(document, "umf").clone()),
                    ("ref", at(&record, "ref").clone()),
                    ("key", selected_key.cloned().unwrap_or(Value::Null)),
                ]),
                ctx,
            )?
        } else if role == "codec" {
            for field in &fields {
                charge_clone_tree(at(field, "ref"), ctx)?;
            }
            stable_value(&arr(fields.iter().map(|f| at(f, "ref").clone())), ctx)?
        } else {
            String::new()
        };
        Ok(Some(DiffSignature {
            fields: signatures,
            identity,
        }))
    }
}
fn diff_input_error(error: EngineError) -> EngineError {
    if error.is_control_failure() {
        error
    } else {
        err()
    }
}
fn diff_locate<'a>(document: &'a Value, pointer: &str) -> Option<(&'a Value, &'a Value)> {
    let parts = pointer.split('/').collect::<Vec<_>>();
    if parts.get(1) != Some(&"modules") || parts.get(3) != Some(&"elements") {
        return None;
    }
    let mi = parts.get(2)?.parse::<usize>().ok()?;
    let ei = parts.get(4)?.parse::<usize>().ok()?;
    let module = array_items(member(document, "modules")?)?.get(mi)?;
    let element = array_items(member(module, "elements")?)?.get(ei)?;
    Some((module, element))
}
fn diff_ref_equal(a: &Value, b: &Value) -> bool {
    member(a, "module") == member(b, "module") && member(a, "element") == member(b, "element")
}
fn diff_shape<'a>(
    field: &'a Value,
    fields: &'a [Value],
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let mut chain = Vec::new();
    let mut active = BTreeSet::new();
    let mut current = field;
    let mut item = None;
    loop {
        ctx.charge_work(1, Utf16::from("/symbols"))?;
        ctx.charge_work(
            string_member(current, "pointer")
                .map_or(0, Utf16::len)
                .saturating_add(1),
            Utf16::default(),
        )?;
        let pointer = string_member(current, "pointer")
            .cloned()
            .unwrap_or_default();
        if !active.insert(pointer) {
            item = Some(String::from("{\"recursive\":true}"));
            break;
        }
        chain.push(current);
        let mut next = None;
        if let Some(reference) = member(current, "item") {
            for candidate in fields {
                ctx.charge_work(1, Utf16::from("/symbols"))?;
                if diff_ref_equal(at(candidate, "ref"), reference) {
                    next = Some(candidate);
                    break;
                }
            }
        }
        let Some(child) = next else {
            break;
        };
        current = child;
    }
    while let Some(field) = chain.pop() {
        let mut entries = Vec::new();
        for (name, value) in [
            (
                "allowedValues",
                at(at(field, "properties"), "allowedValues"),
            ),
            ("cardinality", at(field, "cardinality")),
            ("facets", at(field, "facets")),
            ("scalar", at(field, "scalarType")),
            ("temporal", at(field, "temporal")),
        ] {
            entries.push((name, stable_value(value, ctx)?));
        }
        if let Some(value) = item.take() {
            entries.push(("item", value));
        }
        entries.sort_by_key(|(name, _)| *name);
        let mut text = String::from("{");
        for (index, (name, value)) in entries.into_iter().enumerate() {
            ctx.charge_work(1, Utf16::from("/symbols"))?;
            if index > 0 {
                text.push(',');
            }
            crate::generation::python::append_text(&mut text, &format!("\"{name}\":"), ctx)?;
            crate::generation::python::append_text(&mut text, &value, ctx)?;
        }
        text.push('}');
        item = Some(text);
    }
    Ok(item.unwrap_or_else(|| "null".into()))
}
fn diff_presence(field: &Value, role: &str, is_field: bool) -> (bool, bool) {
    if role == "key" {
        return (false, false);
    }
    let create = matches!(role, "create" | "patch" | "update");
    let presence = at(field, if create { "create" } else { "row" });
    let missing = if matches!(role, "patch" | "update") {
        true
    } else {
        member(presence, "missing") == Some(&Value::Bool(true))
    };
    let _ = is_field;
    (
        missing,
        member(presence, "null") == Some(&Value::Bool(true)),
    )
}
fn diff_public_name(
    result: &Value,
    field: &Value,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let symbols = array_items(at(result, "symbols")).unwrap_or(&[]);
    for role in ["fields", "key"] {
        for symbol in symbols {
            ctx.charge_work(1, Utf16::from("/symbols"))?;
            let pointer = member(symbol, "pointer");
            let symbol_role = string_member(symbol, "role");
            let name = string_member(symbol, "symbol");
            ctx.charge_work(
                name.map_or(0, Utf16::len)
                    .saturating_add(symbol_role.map_or(0, Utf16::len))
                    .saturating_add(1),
                Utf16::from("/symbols"),
            )?;
            if pointer == member(field, "pointer")
                && symbol_role.and_then(|v| v.to_utf8().ok()).as_deref() == Some(role)
            {
                if let Some(name) = name.and_then(|v| v.to_utf8().ok()) {
                    if role == "fields" && name.contains(".c.") {
                        return Ok(name.split(".c.").nth(1).unwrap_or("").into());
                    }
                    if role == "key" && name.contains('.') {
                        return Ok(name.split('.').skip(1).collect::<Vec<_>>().join("."));
                    }
                }
            }
        }
    }
    let python = string_member(field, "python");
    ctx.charge_work(
        python.map_or(0, Utf16::len).saturating_add(1),
        Utf16::from("/symbols"),
    )?;
    Ok(python.and_then(|v| v.to_utf8().ok()).unwrap_or_default())
}
fn diff_class_name(value: &str) -> String {
    // Same two acronym/camel boundaries as the TypeScript symbol matcher.
    let chars = value
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect::<Vec<_>>();
    let mut normalized = String::new();
    for (i, c) in chars.iter().enumerate() {
        if i > 0
            && c.is_ascii_uppercase()
            && (chars[i - 1].is_ascii_lowercase()
                || chars[i - 1].is_ascii_digit()
                || chars[i - 1].is_ascii_uppercase()
                    && chars.get(i + 1).is_some_and(|c| c.is_ascii_lowercase()))
        {
            normalized.push('_');
        }
        normalized.push(*c);
    }
    normalized
        .split('_')
        .map(|p| {
            let mut cs = p.chars();
            cs.next()
                .map(|c| c.to_ascii_uppercase().to_string() + cs.as_str())
                .unwrap_or_default()
        })
        .collect()
}
fn stable_value(value: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    use crate::generation::python::{append_text, string_literal};
    ctx.charge_work(1, Utf16::from("/symbols"))?;
    match value {
        Value::Null => Ok("null".into()),
        Value::Bool(b) => Ok(b.to_string()),
        Value::Number(n) => Ok(umf_core::ecma_number_to_string(*n)),
        Value::String(s) => string_literal(s, ctx),
        Value::Array(items) => {
            ctx.charge_work(items.len().saturating_add(2), Utf16::from("/symbols"))?;
            let mut out = String::from("[");
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                append_text(&mut out, &stable_value(item, ctx)?, ctx)?;
            }
            out.push(']');
            Ok(out)
        }
        Value::Object(items) => {
            let levels = 1 + items.len().checked_ilog2().unwrap_or(0) as usize;
            for (key, _) in items {
                ctx.charge_work(
                    key.len().saturating_add(1).saturating_mul(levels),
                    Utf16::from("/symbols"),
                )?;
            }
            let mut sorted = items.iter().collect::<Vec<_>>();
            sorted.sort_by(|a, b| a.0.cmp(&b.0));
            let mut out = String::from("{");
            for (i, (key, item)) in sorted.into_iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                append_text(&mut out, &string_literal(key, ctx)?, ctx)?;
                out.push(':');
                append_text(&mut out, &stable_value(item, ctx)?, ctx)?;
            }
            out.push('}');
            Ok(out)
        }
    }
}

fn diff(
    engine: &CodegenEngine<'_>,
    before: &Value,
    after: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    // Admit both complete public values before inspecting any nested member.
    // This catches duplicate object keys/non-finite values and charges copies
    // before the maps below allocate their own indexes.
    let before = crate::value::admit_json(before, ctx)?;
    let after = crate::value::admit_json(after, ctx)?;
    // Signature normalization recursively serializes retained raw metadata.
    // Precharge a conservative escaped-text bound for both full results before
    // any stable strings, ordered maps, or compatibility comparison vectors
    // are allocated.
    let mut before_package = DiffPackage::new(engine, &before, ctx)?;
    let mut after_package = DiffPackage::new(engine, &after, ctx)?;
    // The TS comparator uses a stable structural encoding. `stable_value`
    // retains UTF-16 code units (including lone surrogates) and sorts keys by
    // the same code-unit order, so no UTF-8 round-trip can collapse meaning.
    fn file_hash<'a>(
        v: &'a Value,
        path: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Option<&'a Utf16>, EngineError> {
        let target = string_member(path, "path");
        for file in array_items(member(v, "files").unwrap_or(&Value::Null)).unwrap_or(&[]) {
            ctx.charge_work(1, Utf16::from("/files"))?;
            let candidate = string_member(file, "path");
            ctx.charge_work(
                candidate
                    .map_or(0, Utf16::len)
                    .saturating_add(target.map_or(0, Utf16::len))
                    .saturating_add(1),
                Utf16::from("/files"),
            )?;
            if candidate == target {
                return Ok(string_member(file, "sha256"));
            }
        }
        Ok(None)
    }
    let mut symbols = |result: &Value| -> Result<BTreeMap<(Utf16, Utf16), Value>, EngineError> {
        if string_member(result, "outcome")
            .and_then(|s| s.to_utf8().ok())
            .as_deref()
            != Some("candidate")
        {
            return Err(err());
        }
        let items = array_items(member(result, "symbols").ok_or_else(err)?).ok_or_else(err)?;
        let mut mapped = BTreeMap::new();
        for (index, symbol) in items.iter().enumerate() {
            ctx.charge_work(1, Utf16::from(format!("/symbols/{index}")))?;
            let role = string_member(symbol, "role").ok_or_else(err)?;
            let name = string_member(symbol, "symbol").ok_or_else(err)?;
            ctx.charge_work(
                role.len().saturating_add(name.len()).saturating_add(1),
                Utf16::from(format!("/symbols/{index}")),
            )?;
            let copied = crate::value::admit_json(symbol, ctx)?;
            mapped.insert((role.clone(), name.clone()), copied);
        }
        Ok(mapped)
    };
    let previous = symbols(&before)?;
    let current = symbols(&after)?;
    let mut keys = std::collections::BTreeSet::new();
    for (role, name) in previous.keys().chain(current.keys()) {
        ctx.charge_work(
            role.len().saturating_add(name.len()).saturating_add(1),
            Utf16::from("/symbols"),
        )?;
        keys.insert((role.clone(), name.clone()));
    }
    ctx.charge_work(
        keys.len().saturating_mul(3).saturating_add(1),
        Utf16::from("/symbols"),
    )?;
    let mut changes = Vec::with_capacity(keys.len());
    for (role, name) in keys {
        ctx.charge_work(1, Utf16::default())?;
        ctx.charge_work(
            role.len().saturating_add(name.len()).saturating_add(2),
            Utf16::from("/symbols"),
        )?;
        let a = previous.get(&(role.clone(), name.clone()));
        let b = current.get(&(role.clone(), name.clone()));
        let old_signature = if let (Some(x), Some(_)) = (a, b) {
            before_package.signature(engine, x, ctx)?
        } else {
            None
        };
        let new_signature = if let (Some(_), Some(y)) = (a, b) {
            after_package.signature(engine, y, ctx)?
        } else {
            None
        };
        let same = if let (Some(x), Some(y)) = (&old_signature, &new_signature) {
            x.identity == y.identity && x.fields == y.fields
        } else if let (Some(x), Some(y)) = (a, b) {
            file_hash(&before, x, ctx)? == file_hash(&after, y, ctx)?
        } else {
            false
        };
        let mut compatible = name == Utf16::from("BUNDLE_INPUT_DIGEST") || same;
        if let (Some(old), Some(new)) = (&old_signature, &new_signature) {
            if !same && old.identity == new.identity {
                compatible = old
                    .fields
                    .iter()
                    .all(|(field, shape)| new.fields.get(field) == Some(shape))
                    && new
                        .fields
                        .iter()
                        .filter(|(field, _)| !old.fields.contains_key(*field))
                        .all(|(_, shape)| role == Utf16::from("fields") || shape.1);
            }
        }
        if let (Some(x), Some(y)) = (a, b) {
            if string_member(x, "path") != string_member(y, "path")
                || stable_value(member(&before, "runtimeAbi").unwrap_or(&Value::Null), ctx)?
                    != stable_value(member(&after, "runtimeAbi").unwrap_or(&Value::Null), ctx)?
            {
                compatible = false;
            }
        }
        let (change, classification, reason) = match (a, b) {
            (None, Some(_)) => (
                "added",
                "source-compatible",
                "New public symbol; existing source remains valid",
            ),
            (Some(_), None) => ("removed", "breaking", "Previously public symbol removed"),
            (Some(_), Some(_)) => (
                if same { "unchanged" } else { "changed" },
                if compatible {
                    "source-compatible"
                } else {
                    "breaking"
                },
                if compatible {
                    "Existing typed fields and required inputs preserved; no data/native compatibility inferred"
                } else {
                    "Removed/retyped input, changed identity/constraints, ABI or unqualified compatibility"
                },
            ),
            _ => unreachable!(),
        };
        let mut members = vec![
            (Utf16::from("symbol"), Value::String(name)),
            (Utf16::from("role"), Value::String(role)),
            (
                Utf16::from("classification"),
                Value::String(Utf16::from(classification)),
            ),
            (Utf16::from("change"), Value::String(Utf16::from(change))),
            (Utf16::from("reason"), Value::String(Utf16::from(reason))),
        ];
        if let Some(value) = a {
            members.push((Utf16::from("before"), crate::value::admit_json(value, ctx)?));
        }
        if let Some(value) = b {
            members.push((Utf16::from("after"), crate::value::admit_json(value, ctx)?));
        }
        changes.push(Value::Object(members));
    }
    Ok(Value::Array(changes))
}

#[cfg(test)]
mod private_conformance_tests {
    use super::*;
    use crate::resources::CodegenResources;
    use std::{fs, path::PathBuf};
    use umf_core::serialization::{read_json_value, Format};
    use umf_core::{Limits, ResourceProfile, ResourceSet};

    fn parse(source: &str) -> Value {
        let mut ctx = Context::with_limits(
            ResourceProfile::Cooperative,
            Limits {
                max_text_units: 64 * 1024 * 1024,
                max_values: 2_000_000,
                max_depth: 256,
                ..Limits::ordinary()
            },
        )
        .unwrap();
        read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            &mut ctx,
        )
        .unwrap()
    }
    fn load(root: &std::path::Path, relative: &str) -> Value {
        parse(&fs::read_to_string(root.join(relative)).unwrap())
    }
    fn field<'a>(value: &'a Value, key: &str) -> &'a Value {
        member(value, key).unwrap()
    }

    #[test]
    fn successful_stage_one_vectors_match_private_ir_and_emission() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let tables = load(&root, "spec/extensions/tables/package.json");
        let actions = load(&root, "spec/extensions/actions/package.json");
        let mut catalog = Context::catalog();
        let resources = CodegenResources::new(
            ResourceSet::new(
                load(&root, "spec/core/schema.json"),
                load(&root, "spec/core/semantic-type-reference.schema.json"),
                load(&root, "spec/core/extension-package.schema.json"),
                load(&root, "spec/metamodel/generated/core-constraints.json"),
                load(&root, "spec/metamodel/generated/domain-policy.json"),
            ),
            tables.clone(),
            field(&tables, "schema").clone(),
            actions.clone(),
            field(&actions, "schema").clone(),
            load(&root, "spec/extensions/binding/package.json"),
            load(&root, "spec/extensions/binding-stable/package.json"),
            &mut catalog,
        )
        .unwrap();
        let engine = CodegenEngine::new(&resources);
        let corpus = parse(
            &fs::read_to_string(
                root.join("tests/rust-core/fixtures/r3/baseline/stage-one.json"),
            )
            .unwrap(),
        );
        let vectors = crate::value::array_items(field(&corpus, "vectors")).unwrap();
        let mut checked = 0;
        for vector in vectors {
            if field(vector, "operation") != &Value::String(Utf16::from("generateAccessPackage"))
                || field(field(vector, "expected"), "ok") != &Value::Bool(true)
                || field(field(field(vector, "expected"), "result"), "outcome")
                    != &Value::String(Utf16::from("candidate"))
            {
                continue;
            }
            PRIVATE_ACCESS_CAPTURE.with(|slot| *slot.borrow_mut() = None);
            let request = field(vector, "request");
            let mut ctx = Context::with_limits(
                ResourceProfile::Cooperative,
                Limits {
                    max_text_units: 64 * 1024 * 1024,
                    max_values: 2_000_000,
                    max_depth: 256,
                    ..Limits::ordinary()
                },
            )
            .unwrap();
            let result = engine
                .generate_access_package(
                    field(request, "request"),
                    field(request, "profile"),
                    &mut ctx,
                )
                .unwrap();
            assert_eq!(
                field(&result, "outcome"),
                &Value::String(Utf16::from("candidate")),
                "{:?}",
                field(vector, "id")
            );
            let captured = PRIVATE_ACCESS_CAPTURE
                .with(|slot| slot.borrow_mut().take())
                .expect("successful admission capture");
            let expected_ir = field(field(vector, "admission"), "ir");
            if &captured.0 != expected_ir {
                let actual_text = umf_core::serialization::stringify_compact(&captured.0).unwrap();
                let expected_text =
                    umf_core::serialization::stringify_compact(expected_ir).unwrap();
                let id = string_member(vector, "id").unwrap().to_utf8().unwrap();
                let _ = fs::write(
                    format!("/private/tmp/umf-r3-private-ir-{id}-actual.json"),
                    actual_text.to_utf8().unwrap(),
                );
                let _ = fs::write(
                    format!("/private/tmp/umf-r3-private-ir-{id}-expected.json"),
                    expected_text.to_utf8().unwrap(),
                );
            }
            assert_eq!(
                &captured.0,
                expected_ir,
                "private IR: {:?}",
                field(vector, "id")
            );
            let mut actual_symbols = captured.2.clone();
            let mut expected_symbols =
                crate::value::array_items(field(field(vector, "emission"), "symbols"))
                    .unwrap()
                    .to_vec();
            let symbol_key = |value: &Value| {
                (
                    get_str(value, "sourceId").unwrap_or_default(),
                    get_str(value, "pointer").unwrap_or_default(),
                    get_str(value, "path").unwrap_or_default(),
                    get_str(value, "symbol").unwrap_or_default(),
                    get_str(value, "role").unwrap_or_default(),
                )
            };
            actual_symbols.sort_by_key(symbol_key);
            expected_symbols.sort_by_key(symbol_key);
            assert_eq!(
                actual_symbols,
                expected_symbols,
                "emission symbol set: {:?}",
                field(vector, "id")
            );
            let expected_texts =
                crate::value::array_items(field(field(vector, "emission"), "texts")).unwrap();
            assert_eq!(
                captured.1.len(),
                expected_texts.len(),
                "emission file count: {:?}",
                field(vector, "id")
            );
            for expected in expected_texts {
                let expected_path = string_member(expected, "path").unwrap().to_utf8().unwrap();
                let actual_path = expected_path.rsplit('/').next().unwrap();
                let (_, actual_text) = captured
                    .1
                    .iter()
                    .find(|(path, _)| path == actual_path)
                    .expect("emitted relative path");
                assert_eq!(
                    actual_text,
                    string_member(expected, "text").unwrap(),
                    "emission text {}: {:?}",
                    actual_path,
                    field(vector, "id")
                );
            }
            checked += 1;
        }
        assert_eq!(checked, 12);
    }
    #[test]
    fn frozen_sol_profile_request_dependency_and_handler_reviews_match() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let tables = load(&root, "spec/extensions/tables/package.json");
        let actions = load(&root, "spec/extensions/actions/package.json");
        let mut catalog = Context::catalog();
        let resources = CodegenResources::new(
            ResourceSet::new(
                load(&root, "spec/core/schema.json"),
                load(&root, "spec/core/semantic-type-reference.schema.json"),
                load(&root, "spec/core/extension-package.schema.json"),
                load(&root, "spec/metamodel/generated/core-constraints.json"),
                load(&root, "spec/metamodel/generated/domain-policy.json"),
            ),
            tables.clone(),
            field(&tables, "schema").clone(),
            actions.clone(),
            field(&actions, "schema").clone(),
            load(&root, "spec/extensions/binding/package.json"),
            load(&root, "spec/extensions/binding-stable/package.json"),
            &mut catalog,
        )
        .unwrap();
        let engine = CodegenEngine::new(&resources);
        let corpora = [
            "sol-final-access-diff-utf16-review/frozen.json",
            "sol-final-access-profile-review/frozen.json",
            "sol-final-access-request-utf16-review/frozen.json",
            "sol-final-access-dependency-utf16-review/frozen.json",
            "sol-final-access-handler-keys-review/frozen.json",
            "sol-final-access-handler-keys-review/boundaries/frozen.json",
            "sol-final-profile-unicode-normalization-review/frozen.json",
        ];
        let mut checked = 0;
        for corpus in corpora {
            let fixture = load(
                &root,
                &format!("tests/rust-core/fixtures/r3/{corpus}"),
            );
            for case in crate::value::array_items(field(&fixture, "cases")).unwrap() {
                let input = field(case, "request");
                let expected = field(case, "expected");
                let mut ctx = Context::with_limits(
                    ResourceProfile::Cooperative,
                    Limits {
                        max_text_units: 64 * 1024 * 1024,
                        max_values: 2_000_000,
                        max_depth: 256,
                        ..Limits::ordinary()
                    },
                )
                .unwrap();
                let actual = if string_member(case, "operation")
                    .and_then(|v| v.to_utf8().ok())
                    .as_deref()
                    == Some("diffAccessPackages")
                {
                    engine.diff_access_packages(
                        field(input, "before"),
                        field(input, "after"),
                        &mut ctx,
                    )
                } else {
                    engine.generate_access_package(
                        field(input, "request"),
                        field(input, "profile"),
                        &mut ctx,
                    )
                };
                if field(expected, "ok") == &Value::Bool(true) {
                    let actual = actual.unwrap();
                    if actual != *field(expected, "result") {
                        let id = string_member(case, "id").unwrap().to_utf8().unwrap();
                        if id == "sol-final-dependency-raw-utf16-key" {
                            if let Some((ir, _, _)) =
                                PRIVATE_ACCESS_CAPTURE.with(|slot| slot.borrow_mut().take())
                            {
                                let _ = fs::write(
                                    "/private/tmp/umf-dependency-raw-key-ir.json",
                                    umf_core::serialization::stringify_compact(&ir)
                                        .unwrap()
                                        .to_utf8()
                                        .unwrap(),
                                );
                            }
                        }
                        let actual_text =
                            umf_core::serialization::stringify_compact(&actual).unwrap();
                        let expected_text =
                            umf_core::serialization::stringify_compact(field(expected, "result"))
                                .unwrap();
                        let _ = fs::write(
                            format!("/private/tmp/umf-{id}-actual.json"),
                            actual_text.to_utf8().unwrap(),
                        );
                        let _ = fs::write(
                            format!("/private/tmp/umf-{id}-expected.json"),
                            expected_text.to_utf8().unwrap(),
                        );
                    }
                    assert_eq!(
                        actual,
                        *field(expected, "result"),
                        "{}",
                        string_member(case, "id").unwrap().to_utf8().unwrap()
                    );
                } else {
                    let error = actual.unwrap_err();
                    let expected_error = field(expected, "error");
                    assert_eq!(
                        error.code,
                        string_member(expected_error, "code")
                            .unwrap()
                            .to_utf8()
                            .unwrap(),
                        "{}",
                        string_member(case, "id").unwrap().to_utf8().unwrap()
                    );
                    assert_eq!(
                        error.path,
                        string_member(expected_error, "pointer").unwrap().clone(),
                        "{}",
                        string_member(case, "id").unwrap().to_utf8().unwrap()
                    );
                }
                checked += 1;
            }
        }
        assert_eq!(checked, 29);
    }
}

#[cfg(test)]
mod rendering_control_tests {
    use super::*;
    fn graph_fields(count: usize) -> Vec<Value> {
        (0..count)
            .map(|index| {
                let mut field = obj([
                    ("pointer", s(format!("/field/{index}"))),
                    (
                        "ref",
                        obj([("module", s("m")), ("element", s(format!("f{index}")))]),
                    ),
                    ("scalarType", s("string")),
                    (
                        "cardinality",
                        s(if index + 1 < count { "map" } else { "one" }),
                    ),
                    ("facets", obj([])),
                    ("properties", obj([])),
                ]);
                if index + 1 < count {
                    if let Value::Object(values) = &mut field {
                        values.push((
                            Utf16::from("item"),
                            obj([
                                ("module", s("m")),
                                ("element", s(format!("f{}", index + 1))),
                            ]),
                        ));
                    }
                }
                field
            })
            .collect()
    }
    #[test]
    fn action_chronology_interleaves_without_copying_metadata_and_preserves_control() {
        fn input() -> (Value, Vec<Value>) {
            (
                arr((0..6).map(|i| obj([("id", s(format!("d{i}")))]))),
                vec![obj([("dispositionIds", arr([s("d4"), s("d5")]))])],
            )
        }
        let (mut dispositions, mut obligations) = input();
        let batches = [(2, 1), (1, 1)];
        let mut calls = 0;
        let mut meter = |_: usize| {
            calls += 1;
            Ok(())
        };
        interleave_action_dispositions(
            &mut dispositions,
            &mut obligations,
            1,
            &batches,
            &mut Context::ordinary().with_meter(&mut meter),
        )
        .unwrap();
        assert_eq!(
            at(&obligations[0], "dispositionIds"),
            &arr([s("d3"), s("d5")])
        );
        for (index, item) in array_items(&dispositions).unwrap().iter().enumerate() {
            assert_eq!(at(item, "id"), &s(format!("d{index}")));
        }
        for code in ["LIMIT", "NUMBER", "VALUE_INVALID"] {
            let (mut dispositions, mut obligations) = input();
            let mut seen = 0;
            let cutoff = calls * 3 / 4;
            let mut meter = |_: usize| {
                seen += 1;
                if seen == cutoff {
                    Err(EngineError::new(
                        code,
                        Utf16::from("/host/chronology"),
                        "injected",
                    ))
                } else {
                    Ok(())
                }
            };
            let error = interleave_action_dispositions(
                &mut dispositions,
                &mut obligations,
                1,
                &batches,
                &mut Context::ordinary().with_meter(&mut meter),
            )
            .unwrap_err();
            assert!(error.is_control_failure());
            assert_eq!(error.code, code);
            assert_eq!(error.path, Utf16::from("/host/chronology"));
        }
    }
    #[test]
    fn diff_graph_shape_is_iterative_and_preserves_late_control() {
        let fields = graph_fields(160);
        let rendered = diff_shape(&fields[0], &fields, &mut Context::ordinary()).unwrap();
        assert_eq!(rendered.matches("\"scalar\":\"string\"").count(), 160);
        assert_eq!(rendered.matches("\"item\":").count(), 159);
        let mut calls = 0;
        let mut meter = |_: usize| {
            calls += 1;
            if calls == 20 {
                Err(EngineError::new("INPUT", Utf16::from("/host"), "injected"))
            } else {
                Ok(())
            }
        };
        let error = diff_shape(
            &fields[0],
            &fields,
            &mut Context::ordinary().with_meter(&mut meter),
        )
        .unwrap_err();
        assert!(error.is_control_failure());
        assert_eq!(error.code, "INPUT");
        assert_eq!(error.path, Utf16::from("/host"));
    }
    #[test]
    fn pointer_order_uses_ecmascript_numeric_equivalence() {
        assert_eq!(
            pointer_cmp_utf16(
                &Utf16::from("/x/9007199254740993/a"),
                &Utf16::from("/x/9007199254740992/z")
            ),
            std::cmp::Ordering::Equal
        );
        assert_eq!(
            pointer_cmp_utf16(&Utf16::from("/x/01/z"), &Utf16::from("/x/1/a")),
            std::cmp::Ordering::Equal
        );
    }
    #[test]
    fn stable_pointer_sort_propagates_failure_during_comparisons() {
        let mut values = arr((0..100).rev().map(|index| {
            obj([
                ("id", s(format!("d{index}"))),
                ("pointer", s(format!("/items/{index}"))),
                ("assertion", s("unknown")),
            ])
        }));
        let mut calls = 0;
        let mut meter = |_: usize| {
            calls += 1;
            if calls == 20 {
                Err(EngineError::new("ORDER", Utf16::from("/host"), "injected"))
            } else {
                Ok(())
            }
        };
        let error = sort_dispositions(&mut values, &mut Context::ordinary().with_meter(&mut meter))
            .unwrap_err();
        assert!(error.is_control_failure());
        assert_eq!(error.code, "ORDER");
        assert_eq!(error.path, Utf16::from("/host"));
    }
    #[test]
    fn disposition_path_containment_preserves_late_control_origin() {
        let mut dispositions = arr([obj([
            ("pointer", s("/modules/0/elements/0/fields/0")),
            ("fidelity", s("exact")),
        ])]);
        let paths = (0..32)
            .map(|i| Utf16::from(format!("/unused/{i}")))
            .collect::<Vec<_>>();
        let mut calls = 0;
        let mut meter = |_: usize| {
            calls += 1;
            if calls == 12 {
                Err(EngineError::new(
                    "VALUE_INVALID",
                    Utf16::from("/host/path-scan"),
                    "injected",
                ))
            } else {
                Ok(())
            }
        };
        let error = apply_not_expressible(
            &mut dispositions,
            &paths,
            &mut Context::ordinary().with_meter(&mut meter),
        )
        .unwrap_err();
        assert!(error.is_control_failure());
        assert_eq!(error.code, "VALUE_INVALID");
        assert_eq!(error.path, Utf16::from("/host/path-scan"));
    }
    #[test]
    fn diff_public_name_lookup_preserves_late_control_origin() {
        let result = obj([(
            "symbols",
            arr((0..32).map(|i| {
                obj([
                    ("pointer", s(format!("/other/{i}"))),
                    ("role", s("codec")),
                    ("symbol", s("unused")),
                ])
            })),
        )]);
        let field = obj([("pointer", s("/field")), ("python", s("field"))]);
        let mut calls = 0;
        let mut meter = |_: usize| {
            calls += 1;
            if calls == 13 {
                Err(EngineError::new(
                    "NUMBER",
                    Utf16::from("/host/diff-symbols"),
                    "injected",
                ))
            } else {
                Ok(())
            }
        };
        let error = diff_public_name(
            &result,
            &field,
            &mut Context::ordinary().with_meter(&mut meter),
        )
        .unwrap_err();
        assert!(error.is_control_failure());
        assert_eq!(error.code, "NUMBER");
        assert_eq!(error.path, Utf16::from("/host/diff-symbols"));
    }
    #[test]
    fn disposition_census_reserves_each_repeated_source_identity_copy() {
        let module = Utf16::from("m");
        let record = Utf16::from("R");
        let selected = BTreeSet::from([(&module, &record)]);
        let selected_paths = BTreeSet::from([Utf16::from("/modules/0/elements/0")]);
        let document = obj([
            ("umf", s("0.10.0")),
            ("id", s("d")),
            (
                "modules",
                arr([obj([
                    ("id", s("m")),
                    ("namespace", s("m")),
                    (
                        "elements",
                        arr([obj([
                            ("id", s("R")),
                            ("kind", s("record")),
                            ("members", arr([])),
                            ("keys", arr([])),
                            ("extensions", obj([])),
                            ("aliases", arr((0..128).map(|i| s(format!("alias{i}"))))),
                        ])]),
                    ),
                    ("extensions", obj([])),
                ])]),
            ),
        ]);
        let records = vec![obj([
            ("ref", obj([("module", s("m")), ("element", s("R"))])),
            ("pointer", s("/modules/0/elements/0")),
            ("selected", Value::Bool(true)),
            ("fields", arr([])),
        ])];
        let logical = "s".repeat(8192);
        let mut copies = 0;
        let mut meter = |amount: usize| {
            if amount >= 8192 {
                copies += 1;
                if copies == 10 {
                    return Err(EngineError::new(
                        "LIMIT",
                        Utf16::from("/host/source-copy"),
                        "bounded copied identity stop",
                    ));
                }
            }
            Ok(())
        };
        let error = collect_dispositions(
            &document,
            &logical,
            &selected,
            &BTreeSet::new(),
            &[],
            &[],
            &records,
            &selected_paths,
            &mut Context::ordinary().with_meter(&mut meter),
        )
        .unwrap_err();
        assert!(error.is_control_failure());
        assert_eq!(error.path, Utf16::from("/host/source-copy"));
        assert_eq!(copies, 10);
    }
    #[test]
    fn stable_signatures_poll_inside_strings_and_collections() {
        let value = arr([s("x".repeat(100000))]);
        let mut polls = 0;
        let mut cancel = || {
            polls += 1;
            polls > 10
        };
        let error = stable_value(
            &value,
            &mut Context::ordinary().with_cancellation(&mut cancel),
        )
        .unwrap_err();
        assert!(error.is_control_failure());
        assert_eq!(error.code, "CANCELLED");
    }
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Lakeview 0.2 retention and explicit data-shape declarations. No SQL execution.
use crate::kinds::{get, object};
use crate::{copy_json, Context, EngineError, Utf16, Value};
use std::collections::BTreeSet;

const EXT: &str = "umf.lakeview";
const VERSION: &str = "0.2.0";
fn s(v: &str) -> Value {
    Value::string_utf8(v)
}
fn err(code: &str, path: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::from(path), message)
}
fn text(v: &Value) -> Option<&Utf16> {
    if let Value::String(s) = v {
        Some(s)
    } else {
        None
    }
}
fn array(v: Option<&Value>) -> &[Value] {
    if let Some(Value::Array(a)) = v {
        a
    } else {
        &[]
    }
}
fn pairs(v: &Value) -> &[(Utf16, Value)] {
    if let Value::Object(m) = v {
        m
    } else {
        &[]
    }
}
fn put(v: &mut Value, k: &str, value: Value) {
    if let Value::Object(m) = v {
        if let Some((_, v)) = m.iter_mut().find(|(key, _)| key == &Utf16::from(k)) {
            *v = value
        } else {
            m.push((Utf16::from(k), value))
        }
    }
}
fn nget<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    get(v, "members").and_then(|m| get(m, k))
}
fn ntext(v: Option<&Value>) -> Option<&Utf16> {
    v.filter(|v| get(v, "kind") == Some(&s("string")))
        .and_then(|v| get(v, "value"))
        .and_then(text)
}
fn narray<'a>(v: Option<&'a Value>, path: &str) -> Result<&'a [Value], EngineError> {
    match v {
        None => Ok(&[]),
        Some(v) if get(v, "kind") == Some(&s("array")) => Ok(array(get(v, "items"))),
        _ => Err(err("LAKEVIEW_NATIVE", path, "Expected a native array")),
    }
}
fn nobject(v: &Value, path: &str) -> Result<(), EngineError> {
    if get(v, "kind") == Some(&s("object")) {
        Ok(())
    } else {
        Err(err("LAKEVIEW_NATIVE", path, "Expected a native object"))
    }
}
fn stripped(v: &Value, omit: &[&str]) -> Value {
    object(vec![
        ("kind", s("object")),
        (
            "members",
            Value::Object(
                pairs(get(v, "members").unwrap())
                    .iter()
                    .filter(|(k, _)| !omit.iter().any(|x| k == &Utf16::from(*x)))
                    .cloned()
                    .collect(),
            ),
        ),
    ])
}
fn order(v: &Value) -> Value {
    Value::Array(
        pairs(get(v, "members").unwrap())
            .iter()
            .map(|(k, _)| Value::String(k.clone()))
            .collect(),
    )
}
fn payload(kind: &str) -> Value {
    object(vec![("kind", s(kind))])
}
fn extensions(p: Value) -> Value {
    Value::Object(vec![(Utf16::from(EXT), p)])
}
fn reference(module: &Utf16, element: &Utf16) -> Value {
    object(vec![
        ("module", Value::String(module.clone())),
        ("element", Value::String(element.clone())),
    ])
}
fn links(refs: Vec<Value>) -> Value {
    Value::Array(
        refs.into_iter()
            .map(|mut r| {
                put(&mut r, "role", s("lakeview-declaration"));
                r
            })
            .collect(),
    )
}
fn unique(
    used: &mut BTreeSet<Utf16>,
    wanted: Option<&Utf16>,
    fallback: &str,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let base = wanted
        .filter(|s| !s.is_empty())
        .cloned()
        .unwrap_or_else(|| Utf16::from(fallback));
    for i in 0usize.. {
        ctx.charge_work(
            base.len()
                .saturating_add(used.len().checked_ilog2().unwrap_or(0) as usize + 1),
            Utf16::default(),
        )?;
        let id = if i == 0 {
            base.clone()
        } else {
            let mut units = base.units().to_vec();
            units.extend(format!("_{}", i + 1).encode_utf16());
            Utf16::new(units)
        };
        if used.insert(id.clone()) {
            return Ok(id);
        }
    }
    unreachable!()
}
fn element(id: &Utf16, name: Option<&Utf16>, kind: Option<&str>, p: Value) -> Value {
    let mut result = object(vec![
        ("id", Value::String(id.clone())),
        ("extensions", extensions(p)),
    ]);
    if let Some(k) = kind {
        put(&mut result, "kind", s(k));
    }
    if let Some(name) = name {
        put(&mut result, "name", Value::String(name.clone()));
    }
    result
}
fn issue(path: &str, code: &str, detail: &str) -> Value {
    object(vec![
        ("path", s(path)),
        ("code", s(code)),
        ("classification", s("unsupported")),
        ("detail", s(detail)),
        ("retainedInSource", Value::Bool(true)),
    ])
}
fn field(id: &Utf16, name: &Utf16, path: &str, role: &str) -> Value {
    let mut p = payload("field");
    put(&mut p, "sourcePath", s(path));
    put(&mut p, "role", s(role));
    // Native names and expressions establish identity, never a scalar family,
    // nullability, row grain, physical storage or completeness assertion.
    element(id, Some(name), Some("field"), p)
}

pub fn import(
    source: &Utf16,
    options: &Value,
    core: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if source.len() > ctx.limits().max_text_units {
        return Err(err("LIMIT", "", "Source text limit exceeded"));
    }
    ctx.charge_work(source.len(), Utf16::default())?;
    if source.to_utf8().is_err() {
        return Err(err(
            "SOURCE_ENCODING",
            "",
            "Lakeview source must be well-formed Unicode / UTF-8",
        ));
    }
    let options = copy_json(options, ctx)?;
    if !matches!(&options, Value::Object(_))
        || pairs(&options).iter().any(|(k, _)| {
            !["id", "title", "namespace"]
                .iter()
                .any(|s| k == &Utf16::from(*s))
        })
    {
        return Err(err(
            "LAKEVIEW_OPTIONS",
            "",
            "Expected id, optional title and namespace",
        ));
    }
    let id = get(&options, "id")
        .and_then(text)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| err("LAKEVIEW_OPTIONS", "/id", "Nonempty id is required"))?;
    for k in ["title", "namespace"] {
        if get(&options, k).is_some_and(|v| text(v).is_none()) {
            return Err(err(
                "LAKEVIEW_OPTIONS",
                "",
                "Title and namespace must be strings",
            ));
        }
    }
    let namespace = get(&options, "namespace").cloned().unwrap_or_else(|| s(""));
    let root = crate::serialization::read_native_json(source.units(), ctx)?;
    nobject(&root, "")?;
    let datasets = narray(nget(&root, "datasets"), "/datasets")?;
    let pages = narray(nget(&root, "pages"), "/pages")?;
    let mut module_ids = BTreeSet::new();
    let mut page_ids = vec![];
    for (i, p) in pages.iter().enumerate() {
        nobject(p, &format!("/pages/{i}"))?;
        page_ids.push(unique(
            &mut module_ids,
            ntext(nget(p, "name")),
            &format!("page_{i}"),
            ctx,
        )?);
    }
    let data_id = unique(&mut module_ids, Some(&Utf16::from("data")), "data", ctx)?;
    let mut dataset_ids = vec![];
    let mut data_elements = vec![];
    let mut used = BTreeSet::new();
    let mut issues = vec![];
    for (i, ds) in datasets.iter().enumerate() {
        nobject(ds, &format!("/datasets/{i}"))?;
        dataset_ids.push(unique(
            &mut used,
            ntext(nget(ds, "name")),
            &format!("dataset_{i}"),
            ctx,
        )?);
    }
    for (i, ds) in datasets.iter().enumerate() {
        let base = format!("/datasets/{i}");
        let mut p = payload("dataset");
        put(&mut p, "native", ds.clone());
        put(&mut p, "schemaCoverage", s("partial-native-declarations"));
        let mut record = element(
            &dataset_ids[i],
            ntext(nget(ds, "displayName")).or_else(|| ntext(nget(ds, "name"))),
            Some("record"),
            p,
        );
        let mut fields = vec![];
        let mut members = vec![];
        for (ci, c) in narray(nget(ds, "columns"), &(base.clone() + "/columns"))?
            .iter()
            .enumerate()
        {
            nobject(c, &format!("{base}/columns/{ci}"))?;
            if let Some(name) = ntext(nget(c, "displayName")).or_else(|| ntext(nget(c, "name"))) {
                let fid = unique(&mut used, None, &format!("dataset_{i}/column/{ci}"), ctx)?;
                members.push(reference(&data_id, &fid));
                fields.push(field(
                    &fid,
                    name,
                    &format!("{base}/columns/{ci}"),
                    "declared-column",
                ));
            } else {
                issues.push(issue(
                    &format!("{base}/columns/{ci}"),
                    "LAKEVIEW_FIELD_UNNAMED",
                    "Unnamed native declaration retained without inventing a Field name",
                ));
            }
        }
        put(&mut record, "members", Value::Array(members.clone()));
        put(&mut record, "references", links(members));
        data_elements.push(record);
        data_elements.extend(fields);
        issues.push(issue(&base,"LAKEVIEW_SCHEMA_PARTIAL","Only explicit native columns are core Fields; SQL does not establish a complete row schema or scalar types"));
    }
    let mut modules = vec![object(vec![
        ("id", Value::String(data_id.clone())),
        ("namespace", namespace.clone()),
        ("extensions", extensions(payload("data"))),
        ("elements", Value::Array(data_elements)),
    ])];
    for (pi, page) in pages.iter().enumerate() {
        let base = format!("/pages/{pi}");
        let layouts = narray(nget(page, "layout"), &(base.clone() + "/layout"))?;
        let mut used = BTreeSet::new();
        let mut ids = vec![];
        let mut elements = vec![];
        for (li, l) in layouts.iter().enumerate() {
            nobject(l, &format!("{base}/layout/{li}"))?;
            ids.push(unique(
                &mut used,
                nget(l, "widget").and_then(|w| ntext(nget(w, "name"))),
                &format!("item_{li}"),
                ctx,
            )?);
        }
        for (li, l) in layouts.iter().enumerate() {
            let lp = format!("{base}/layout/{li}");
            let mut p = payload("layout-item");
            put(&mut p, "native", l.clone());
            let mut item = element(&ids[li], None, None, p);
            let mut records = vec![];
            let mut item_refs = vec![];
            if let Some(widget) = nget(l, "widget") {
                for (qi, q) in narray(nget(widget, "queries"), &(lp.clone() + "/widget/queries"))?
                    .iter()
                    .enumerate()
                {
                    nobject(q, &format!("{lp}/widget/queries/{qi}"))?;
                    let Some(query) = nget(q, "query") else {
                        continue;
                    };
                    nobject(query, &format!("{lp}/widget/queries/{qi}/query"))?;
                    let qp = format!("{lp}/widget/queries/{qi}/query");
                    let rid = unique(&mut used, None, &format!("item_{li}/query/{qi}"), ctx)?;
                    let mut p = payload("query-result");
                    put(&mut p, "sourcePath", s(&qp));
                    put(&mut p, "schemaCoverage", s("declared-query-output"));
                    let lookup_units = ntext(nget(query, "datasetName"))
                        .map(Utf16::len)
                        .unwrap_or(0);
                    ctx.charge_work(
                        datasets
                            .len()
                            .saturating_mul(lookup_units.saturating_add(1)),
                        Utf16::from(qp.clone()),
                    )?;
                    let matches: Vec<usize> = datasets
                        .iter()
                        .enumerate()
                        .filter(|(_, d)| {
                            ntext(nget(d, "name")).is_some()
                                && ntext(nget(d, "name")) == ntext(nget(query, "datasetName"))
                        })
                        .map(|(i, _)| i)
                        .collect();
                    let mut refs = vec![];
                    if matches.len() == 1 {
                        let r = reference(&data_id, &dataset_ids[matches[0]]);
                        put(&mut p, "dataset", r.clone());
                        refs.push(r)
                    } else {
                        issues.push(issue(&(qp.clone()+"/datasetName"),"LAKEVIEW_DATASET_UNRESOLVED","Query dataset is absent, ambiguous or uses relationships; no core dataset reference inferred"));
                    }
                    let mut record = element(&rid, ntext(nget(q, "name")), Some("record"), p);
                    let mut members = vec![];
                    let mut fields = vec![];
                    for (fi, f) in narray(nget(query, "fields"), &(qp.clone() + "/fields"))?
                        .iter()
                        .enumerate()
                    {
                        nobject(f, &format!("{qp}/fields/{fi}"))?;
                        if let Some(name) = ntext(nget(f, "name")) {
                            let fid = unique(
                                &mut used,
                                None,
                                &format!("query_{li}_{qi}/field/{fi}"),
                                ctx,
                            )?;
                            members.push(reference(&page_ids[pi], &fid));
                            fields.push(field(
                                &fid,
                                name,
                                &format!("{qp}/fields/{fi}"),
                                "query-output",
                            ));
                        } else {
                            issues.push(issue(
                                &format!("{qp}/fields/{fi}"),
                                "LAKEVIEW_FIELD_UNNAMED",
                                "Unnamed query output retained without inventing a Field name",
                            ));
                        }
                    }
                    refs.extend(members.clone());
                    put(&mut record, "members", Value::Array(members));
                    put(&mut record, "references", links(refs));
                    item_refs.push(reference(&page_ids[pi], &rid));
                    records.push(record);
                    records.extend(fields);
                    issues.push(issue(&qp,"LAKEVIEW_QUERY_OPAQUE","Query, aggregation, filtering and evaluation context remain native; core Fields describe named outputs only"));
                }
            }
            put(&mut item, "references", links(item_refs));
            elements.push(item);
            elements.extend(records);
        }
        let mut p = payload("page");
        put(&mut p, "native", stripped(page, &["layout"]));
        put(&mut p, "order", order(page));
        modules.push(object(vec![
            ("id", Value::String(page_ids[pi].clone())),
            ("namespace", namespace.clone()),
            ("extensions", extensions(p)),
            ("elements", Value::Array(elements)),
        ]));
    }
    let mut p = payload("dashboard");
    put(&mut p, "native", stripped(&root, &["datasets", "pages"]));
    put(&mut p, "order", order(&root));
    put(&mut p, "originalText", Value::String(source.clone()));
    put(
        &mut p,
        "title",
        get(&options, "title")
            .cloned()
            .unwrap_or_else(|| Value::String(id.clone())),
    );
    let document = object(vec![
        ("umf", core.clone()),
        ("id", Value::String(id.clone())),
        (
            "vocabularies",
            Value::Object(vec![(
                Utf16::from(EXT),
                object(vec![("version", s(VERSION))]),
            )]),
        ),
        ("extensions", extensions(p)),
        ("modules", Value::Array(modules)),
    ]);
    issues.push(issue("","LAKEVIEW_NATIVE_SEMANTICS_UNVERIFIED","Native widgets, expressions and unknown content are retained; rendering, native acceptance and cross-BI projection are not certified"));
    copy_json(
        &object(vec![
            ("document", document),
            ("issues", Value::Array(issues)),
        ]),
        ctx,
    )
}

// Object storage order is not portable through JS integer-like own keys.
// Explicit source orders and every array remain ordered; raw source retains
// all original lexical choices. Compare objects by exact UTF-16 key identity.
fn same(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match (a, b) {
        (Value::Object(a), Value::Object(b)) => {
            if a.len() != b.len() {
                return Ok(false);
            }
            for (k, v) in a {
                ctx.charge_work(
                    b.len().saturating_mul(k.len().saturating_add(1)),
                    Utf16::default(),
                )?;
                let Some((_, w)) = b.iter().find(|(key, _)| key == k) else {
                    return Ok(false);
                };
                if !same(v, w, ctx)? {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        (Value::Array(a), Value::Array(b)) => {
            if a.len() != b.len() {
                return Ok(false);
            }
            for (v, w) in a.iter().zip(b) {
                if !same(v, w, ctx)? {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        (Value::String(a), Value::String(b)) => {
            ctx.charge_work(a.len().min(b.len()), Utf16::default())?;
            Ok(a == b)
        }
        _ => Ok(a == b),
    }
}
pub fn export(document: &Value, core: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let document = copy_json(document, ctx)?;
    let root = get(&document, "extensions")
        .and_then(|e| get(e, EXT))
        .ok_or_else(|| {
            err(
                "LAKEVIEW_PAYLOAD",
                "/extensions",
                "Expected a Lakeview 0.2 dashboard",
            )
        })?;
    let source = get(root, "originalText").and_then(text).ok_or_else(|| {
        err(
            "LAKEVIEW_SOURCE",
            "/extensions/umf.lakeview/originalText",
            "Untouched original source is required",
        )
    })?;
    let namespace = array(get(&document, "modules"))
        .first()
        .and_then(|m| get(m, "namespace"))
        .cloned()
        .unwrap_or_else(|| s(""));
    let options = object(vec![
        ("id", get(&document, "id").cloned().unwrap_or(Value::Null)),
        ("title", get(root, "title").cloned().unwrap_or(Value::Null)),
        ("namespace", namespace),
    ]);
    let expected = import(source, &options, core, ctx)?;
    if !same(&document, get(&expected, "document").unwrap(), ctx)? {
        return Err(err("LAKEVIEW_EDIT_UNSUPPORTED","/extensions/umf.lakeview","Lakeview representation or core Records/Fields changed; an edited native rewrite is not qualified"));
    }
    Ok(source.clone())
}
pub fn diagnostics(
    document: &Value,
    core: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let diagnostic=match export(document,core,ctx) {
        Ok(_)=>object(vec![("code",s("LAKEVIEW_CONTEXT_UNVERIFIED")),("path",s("/extensions/umf.lakeview")),("message",s("Original source and declared shapes agree; native rendering, expressions and Databricks acceptance remain unverified")),("severity",s("warning"))]),
        Err(e) if e.code=="LAKEVIEW_EDIT_UNSUPPORTED"||e.code=="LAKEVIEW_SOURCE"||e.code=="LAKEVIEW_PAYLOAD"=>object(vec![("code",s(&e.code)),("path",Value::String(e.path)),("message",Value::String(e.message)),("severity",s("error"))]),
        Err(e) if ["SYNTAX","DUPLICATE_KEY","LAKEVIEW_NATIVE","LAKEVIEW_OPTIONS","SOURCE_ENCODING"].contains(&e.code.as_str())=>object(vec![("code",s("LAKEVIEW_SOURCE_INVALID")),("path",s("/extensions/umf.lakeview/originalText")),("message",Value::String(e.message)),("severity",s("error"))]),
        Err(e)=>return Err(e),
    };
    copy_json(&Value::Array(vec![diagnostic]), ctx)
}

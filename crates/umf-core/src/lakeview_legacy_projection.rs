// SPDX-License-Identifier: MIT OR Apache-2.0
//! Compatibility projection from parsed Lakeview values to the retired dashboard 0.1 shape.
//! The retained native source remains the authority; losses are returned with source pointers.
use crate::{Context, EngineError, Utf16, Value};
use std::collections::{BTreeMap, BTreeSet};

fn s(v: &str) -> Value {
    Value::string_utf8(v)
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect())
}
fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(n, _)| n == &Utf16::from(k)).map(|(_, v)| v),
        _ => None,
    }
}
fn has(v: &Value, k: &str) -> bool {
    get(v, k).is_some()
}
fn pairs(v: &Value) -> &[(Utf16, Value)] {
    if let Value::Object(m) = v {
        m
    } else {
        &[]
    }
}
fn arr(v: Option<&Value>) -> &[Value] {
    if let Some(Value::Array(a)) = v {
        a
    } else {
        &[]
    }
}
fn st(v: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(x)) = v {
        Some(x)
    } else {
        None
    }
}
fn utf(v: &Utf16) -> String {
    v.to_utf8()
        .unwrap_or_else(|_| v.units().iter().map(|u| format!("\\u{:04x}", u)).collect())
}
fn text(v: Option<&Value>) -> Option<String> {
    st(v).and_then(|x| x.to_utf8().ok())
}
fn nullish<'a>(a: Option<&'a Value>, b: Option<&'a Value>) -> Option<&'a Value> {
    match a {
        Some(Value::Null) => b,
        x => x.or(b),
    }
}
fn truth(v: Option<&Value>) -> bool {
    matches!(v, Some(Value::Bool(true)))
}
fn num(v: Option<&Value>) -> Option<f64> {
    if let Some(Value::Number(n)) = v {
        Some(*n)
    } else {
        None
    }
}
fn at(path: &str, key: &str) -> String {
    format!("{}/{}", path, escape(key))
}
fn escape(v: &str) -> String {
    v.replace('~', "~0").replace('/', "~1")
}
fn json(v: &Value) -> String {
    crate::serialization::stringify_compact(v)
        .ok()
        .and_then(|s| s.to_utf8().ok())
        .unwrap_or_else(|| "<unserializable JSON value>".into())
}
fn js_string(v: &Value) -> String {
    match v {
        Value::String(s) => utf(s),
        Value::Null => "null".into(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => crate::ecma_number_to_string(*n),
        Value::Array(a) => a
            .iter()
            .map(|x| {
                if matches!(x, Value::Null) {
                    String::new()
                } else {
                    js_string(x)
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".into(),
    }
}
fn json_or_undefined(v: Option<&Value>) -> String {
    v.map(json).unwrap_or_else(|| "undefined".into())
}
fn nullish_json_or_undefined(a: Option<&Value>, b: Option<&Value>) -> String {
    nullish(a, b)
        .map(json)
        .unwrap_or_else(|| "undefined".into())
}
fn valid_hex(v: Option<&Value>) -> Option<String> {
    let x = text(v)?;
    let b = x.as_bytes();
    if b.len() == 7 && b[0] == b'#' && b[1..].iter().all(u8::is_ascii_hexdigit) {
        Some(x)
    } else {
        None
    }
}
fn issue(
    out: &mut Vec<Value>,
    used: &mut BTreeSet<String>,
    path: String,
    code: &str,
    class: &str,
    detail: String,
    consume: bool,
) {
    out.push(obj(vec![
        ("path", s(&path)),
        ("code", s(code)),
        ("classification", s(class)),
        ("detail", s(&detail)),
        ("retainedInSource", Value::Bool(true)),
    ]));
    if consume {
        used.insert(path);
    }
}
fn issue_utf16(out: &mut Vec<Value>, path: Utf16, code: &str, class: &str, detail: Utf16) {
    out.push(obj(vec![
        ("path", Value::String(path)),
        ("code", s(code)),
        ("classification", s(class)),
        ("detail", Value::String(detail)),
        ("retainedInSource", Value::Bool(true)),
    ]))
}
fn pointer_utf16(path: &Utf16, key: &Utf16) -> Utf16 {
    let mut units = path.units().to_vec();
    units.push(47);
    for unit in key.units() {
        match *unit {
            126 => units.extend([126, 48]),
            47 => units.extend([126, 49]),
            x => units.push(x),
        }
    }
    Utf16::new(units)
}
fn usep(used: &mut BTreeSet<String>, p: &str) {
    used.insert(p.to_owned());
}
fn fields(v: Vec<(&str, Value)>) -> Value {
    obj(v)
}
fn seq(v: Vec<Value>) -> Value {
    Value::Array(v)
}
fn q(s: &str) -> Value {
    Value::String(Utf16::from(s))
}
fn element_key(module: &str, element: &str) -> String {
    format!("[{},{}]", json(&q(module)), json(&q(element)))
}
fn ordered_set(entries: &mut Vec<(String, Value)>, key: String, value: Value) {
    if let Some((_, old)) = entries.iter_mut().find(|(k, _)| k == &key) {
        *old = value
    } else {
        entries.push((key, value))
    }
}

#[derive(Clone)]
struct Dataset {
    id: String,
    fields: Vec<(String, Value)>,
}
#[derive(Clone)]
struct Use {
    field: String,
    agg: String,
    expression: Option<String>,
    derived: bool,
}
#[derive(Clone)]
struct Skip {
    path: String,
    code: &'static str,
    detail: String,
}
impl Skip {
    fn new(path: String, code: &'static str, detail: impl Into<String>) -> Self {
        Self {
            path,
            code,
            detail: detail.into(),
        }
    }
}

fn resolve(expression: &str, declared: &[(String, Value)], path: &str) -> Result<Use, Skip> {
    let names = quoted_names(expression);
    if has_qualified_ref(expression) {
        return Err(Skip::new(path.into(),"LAKEVIEW_RELATIONSHIP",format!("Qualified reference {expression} reads a relationship-graph source; it has no neutral form")));
    }
    if single_quoted(expression, "", "").is_some() {
        return Ok(Use {
            field: names[0].clone(),
            agg: "none".into(),
            expression: None,
            derived: false,
        });
    }
    let upper = expression.to_ascii_uppercase();
    if let Some(n) = function_field(expression, "MEASURE") {
        if declared
            .iter()
            .find(|(name, _)| name.as_str() == n.as_str())
            .is_some_and(|(_, v)| get(v, "role") == Some(&s("measure")))
        {
            return Ok(Use {
                field: n.clone(),
                agg: "measure".into(),
                expression: None,
                derived: false,
            });
        }
        return Err(Skip::new(
            path.into(),
            "LAKEVIEW_EXPRESSION",
            format!("MEASURE of undeclared dataset measure {}", json(&q(&n))),
        ));
    }
    for (f, a) in [
        ("SUM", "sum"),
        ("AVG", "avg"),
        ("MIN", "min"),
        ("MAX", "max"),
        ("COUNT", "count"),
    ] {
        if let Some(field) = function_field(expression, f) {
            return Ok(Use {
                field,
                agg: a.into(),
                expression: None,
                derived: false,
            });
        }
    }
    if let Some(distinct_field) = distinct_count_field(expression) {
        return Ok(Use {
            field: distinct_field,
            agg: "count-distinct".into(),
            expression: None,
            derived: false,
        });
    }
    if names.len() != 1 || names[0] == "*" {
        return Err(Skip::new(
            path.into(),
            "LAKEVIEW_EXPRESSION",
            format!("Expression {expression} does not reference exactly one column"),
        ));
    }
    let aggregate = [
        "SUM(",
        "AVG(",
        "MEAN(",
        "MIN(",
        "MAX(",
        "COUNT(",
        "COUNT_IF(",
        "SUM_IF(",
        "AVG_IF(",
        "ANY_VALUE(",
        "FIRST(",
        "LAST(",
        "MEDIAN(",
        "MODE(",
        "PERCENTILE(",
        "PERCENTILE_APPROX(",
        "APPROX_PERCENTILE(",
        "APPROX_COUNT_DISTINCT(",
        "STDDEV(",
        "STDDEV_POP(",
        "STDDEV_SAMP(",
        "VARIANCE(",
        "VAR_POP(",
        "VAR_SAMP(",
        "MIN_BY(",
        "MAX_BY(",
        "BOOL_AND(",
        "BOOL_OR(",
        "EVERY(",
        "SOME(",
        "COLLECT_LIST(",
        "COLLECT_SET(",
        "ARRAY_AGG(",
    ]
    .iter()
    .any(|n| starts_aggregate(&upper, n.trim_end_matches('(')));
    Ok(Use {
        field: names[0].clone(),
        agg: if aggregate { "custom" } else { "none" }.into(),
        expression: aggregate.then(|| expression.to_owned()),
        derived: !aggregate,
    })
}
fn single_quoted(expression: &str, prefix: &str, suffix: &str) -> Option<String> {
    let rest = expression.strip_prefix(prefix)?.strip_suffix(suffix)?;
    if !rest.starts_with('`') || !rest.ends_with('`') {
        return None;
    }
    if rest.len() < 2 {
        return None;
    }
    let inner = &rest[1..rest.len() - 1];
    if inner.is_empty() {
        return None;
    }
    let mut out = String::new();
    let mut chars = inner.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '`' {
            if chars.peek() == Some(&'`') {
                chars.next();
                out.push('`')
            } else {
                return None;
            }
        } else {
            out.push(c)
        }
    }
    Some(out)
}
fn function_field(expression: &str, function: &str) -> Option<String> {
    let name = expression.get(..function.len())?;
    if !name.eq_ignore_ascii_case(function) {
        return None;
    }
    single_quoted(expression.get(function.len()..)?, "(", ")")
}
fn distinct_count_field(expression: &str) -> Option<String> {
    let prefix = "COUNT(DISTINCT ";
    if expression.len() < prefix.len() {
        return None;
    }
    let name = expression.get(..prefix.len())?;
    let rest = expression.get(prefix.len()..)?;
    if !name.eq_ignore_ascii_case(prefix) {
        return None;
    }
    let content = rest.strip_suffix(')')?;
    single_quoted(content, "", "")
}
fn starts_aggregate(expression: &str, name: &str) -> bool {
    let rest = expression.strip_prefix(name).unwrap_or("");
    let ws = rest.len() - rest.trim_start().len();
    rest[ws..].starts_with('(')
}
fn has_qualified_ref(source: &str) -> bool {
    let chars: Vec<char> = source.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '`' {
            i += 1;
            while i < chars.len() {
                if chars[i] == '`' {
                    if chars.get(i + 1) == Some(&'`') {
                        i += 2;
                        continue;
                    }
                    i += 1;
                    break;
                }
                i += 1
            }
            while i < chars.len() && chars[i].is_whitespace() {
                i += 1
            }
            if chars.get(i) == Some(&'.') {
                i += 1;
                while i < chars.len() && chars[i].is_whitespace() {
                    i += 1
                }
                if chars.get(i) == Some(&'`') {
                    return true;
                }
            }
        } else {
            i += 1
        }
    }
    false
}
fn quoted_names(source: &str) -> Vec<String> {
    let mut names = Vec::new();
    let mut cur = String::new();
    let mut chars = source.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '`' {
            cur.clear();
            while let Some(x) = chars.next() {
                if x == '`' {
                    if chars.peek() == Some(&'`') {
                        chars.next();
                        cur.push('`')
                    } else {
                        break;
                    }
                } else {
                    cur.push(x)
                }
            }
            if !names.contains(&cur) {
                names.push(cur.clone())
            }
        }
    }
    names
}

fn own(map: &[(&str, &str)], key: Option<String>) -> Option<String> {
    let k = key?;
    map.iter()
        .find(|(a, _)| *a == k)
        .map(|(_, v)| (*v).to_owned())
}
fn put(m: &mut Vec<(&'static str, Value)>, k: &'static str, v: Value) {
    m.push((k, v))
}
fn num_value(n: f64) -> Value {
    Value::Number(n)
}
fn map_from(v: &Value) -> BTreeMap<String, Value> {
    pairs(v).iter().map(|(k, v)| (utf(k), v.clone())).collect()
}

fn scale_of(
    scale: Option<&Value>,
    path: &str,
    channel: &str,
    issues: &mut Vec<Value>,
    used: &mut BTreeSet<String>,
) -> Vec<(&'static str, Value)> {
    let mut out = Vec::new();
    let Some(scale) = scale else { return out };
    if !matches!(scale, Value::Object(_)) {
        return out;
    }
    if let Some(t) = text(get(scale, "type")) {
        if ["quantitative", "temporal", "categorical"].contains(&t.as_str()) {
            out.push(("scale", q(&t)));
            usep(used, &at(path, "type"))
        }
    }
    let sort = get(scale, "sort");
    let sort_value = sort.unwrap_or(&Value::Null);
    let by = text(get(sort_value, "by"));
    if let Some(b) = by {
        let (base, rev) = if let Some(x) = b.strip_suffix("-reversed") {
            (x, true)
        } else {
            (b.as_str(), false)
        };
        if ["x", "y", "natural-order", "alphabetical"].contains(&base) && base != channel {
            let kind = if base == "natural-order" || base == "alphabetical" {
                "label"
            } else {
                "value"
            };
            let direction = if rev { "descending" } else { "ascending" };
            out.push(("sort", obj(vec![("by", q(&format!("{kind}-{direction}")))])));
            usep(used, &at(&at(path, "sort"), "by"))
        } else if b == "custom-order" {
            let vals = arr(get(sort_value, "orderedValues"));
            if !vals.is_empty() && vals.iter().all(|v| matches!(v, Value::String(_))) {
                out.push((
                    "sort",
                    obj(vec![
                        ("by", s("custom")),
                        ("values", Value::Array(vals.to_vec())),
                    ]),
                ));
                usep(used, &at(&at(path, "sort"), "by"));
                usep(used, &at(&at(path, "sort"), "orderedValues"))
            }
        }
    }
    for k in ["colorRamp", "mappings"] {
        if let Some(v) = get(scale, k) {
            issue(
                issues,
                used,
                at(path, k),
                "LAKEVIEW_STYLE",
                "annotation-only",
                format!("Scale {k} is not declared"),
                true,
            );
            let _ = v;
        }
    }
    out
}
fn format_of(
    format: Option<&Value>,
    path: &str,
    issues: &mut Vec<Value>,
    used: &mut BTreeSet<String>,
) -> Option<Value> {
    let f = format?;
    let kind = own(
        &[
            ("number", "number"),
            ("number-plain", "number"),
            ("number-currency", "currency"),
            ("number-percent", "percent"),
        ],
        text(get(f, "type")),
    )?;
    usep(used, &at(path, "type"));
    let mut out = vec![("kind", q(&kind))];
    if let Some(c) = text(get(f, "currencyCode")) {
        out.push(("currency", q(&c)));
        usep(used, &at(path, "currencyCode"))
    }
    if let Some(a) = text(get(f, "abbreviation")) {
        if ["compact", "none"].contains(&a.as_str()) {
            out.push(("abbreviation", q(&a)));
            usep(used, &at(path, "abbreviation"))
        }
    }
    if has(f, "hideGroupSeparator") {
        issue(
            issues,
            used,
            at(path, "hideGroupSeparator"),
            "LAKEVIEW_STYLE",
            "annotation-only",
            "Group separator setting is not declared".into(),
            true,
        )
    }
    let dec = get(f, "decimalPlaces").unwrap_or(&Value::Null);
    if let Some(n) = num(get(dec, "places")) {
        if n >= 0. && n.fract() == 0. {
            out.push(("decimals", num_value(n)));
            usep(used, &at(&at(path, "decimalPlaces"), "places"));
            if text(get(dec, "type")).as_deref() == Some("exact") {
                usep(used, &at(&at(path, "decimalPlaces"), "type"))
            } else {
                issue(issues,used,at(&at(path,"decimalPlaces"),"type"),"LAKEVIEW_FORMAT","representation-change",format!("Native {} decimal places; the neutral format declares a fixed count of {n}",json(get(dec,"type").unwrap_or(&Value::Null))),true)
            }
        }
    }
    Some(obj(out))
}

fn query_field(
    qv: &Value,
    qp: &str,
    name: &str,
    datasets: &mut BTreeMap<String, Dataset>,
    ids_data: &str,
    used: &mut BTreeSet<String>,
    issues: &mut Vec<Value>,
    pending: &mut Vec<(String, String)>,
) -> Result<(String, String, Use), Skip> {
    let raw_query = get(qv, "query");
    let query = raw_query.unwrap_or(&Value::Null);
    if matches!(raw_query, Some(Value::Object(_))) && has(query, "datasetName") == false {
        return Err(Skip::new(qp.into(),"LAKEVIEW_RELATIONSHIP","Query names no dataset; it reads relationship-graph sources, which have no neutral form"));
    }
    let dsname = text(get(query, "datasetName"));
    let Some(ds) = dsname.as_ref().and_then(|name| datasets.get_mut(name)) else {
        return Err(Skip::new(
            qp.into(),
            "LAKEVIEW_PROJECTION",
            format!(
                "Query reads dataset {} which is not projected",
                json_or_undefined(get(query, "datasetName"))
            ),
        ));
    };
    let fs = arr(get(query, "fields"));
    let Some(i) = fs
        .iter()
        .position(|f| text(get(f, "name")).as_deref() == Some(name))
    else {
        return Err(Skip::new(
            at(qp, "query"),
            "LAKEVIEW_PROJECTION",
            format!("Encoding field {} is not a query field", json(&q(name))),
        ));
    };
    let f = &fs[i];
    let Some(expression) = text(get(f, "expression")) else {
        return Err(Skip::new(
            at(qp, "query"),
            "LAKEVIEW_PROJECTION",
            format!("Encoding field {} is not a query field", json(&q(name))),
        ));
    };
    let fp = at(&at(&at(qp, "query"), "fields"), &i.to_string());
    let r = resolve(&expression, &ds.fields, &fp)?;
    if r.derived {
        issue(issues,used,fp.clone(),"LAKEVIEW_EXPRESSION","representation-change",format!("Row-level expression {expression} is declared as its column {} without the transformation",json(&q(&r.field))),false)
    }
    if r.agg != "measure" {
        if ds
            .fields
            .iter()
            .find(|(name, _)| name == &r.field)
            .and_then(|(_, v)| text(get(v, "role")))
            .as_deref()
            .is_some_and(|v| v != "column")
        {
            return Err(Skip::new(
                fp.clone(),
                "LAKEVIEW_FIELD_COLLISION",
                format!(
                    "Column {} shares its name with a dataset measure",
                    json(&q(&r.field))
                ),
            ));
        }
        if !ds.fields.iter().any(|(name, _)| name == &r.field) {
            pending.push((dsname.as_ref().unwrap().clone(), r.field.clone()));
        }
    }
    usep(used, &at(&fp, "name"));
    usep(used, &at(&fp, "expression"));
    if text(get(qv, "name")).is_some() {
        usep(used, &at(qp, "name"))
    }
    usep(used, &at(&at(qp, "query"), "datasetName"));
    if matches!(get(query, "disaggregated"), Some(Value::Bool(_))) {
        usep(used, &at(&at(qp, "query"), "disaggregated"))
    }
    Ok((ds.id.clone(), ids_data.to_owned(), r))
}

fn query_info(
    qv: &Value,
    qp: &str,
    datasets: &BTreeMap<String, Dataset>,
    used: &mut BTreeSet<String>,
) -> Result<(String, String), Skip> {
    let query = get(qv, "query");
    if matches!(query, Some(Value::Object(_))) && !has(query.unwrap(), "datasetName") {
        return Err(Skip::new(qp.into(),"LAKEVIEW_RELATIONSHIP","Query names no dataset; it reads relationship-graph sources, which have no neutral form"));
    }
    let raw_name = query.and_then(|v| get(v, "datasetName"));
    let name = raw_name.and_then(|v| text(Some(v)));
    let Some(ds) = name.as_ref().and_then(|name| datasets.get(name)) else {
        return Err(Skip::new(
            qp.into(),
            "LAKEVIEW_PROJECTION",
            format!(
                "Query reads dataset {} which is not projected",
                json_or_undefined(raw_name)
            ),
        ));
    };
    if text(get(qv, "name")).is_some() {
        usep(used, &at(qp, "name"))
    }
    if let Some(query) = query {
        usep(used, &at(&at(qp, "query"), "datasetName"));
        if matches!(get(query, "disaggregated"), Some(Value::Bool(_))) {
            usep(used, &at(&at(qp, "query"), "disaggregated"))
        }
    }
    Ok((name.unwrap_or_default(), ds.id.clone()))
}

fn widget(
    item: &Value,
    path: &str,
    scale: f64,
    ids_data: &str,
    datasets: &mut BTreeMap<String, Dataset>,
    used: &mut BTreeSet<String>,
    issues: &mut Vec<Value>,
) -> Result<Option<Value>, Skip> {
    let mut pending = Vec::new();
    let w = get(item, "widget").unwrap_or(&Value::Null);
    let wp = at(path, "widget");
    let pos = get(item, "position").unwrap_or(&Value::Null);
    let mut position = None;
    let keys = ["x", "y", "width", "height"];
    if keys
        .iter()
        .all(|k| num(get(pos, k)).is_some_and(|n| n.fract() == 0.))
    {
        let mut p = Vec::new();
        for k in keys {
            let n = num(get(pos, k)).unwrap();
            p.push((
                k,
                num_value(if k == "x" || k == "width" {
                    n * scale
                } else {
                    n
                }),
            ));
            usep(used, &at(&at(path, "position"), k))
        }
        position = Some(obj(p))
    }
    if text(get(w, "name")).is_some() {
        usep(used, &at(&wp, "name"))
    }
    if let Some(lines) = get(
        get(w, "multilineTextboxSpec").unwrap_or(&Value::Null),
        "lines",
    ) {
        if position.is_some()
            && matches!(lines,Value::Array(a) if a.iter().all(|x|matches!(x,Value::String(_))))
        {
            usep(used, &at(&at(&wp, "multilineTextboxSpec"), "lines"));
            let text_units = arr(Some(lines))
                .iter()
                .filter_map(|value| match value {
                    Value::String(text) => Some(text.units()),
                    _ => None,
                })
                .flatten()
                .copied()
                .collect::<Vec<_>>();
            return Ok(Some(obj(vec![
                ("kind", s("text")),
                (
                    "content",
                    obj(vec![
                        ("format", s("markdown")),
                        ("text", Value::String(Utf16::new(text_units))),
                    ]),
                ),
                ("position", position.unwrap()),
            ])));
        }
    }
    if let Some(Value::String(txt)) = get(w, "textbox_spec") {
        if let Some(p) = position {
            usep(used, &at(&wp, "textbox_spec"));
            return Ok(Some(obj(vec![
                ("kind", s("text")),
                (
                    "content",
                    obj(vec![
                        ("format", s("markdown")),
                        ("text", Value::String(txt.clone())),
                    ]),
                ),
                ("position", p),
            ])));
        }
    }
    let spec = get(w, "spec").unwrap_or(&Value::Null);
    let Some(position) = position else {
        return Ok(None);
    };
    if !matches!(spec, Value::Object(_)) {
        return Ok(None);
    }
    let typ = text(get(spec, "widgetType")).unwrap_or_default();
    let chart = [
        "counter", "bar", "line", "area", "scatter", "pie", "heatmap", "table",
    ]
    .contains(&typ.as_str());
    let control = own(
        &[
            ("filter-single-select", "single-select"),
            ("filter-multi-select", "multi-select"),
            ("filter-date-range-picker", "date-range"),
            ("filter-text-entry", "text-search"),
            ("filter-range-slider", "range"),
        ],
        Some(typ.clone()),
    );
    if !chart && control.is_none() {
        issue(issues,used,wp.clone(),"LAKEVIEW_WIDGET_TYPE","unsupported",format!("Widget type {} version {} has no neutral chart family; only the native payload is retained",json_or_undefined(get(spec,"widgetType")),json_or_undefined(get(spec,"version"))),true);
        return Ok(None);
    }
    let sp = at(&wp, "spec");
    let queries = arr(get(w, "queries"));
    let enc = get(spec, "encodings").unwrap_or(&Value::Null);
    let ep = at(&sp, "encodings");
    let frame = get(spec, "frame").unwrap_or(&Value::Null);
    let fp = at(&sp, "frame");
    usep(used, &at(&sp, "widgetType"));
    usep(used, &at(&sp, "version"));
    if text(get(frame, "title")).is_some() {
        usep(used, &at(&fp, "title"))
    }
    if text(get(frame, "description")).is_some() {
        usep(used, &at(&fp, "description"))
    }
    for key in ["showTitle", "showDescription"] {
        match get(frame, key) {
            Some(Value::Bool(true)) => usep(used, &at(&fp, key)),
            Some(Value::Bool(false)) => issue(
                issues,
                used,
                at(&fp, key),
                "LAKEVIEW_STYLE",
                "annotation-only",
                if key == "showTitle" {
                    "Title is hidden natively"
                } else {
                    "Description is hidden natively"
                }
                .into(),
                true,
            ),
            _ => (),
        }
    }
    for key in ["headerAlignment"] {
        if let Some(v) = get(frame, key) {
            issue(
                issues,
                used,
                at(&fp, key),
                "LAKEVIEW_STYLE",
                "annotation-only",
                format!("Header alignment {} is not declared", json(v)),
                true,
            )
        }
    }
    let presentation = [
        "withRowNumber",
        "paginationSize",
        "itemsPerPage",
        "condensed",
        "allowHTMLByDefault",
        "bandedRows",
        "invisibleColumns",
    ]
    .iter()
    .filter(|k| has(spec, k))
    .copied()
    .collect::<Vec<_>>();
    for key in &presentation {
        usep(used, &at(&sp, key));
    }
    if !presentation.is_empty() {
        issue(
            issues,
            used,
            sp.clone(),
            "LAKEVIEW_STYLE",
            "annotation-only",
            format!(
                "Renderer options {} are not declared",
                presentation.join(", ")
            ),
            false,
        )
    }
    for (i, qv) in queries.iter().enumerate() {
        let qp = at(&at(&wp, "queries"), &i.to_string());
        let base = at(&qp, "query");
        let query = get(qv, "query").unwrap_or(&Value::Null);
        for (j, f) in arr(get(query, "filters")).iter().enumerate() {
            let value = get(f, "expression")
                .filter(|v| !matches!(v, Value::Null))
                .map(js_string)
                .unwrap_or_else(|| json(f));
            issue(issues,used,at(&at(&base,"filters"),&j.to_string()),"LAKEVIEW_QUERY_FILTER","unsupported",format!("Widget-level filter {value} narrows only this native widget; the neutral item is broader"),true)
        }
        for (j, o) in arr(get(query, "orders")).iter().enumerate() {
            issue(
                issues,
                used,
                at(&at(&base, "orders"), &j.to_string()),
                "LAKEVIEW_ORDER_BY",
                "unsupported",
                format!(
                    "Query order {} {} is not declared on the neutral item",
                    text(get(o, "expression")).unwrap_or_default(),
                    text(get(o, "direction")).unwrap_or_default()
                ),
                true,
            )
        }
        for (j, p) in arr(get(query, "parameters")).iter().enumerate() {
            issue(
                issues,
                used,
                at(&at(&base, "parameters"), &j.to_string()),
                "LAKEVIEW_PARAMETER",
                "unsupported",
                format!(
                    "Query binds parameter {}; parameters have no neutral form",
                    nullish_json_or_undefined(get(p, "keyword"), get(p, "name"))
                ),
                true,
            )
        }
    }
    if let Some(name) = text(get(get(spec, "data").unwrap_or(&Value::Null), "queryName")) {
        if queries
            .iter()
            .any(|q| text(get(q, "name")).as_deref() == Some(&name))
        {
            usep(used, &at(&at(&sp, "data"), "queryName"))
        }
    }
    let description = if let Some(v) = text(get(frame, "description")) {
        vec![("description", q(&v))]
    } else {
        Vec::new()
    };
    let out = if chart {
        if queries.len() != 1 {
            return Err(Skip::new(
                wp,
                "LAKEVIEW_PROJECTION",
                format!(
                    "A visual widget with {} queries has no single neutral dataset",
                    queries.len()
                ),
            ));
        }
        let qv = &queries[0];
        let qpath = at(&wp, "queries");
        let (_, resolved_dataset_id) = query_info(qv, &at(&qpath, "0"), datasets, used)?;
        let mut encodings = Vec::new();
        let channel_map = [
            ("x", "x"),
            ("y", "y"),
            ("color", "color"),
            ("size", "size"),
            ("label", "label"),
            ("value", "value"),
            ("target", "target"),
            ("angle", "angle"),
            ("extra", "tooltip"),
            ("columns", "column"),
        ];
        for (k, val) in pairs(enc) {
            let native = utf(k);
            let Some(ch) = channel_map
                .iter()
                .find(|(x, _)| *x == native)
                .map(|(_, v)| *v)
            else {
                continue;
            };
            let kp = at(&ep, &native);
            let entries: Vec<(Value, String, Value)> = if let Value::Array(a) = val {
                a.iter()
                    .enumerate()
                    .map(|(i, x)| (x.clone(), at(&kp, &i.to_string()), x.clone()))
                    .collect()
            } else if let Some(fs) = get(val, "fields").and_then(|x| {
                if let Value::Array(a) = x {
                    Some(a)
                } else {
                    None
                }
            }) {
                fs.iter()
                    .enumerate()
                    .map(|(i, x)| {
                        (
                            x.clone(),
                            at(&at(&kp, "fields"), &i.to_string()),
                            val.clone(),
                        )
                    })
                    .collect()
            } else {
                vec![(val.clone(), kp.clone(), val.clone())]
            };
            for (e, p, shared) in entries {
                let Some(fieldname) = text(get(&e, "fieldName")) else {
                    issue(
                        issues,
                        used,
                        p.clone(),
                        "LAKEVIEW_STYLE",
                        "annotation-only",
                        format!(
                            "Encoding {native} without a field ({}) is presentation only",
                            json(&e)
                        ),
                        true,
                    );
                    continue;
                };
                if ch == "column" && matches!(get(&e, "visible"), Some(Value::Bool(false))) {
                    issue(
                        issues,
                        used,
                        p.clone(),
                        "LAKEVIEW_STYLE",
                        "annotation-only",
                        format!(
                            "Hidden table column {} is not declared",
                            json(&q(&fieldname))
                        ),
                        true,
                    );
                    continue;
                }
                if ch == "column" && matches!(get(&e, "visible"), Some(Value::Bool(true))) {
                    usep(used, &at(&p, "visible"))
                }
                if has(&e, "style") {
                    issue(
                        issues,
                        used,
                        at(&p, "style"),
                        "LAKEVIEW_STYLE",
                        "annotation-only",
                        format!(
                            "Conditional or text styling of {} is not declared",
                            json(&q(&fieldname))
                        ),
                        true,
                    )
                }
                let (ds_id, _, r) = query_field(
                    qv,
                    &at(&qpath, "0"),
                    &fieldname,
                    datasets,
                    ids_data,
                    used,
                    issues,
                    &mut pending,
                )?;
                usep(used, &at(&p, "fieldName"));
                let mut enc = vec![
                    ("channel", q(ch)),
                    ("field", q(&r.field)),
                    ("aggregation", q(&r.agg)),
                ];
                if let Some(x) = r.expression {
                    enc.push((
                        "expression",
                        obj(vec![("language", s("databricks-sql")), ("text", q(&x))]),
                    ))
                }
                if let Some(t) = text(get(&e, "displayName")) {
                    enc.push(("title", q(&t)));
                    usep(used, &at(&p, "displayName"))
                }
                let shared_path = if shared == e { p.clone() } else { kp.clone() };
                enc.extend(scale_of(
                    get(&shared, "scale"),
                    &at(&shared_path, "scale"),
                    &native,
                    issues,
                    used,
                ));
                if let Some(f) = format_of(
                    get(&shared, "format"),
                    &at(&shared_path, "format"),
                    issues,
                    used,
                ) {
                    enc.push(("format", f))
                }
                if ch == "column" {
                    let rest = pairs(&e)
                        .iter()
                        .map(|(k, _)| utf(k))
                        .filter(|k| {
                            !["fieldName", "displayName", "format", "scale", "visible"]
                                .contains(&k.as_str())
                        })
                        .collect::<Vec<_>>();
                    if !rest.is_empty() {
                        for key in &rest {
                            usep(used, &at(&p, key))
                        }
                        issue(
                            issues,
                            used,
                            p.clone(),
                            "LAKEVIEW_STYLE",
                            "annotation-only",
                            format!(
                                "Table column presentation options {} are not declared",
                                rest.join(", ")
                            ),
                            false,
                        )
                    }
                }
                encodings.push(obj(enc));
                let _ = ds_id;
            }
        }
        let first_query = get(qv, "query").unwrap_or(&Value::Null);
        let mut out = vec![("kind", s("visual"))];
        if let Some(t) = text(get(frame, "title")).or_else(|| text(get(w, "name"))) {
            out.push(("title", q(&t)))
        }
        out.extend(description);
        out.push(("chart", q(&typ)));
        out.push((
            "dataset",
            obj(vec![
                ("module", q(ids_data)),
                ("element", q(&resolved_dataset_id)),
            ]),
        ));
        if truth(get(first_query, "disaggregated")) {
            out.push(("rows", s("detail")))
        }
        out.push(("encodings", Value::Array(encodings)));
        out.push(("position", position));
        obj(out)
    } else {
        // Filter fields resolve named queries to plain dataset columns and de-duplicate targets.
        let mut targets = Vec::new();
        let mut seen = BTreeSet::new();
        let mut label = None;
        for (i, e) in arr(get(enc, "fields")).iter().enumerate() {
            let p = at(&at(&ep, "fields"), &i.to_string());
            if has(e, "parameterName") {
                issue(
                    issues,
                    used,
                    p.clone(),
                    "LAKEVIEW_PARAMETER",
                    "unsupported",
                    format!(
                        "Filter binds query parameter {}; parameter filters have no neutral form",
                        json(get(e, "parameterName").unwrap())
                    ),
                    true,
                );
                continue;
            }
            let Some(qname) = text(get(e, "queryName")) else {
                continue;
            };
            let Some(qi) = queries
                .iter()
                .position(|q| text(get(q, "name")).as_deref() == Some(&qname))
            else {
                continue;
            };
            let Some(fname) = text(get(e, "fieldName")) else {
                continue;
            };
            let (ds_id, _, r) = query_field(
                &queries[qi],
                &at(&at(&wp, "queries"), &qi.to_string()),
                &fname,
                datasets,
                ids_data,
                used,
                issues,
                &mut pending,
            )?;
            if r.agg != "none" || r.derived {
                return Err(Skip::new(
                    p,
                    "LAKEVIEW_EXPRESSION",
                    format!("Filter field {} is not a plain column", json(&q(&fname))),
                ));
            }
            usep(used, &at(&p, "fieldName"));
            usep(used, &at(&p, "queryName"));
            if let Some(n) = text(get(e, "displayName")) {
                usep(used, &at(&p, "displayName"));
                if label.is_none() {
                    label = Some(n)
                }
            }
            let target_key = element_key(&ds_id, &r.field);
            if seen.insert(target_key) {
                targets.push(obj(vec![
                    (
                        "dataset",
                        obj(vec![("module", q(ids_data)), ("element", q(&ds_id))]),
                    ),
                    ("field", q(&r.field)),
                ]))
            }
        }
        for (i, qv) in queries.iter().enumerate() {
            for (j, f) in arr(get(get(qv, "query").unwrap_or(&Value::Null), "fields"))
                .iter()
                .enumerate()
            {
                if text(get(f, "expression")).as_deref()
                    == Some("COUNT_IF(`associative_filter_predicate_group`)")
                {
                    issue(issues,used,at(&at(&at(&at(&at(&wp,"queries"),&i.to_string()),"query"),"fields"),&j.to_string()),"LAKEVIEW_FILTER_ASSOCIATIVITY","annotation-only","Associative value narrowing between filters is platform interactivity with no neutral form".into(),true)
                }
            }
        }
        if targets.is_empty() {
            return Err(Skip::new(
                wp,
                "LAKEVIEW_PROJECTION",
                "Filter has no dataset column target",
            ));
        }
        let mut out = vec![("kind", s("filter"))];
        if let Some(t) = text(get(frame, "title"))
            .or(label)
            .or_else(|| text(get(w, "name")))
        {
            out.push(("title", q(&t)))
        }
        out.extend(description);
        out.push(("control", q(&control.unwrap())));
        out.push(("targets", Value::Array(targets)));
        out.push(("position", position));
        let selection = get(
            get(spec, "selection").unwrap_or(&Value::Null),
            "defaultSelection",
        )
        .unwrap_or(&Value::Null);
        let dp = at(&sp, "selection");
        let dp = at(&dp, "defaultSelection");
        let defaults =
            get(get(selection, "values").unwrap_or(&Value::Null), "values").and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a.as_slice())
                } else {
                    None
                }
            });
        if let Some(defaults) = defaults.filter(|defaults| {
            defaults
                .iter()
                .any(|v| matches!(get(v, "value"), Some(Value::Number(_))))
        }) {
            issue(issues,used,at(&dp,"values"),"LAKEVIEW_FILTER_DEFAULT","unsupported","Numeric default precision cannot be verified from parsed JavaScript values; the complete default selection is omitted".into(),true)
        } else if let Some(defaults) = defaults.filter(|defaults| {
            defaults
                .iter()
                .all(|v| matches!(get(v, "value"), Some(Value::String(_) | Value::Bool(_))))
        }) {
            let values = defaults
                .iter()
                .map(|v| get(v, "value").unwrap().clone())
                .collect::<Vec<_>>();
            out.push(("default", obj(vec![("values", Value::Array(values))])));
            for (i, _) in defaults.iter().enumerate() {
                usep(
                    used,
                    &at(
                        &at(&at(&at(&dp, "values"), "values"), &i.to_string()),
                        "value",
                    ),
                )
            }
            if text(get(
                get(selection, "values").unwrap_or(&Value::Null),
                "dataType",
            ))
            .is_some()
            {
                usep(used, &at(&at(&dp, "values"), "dataType"))
            }
        } else if has(selection, "range") {
            issue(
                issues,
                used,
                at(&dp, "range"),
                "LAKEVIEW_FILTER_DEFAULT",
                "unsupported",
                format!(
                    "Range default {} has no neutral form",
                    json(get(selection, "range").unwrap())
                ),
                true,
            )
        }
        obj(out)
    };
    for (dataset_name, field_name) in pending {
        if let Some(ds) = datasets.get_mut(&dataset_name) {
            if !ds.fields.iter().any(|(name, _)| name == &field_name) {
                ds.fields
                    .push((field_name, obj(vec![("role", s("column"))])))
            }
        }
    }
    Ok(Some(out))
}

/// Project a parsed JavaScript Lakeview value without treating its numeric tokens as exact.
pub fn project(
    view: &Value,
    ids: &Value,
    title: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    validate_utf16(ids)?;
    let mut issues = Vec::new();
    let mut used = BTreeSet::new();
    let mut modules: Vec<(String, Value)> = Vec::new();
    let mut elements: Vec<(String, Value)> = Vec::new();
    let data = text(get(ids, "data")).unwrap_or_default();
    let datasets_ids = arr(get(ids, "datasets"));
    let page_ids = arr(get(ids, "pages"));
    let mut datasets: BTreeMap<String, Dataset> = BTreeMap::new();
    let mut declared: Vec<(String, usize, Value)> = Vec::new();
    for (i, ds) in arr(get(view, "datasets")).iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        let path = at("/datasets", &i.to_string());
        let Some(name) = text(get(ds, "name")) else {
            continue;
        };
        usep(&mut used, &at(&path, "name"));
        let mut fields: Vec<(String, Value)> = Vec::new();
        let source = if let Some(lines) = get(ds, "queryLines")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            })
            .filter(|a| a.iter().all(|v| matches!(v, Value::String(_))))
        {
            usep(&mut used, &at(&path, "queryLines"));
            Some(Utf16::new(
                lines
                    .iter()
                    .flat_map(|v| st(Some(v)).unwrap().units().iter().copied())
                    .collect(),
            ))
        } else if let Some(Value::String(q)) = get(ds, "query") {
            usep(&mut used, &at(&path, "query"));
            Some(q.clone())
        } else {
            None
        };
        if text(get(ds, "displayName")).is_some() {
            usep(&mut used, &at(&path, "displayName"))
        }
        for key in ["catalog", "schema"] {
            if let Some(v) = get(ds, key) {
                issue(&mut issues,&mut used,at(&path,key),"LAKEVIEW_DATASET_CONTEXT","unsupported",format!("Default {key} {} resolves unqualified names in the query; the neutral query text does not carry it",json(v)),true)
            }
        }
        for (j, p) in arr(get(ds, "parameters")).iter().enumerate() {
            issue(
                &mut issues,
                &mut used,
                at(&at(&path, "parameters"), &j.to_string()),
                "LAKEVIEW_PARAMETER",
                "unsupported",
                format!(
                    "Dataset parameter {} has no neutral form",
                    nullish_json_or_undefined(get(p, "keyword"), get(p, "displayName"))
                ),
                true,
            )
        }
        for (j, c) in arr(get(ds, "columns")).iter().enumerate() {
            let Some(n) = text(get(c, "displayName")) else {
                continue;
            };
            let Some(expr) = text(get(c, "expression")) else {
                continue;
            };
            let cp = at(&at(&path, "columns"), &j.to_string());
            let mut measure = vec![("role", s("measure"))];
            if let Some(desc) = text(get(c, "description")) {
                measure.push(("description", q(&desc)));
            }
            measure.push((
                "expression",
                obj(vec![("language", s("databricks-sql")), ("text", q(&expr))]),
            ));
            let f = obj(measure);
            if let Some((_, old)) = fields.iter_mut().find(|(name, _)| name == &n) {
                *old = f
            } else {
                fields.push((n, f))
            }
            usep(&mut used, &at(&cp, "displayName"));
            usep(&mut used, &at(&cp, "expression"));
            if text(get(c, "description")).is_some() {
                usep(&mut used, &at(&cp, "description"))
            }
        }
        let Some(source) = source else {
            issue(
                &mut issues,
                &mut used,
                path,
                "LAKEVIEW_PROJECTION",
                "unsupported",
                "Dataset declares no query; it is not projected".into(),
                false,
            );
            continue;
        };
        let Some(id) = datasets_ids.get(i).and_then(|v| text(Some(v))) else {
            continue;
        };
        let field_obj = Value::Object(
            fields
                .iter()
                .map(|(k, v)| (Utf16::from(k.as_str()), v.clone()))
                .collect(),
        );
        let payload = obj(vec![
            ("kind", s("dataset")),
            (
                "title",
                q(&text(get(ds, "displayName")).unwrap_or_else(|| name.clone())),
            ),
            (
                "source",
                obj(vec![
                    ("kind", s("query")),
                    (
                        "query",
                        obj(vec![
                            ("language", s("databricks-sql")),
                            ("text", Value::String(source)),
                        ]),
                    ),
                ]),
            ),
            ("fields", field_obj),
        ]);
        datasets.insert(
            name,
            Dataset {
                id: id.clone(),
                fields,
            },
        );
        declared.push((id, i, payload));
    }
    let pages = arr(get(view, "pages"));
    let twelve = pages.iter().any(|p| has(p, "layoutVersion"));
    let columns = if twelve { 12.0 } else { 6.0 };
    for (i, p) in pages.iter().enumerate() {
        let Some(pid) = page_ids.get(i).and_then(|p| text(get(p, "id"))) else {
            continue;
        };
        let path = at("/pages", &i.to_string());
        let mut scale = 1.0;
        if text(get(p, "name")).is_some() {
            usep(&mut used, &at(&path, "name"))
        }
        if text(get(p, "displayName")).is_some() {
            usep(&mut used, &at(&path, "displayName"))
        }
        if ["PAGE_TYPE_CANVAS", "PAGE_TYPE_GLOBAL_FILTERS"]
            .contains(&text(get(p, "pageType")).unwrap_or_default().as_str())
        {
            usep(&mut used, &at(&path, "pageType"))
        }
        if text(get(p, "layoutVersion")).as_deref() == Some("GRID_V1") {
            usep(&mut used, &at(&path, "layoutVersion"))
        } else if !has(p, "layoutVersion") && twelve {
            scale = 2.0;
            issue(&mut issues,&mut used,path.clone(),"LAKEVIEW_GRID","representation-change","Six-column legacy page doubled horizontally into the twelve-column document grid; vertical units are kept".into(),false)
        }
        ordered_set(
            &mut modules,
            pid.clone(),
            obj(vec![
                ("kind", s("page")),
                (
                    "title",
                    q(&text(get(p, "displayName")).unwrap_or_else(|| pid.clone())),
                ),
                (
                    "role",
                    s(
                        if text(get(p, "pageType")).as_deref() == Some("PAGE_TYPE_GLOBAL_FILTERS") {
                            "global-filters"
                        } else {
                            "canvas"
                        },
                    ),
                ),
            ]),
        );
        for (j, item) in arr(get(p, "layout")).iter().enumerate() {
            let ip = at(&at(&path, "layout"), &j.to_string());
            match widget(
                item,
                &ip,
                scale,
                &data,
                &mut datasets,
                &mut used,
                &mut issues,
            ) {
                Ok(Some(payload)) => {
                    if let Some(id) = page_ids
                        .get(i)
                        .and_then(|x| arr(get(x, "items")).get(j))
                        .and_then(|x| text(Some(x)))
                    {
                        ordered_set(&mut elements, element_key(&pid, &id), payload)
                    }
                }
                Ok(None) => {}
                Err(e) => {
                    issue(
                        &mut issues,
                        &mut used,
                        e.path,
                        e.code,
                        "unsupported",
                        format!("{}; the widget is not projected", e.detail),
                        true,
                    );
                    usep(&mut used, &at(&ip, "widget"));
                    usep(&mut used, &at(&ip, "position"));
                }
            }
        }
    }
    ordered_set(&mut modules, data.clone(), obj(vec![("kind", s("data"))]));
    for (id, index, mut payload) in declared {
        let ds = datasets.values().find(|d| d.id == id);
        let original_fields = pairs(get(&payload, "fields").unwrap())
            .iter()
            .map(|(k, v)| (utf(k), v.clone()))
            .collect::<Vec<_>>();
        let fs = ds.map(|d| d.fields.as_slice()).unwrap_or(&original_fields);
        if let Value::Object(ref mut p) = payload {
            if let Some((_, v)) = p.iter_mut().find(|(k, _)| k == &Utf16::from("fields")) {
                *v = Value::Object(
                    fs.iter()
                        .map(|(k, v)| (Utf16::from(k.as_str()), v.clone()))
                        .collect(),
                )
            }
        }
        if !fs.is_empty() {
            ordered_set(&mut elements, element_key(&data, &id), payload)
        } else {
            let index = datasets_ids
                .iter()
                .position(|v| text(Some(v)).as_deref() == Some(&id))
                .unwrap_or(index);
            issue(&mut issues,&mut used,format!("/datasets/{index}"),"LAKEVIEW_PROJECTION","unsupported","No projected item uses a field of this dataset, and the profile requires at least one; it is not projected".into(),false)
        }
    }
    let mut theme_fields = Vec::new();
    let theme_path = "/uiSettings/theme";
    let theme =
        get(get(view, "uiSettings").unwrap_or(&Value::Null), "theme").unwrap_or(&Value::Null);
    let mut roles = Vec::new();
    if let Some(f) = text(get(theme, "fontFamily")) {
        theme_fields.push(("fontFamily", q(&f)));
        usep(&mut used, &at(theme_path, "fontFamily"))
    }
    let base =
        get(get(theme, "fontSettings").unwrap_or(&Value::Null), "base").unwrap_or(&Value::Null);
    let bp = at(&at(theme_path, "fontSettings"), "base");
    if theme_fields.iter().all(|(k, _)| *k != "fontFamily") {
        if let Some(f) = text(get(base, "fontFamily")) {
            theme_fields.push(("fontFamily", q(&f)));
            usep(&mut used, &at(&bp, "fontFamily"))
        }
    }
    if get(base, "fontColor").is_some() && !has(theme, "fontColor") {
        let mut c = Vec::new();
        for mode in ["light", "dark"] {
            if let Some(color) = valid_hex(get(get(base, "fontColor").unwrap(), mode)) {
                c.push((mode, q(&color)));
                usep(&mut used, &at(&at(&bp, "fontColor"), mode))
            }
        }
        if !c.is_empty() {
            roles.push(("font", obj(c)))
        }
    }
    if let Some(colors) = get(theme, "visualizationColors").and_then(|v| {
        if let Value::Array(a) = v {
            Some(a)
        } else {
            None
        }
    }) {
        if !colors.is_empty() && colors.iter().all(|v| valid_hex(Some(v)).is_some()) {
            theme_fields.push(("palette", Value::Array(colors.clone())));
            usep(&mut used, &at(theme_path, "visualizationColors"))
        }
    }
    for (native, role) in [
        ("canvasBackgroundColor", "canvasBackground"),
        ("widgetBackgroundColor", "widgetBackground"),
        ("widgetBorderColor", "widgetBorder"),
        ("fontColor", "font"),
        ("selectionColor", "selection"),
    ] {
        let mut c = Vec::new();
        for mode in ["light", "dark"] {
            if let Some(color) = valid_hex(get(get(theme, native).unwrap_or(&Value::Null), mode)) {
                c.push((mode, q(&color)));
                usep(&mut used, &at(&at(theme_path, native), mode))
            }
        }
        if !c.is_empty() {
            roles.push((role, obj(c)))
        }
    }
    if !roles.is_empty() {
        theme_fields.push(("roles", obj(roles)))
    }
    for key in ["widgetHeaderAlignment", "widgetCornerRadius"] {
        if let Some(v) = get(theme, key) {
            issue(
                &mut issues,
                &mut used,
                at(theme_path, key),
                "LAKEVIEW_STYLE",
                "annotation-only",
                format!("Theme setting {key}={} is not declared", json(v)),
                true,
            )
        }
    }
    let mut root_fields = vec![
        ("kind", s("dashboard")),
        ("title", Value::String(title.clone())),
        (
            "pages",
            Value::Array(
                page_ids
                    .iter()
                    .filter_map(|p| text(get(p, "id")).map(|x| q(&x)))
                    .collect(),
            ),
        ),
        ("layout", obj(vec![("columns", num_value(columns))])),
    ];
    if !theme_fields.is_empty() {
        root_fields.push(("theme", obj(theme_fields)))
    }
    let root = obj(root_fields);
    if has(view, "relationshipGraphs") {
        issue(
            &mut issues,
            &mut used,
            "/relationshipGraphs".into(),
            "LAKEVIEW_RELATIONSHIP",
            "unsupported",
            "Dataset relationship graphs have no neutral form".into(),
            true,
        )
    }
    let mut touched = BTreeSet::new();
    for p in &used {
        let mut q = p.as_str();
        while let Some(i) = q.rfind('/') {
            q = &q[..i];
            touched.insert(q.to_owned());
        }
    }
    scan_unknown(view, "", &used, &touched, &mut issues, ctx)?;
    let pair_array = |v: Vec<(String, Value)>| {
        Value::Array(
            v.into_iter()
                .map(|(k, v)| Value::Array(vec![q(&k), v]))
                .collect(),
        )
    };
    Ok(obj(vec![
        ("root", root),
        ("modules", pair_array(modules)),
        ("elements", pair_array(elements)),
        ("issues", Value::Array(issues)),
    ]))
}

fn validate_utf16(value: &Value) -> Result<(), EngineError> {
    match value {
        Value::String(s) => {
            s.to_utf8().map_err(|_| {
                EngineError::new(
                    "LAKEVIEW_PROJECTION",
                    Utf16::default(),
                    "Legacy projection requires UTF-8 text values and keys",
                )
            })?;
        }
        Value::Array(a) => {
            for x in a {
                validate_utf16(x)?
            }
        }
        Value::Object(m) => {
            for (k, v) in m {
                k.to_utf8().map_err(|_| {
                    EngineError::new(
                        "LAKEVIEW_PROJECTION",
                        Utf16::default(),
                        "Legacy projection requires UTF-8 text values and keys",
                    )
                })?;
                validate_utf16(v)?
            }
        }
        _ => (),
    }
    Ok(())
}

fn scan_unknown(
    value: &Value,
    path: &str,
    used: &BTreeSet<String>,
    touched: &BTreeSet<String>,
    issues: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if used.contains(path) {
        return Ok(());
    }
    if !touched.contains(path) {
        unmapped_issue(issues, Utf16::from(path), value);
        return Ok(());
    }
    for (k, v) in pairs(value) {
        ctx.charge_work(1, Utf16::default())?;
        let child = pointer_utf16(&Utf16::from(path), k);
        match child.to_utf8() {
            Ok(child) => scan_unknown(v, &child, used, touched, issues, ctx)?,
            Err(_) => unmapped_issue(issues, child, v),
        }
    }
    if let Value::Array(a) = value {
        for (i, v) in a.iter().enumerate() {
            ctx.charge_work(1, Utf16::default())?;
            scan_unknown(v, &at(path, &i.to_string()), used, touched, issues, ctx)?
        }
    }
    Ok(())
}

fn unmapped_issue(issues: &mut Vec<Value>, path: Utf16, value: &Value) {
    let detail = "Native content "
        .encode_utf16()
        .chain(json(value).encode_utf16().take(120))
        .chain(" is retained but not expressed by the neutral declaration".encode_utf16())
        .collect();
    issue_utf16(
        issues,
        path,
        "LAKEVIEW_UNMAPPED",
        "unsupported",
        Utf16::new(detail),
    );
}

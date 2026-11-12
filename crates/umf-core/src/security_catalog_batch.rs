// SPDX-License-Identifier: MIT OR Apache-2.0
//! Assemble the private logical-catalog receipt into the V2 wire batch.
use crate::{
    context::Context,
    error::EngineError,
    value::{Utf16, Value},
};

fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    if let Value::Object(xs) = v {
        xs.iter()
            .find(|(key, _)| key == &Utf16::from(k))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn arr(v: Option<&Value>) -> Result<&[Value], EngineError> {
    match v {
        Some(Value::Array(xs)) => Ok(xs),
        _ => Err(bad()),
    }
}
fn text(v: Option<&Value>) -> Result<&Utf16, EngineError> {
    match v {
        Some(Value::String(s)) => Ok(s),
        _ => Err(bad()),
    }
}
fn obj(xs: Vec<(&str, Value)>) -> Value {
    Value::Object(xs.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect())
}
fn s(x: &str) -> Value {
    Value::string_utf8(x)
}
fn bad() -> EngineError {
    EngineError::new(
        "SECURITY_CATALOG_BATCH",
        Utf16::default(),
        "V2 catalog batch assembly refused",
    )
}
fn index(v: Option<&Value>) -> Result<usize, EngineError> {
    match v {
        Some(Value::Number(n))
            if n.is_finite() && n.fract() == 0.0 && *n >= 0.0 && *n <= 1_000_000.0 =>
        {
            Ok(*n as usize)
        }
        _ => Err(bad()),
    }
}
fn same_ref(a: Option<&Value>, b: Option<&Value>) -> bool {
    let (Some(a), Some(b)) = (a, b) else {
        return false;
    };
    ["documentId", "moduleId", "elementId"]
        .iter()
        .all(|key| text(get(a, key)).ok() == text(get(b, key)).ok())
}
fn occurrence_equal(a: &Value, b: &Value) -> bool {
    get(a, "ruleIndex") == get(b, "ruleIndex")
        && get(a, "disclosureIndex") == get(b, "disclosureIndex")
}

/// `input` is an admitted candidate receipt and rendered row matrix. This
/// function owns V2 cell projection and the final receipt/batch envelope.
pub fn assemble_candidate_disclosure_batch(
    input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let policy = get(input, "policy").ok_or_else(bad)?;
    let catalog = get(input, "catalog").ok_or_else(bad)?;
    let domains = arr(get(input, "domains"))?;
    let columns = arr(get(input, "columns"))?;
    let decisions = arr(get(input, "decisions"))?;
    let resources = arr(get(input, "resources"))?;
    let rendered = arr(get(input, "rendered"))?;
    let profiles = arr(get(input, "profiles"))?;
    if columns.len() > 256
        || rendered.len() > 4096
        || rendered.len() != resources.len()
        || resources.len()
            != decisions
                .iter()
                .filter(|d| text(get(d, "decision")).ok() == Some(&Utf16::from("permit")))
                .count()
    {
        return Err(bad());
    }
    if rendered
        .iter()
        .map(|row| {
            arr(Some(row))
                .map(|cells| cells.len())
                .unwrap_or(usize::MAX)
        })
        .any(|n| n != columns.len())
    {
        return Err(bad());
    }
    let mut rows = Vec::with_capacity(rendered.len());
    for (ri, row) in rendered.iter().enumerate() {
        let cells = arr(Some(row))?;
        let trace = decisions
            .iter()
            .filter(|d| text(get(d, "decision")).ok() == Some(&Utf16::from("permit")))
            .nth(ri)
            .ok_or_else(bad)?;
        if get(trace, "resource") != Some(&resources[ri]) {
            return Err(bad());
        }
        let provenance = arr(get(trace, "dispositions"))?;
        if provenance.len() != columns.len() {
            return Err(bad());
        }
        let mut wire = Vec::with_capacity(cells.len());
        for (ci, cell) in cells.iter().enumerate() {
            ctx.charge_work(1, Utf16::default())?;
            let proof = &provenance[ci];
            if !same_ref(get(cell, "field"), get(&columns[ci], "field"))
                || !same_ref(get(cell, "field"), get(proof, "field"))
            {
                return Err(bad());
            }
            let disposition = text(get(cell, "disposition"))?;
            if disposition == &Utf16::from("withheld") || disposition == &Utf16::from("absent") {
                wire.push(obj(vec![(
                    "disposition",
                    Value::String(disposition.clone()),
                )]));
                continue;
            }
            let value = get(cell, "value").ok_or_else(bad)?.clone();
            if disposition == &Utf16::from("original") {
                wire.push(obj(vec![("disposition", s("original")), ("value", value)]));
                continue;
            }
            if disposition != &Utf16::from("transformed") {
                return Err(bad());
            }
            let d = get(proof, "disposition").ok_or_else(bad)?;
            if text(get(d, "kind"))? != &Utf16::from("transformed")
                || text(get(d, "vocabulary"))? != &Utf16::from("umf.security.protection")
            {
                return Err(bad());
            }
            let output = get(d, "field").ok_or_else(bad)?;
            if !same_ref(Some(output), get(cell, "outputType")) {
                return Err(bad());
            }
            let occurrence = get(proof, "selectedOccurrence")
                .filter(|v| !matches!(v, Value::Null))
                .ok_or_else(bad)?;
            let ri_sel = index(get(occurrence, "ruleIndex"))?;
            let di_sel = index(get(occurrence, "disclosureIndex"))?;
            let rules = arr(get(trace, "rules"))?;
            if !rules
                .iter()
                .any(|r| index(get(r, "ruleIndex")).ok() == Some(ri_sel))
            {
                return Err(bad());
            }
            let sources = arr(get(proof, "sourceOccurrences"))?;
            if !sources.iter().any(|o| occurrence_equal(o, occurrence)) {
                return Err(bad());
            }
            let transform = text(get(d, "transform"))?.clone();
            let version = text(get(d, "version"))?.clone();
            let profile = profiles
                .iter()
                .find(|p| same_ref(get(p, "field"), Some(output)))
                .and_then(|p| get(p, "profile"))
                .cloned();
            let mut fields = vec![
                ("disposition", s("transformed")),
                ("selection", occurrence.clone()),
                ("outputDomain", output.clone()),
                (
                    "transform",
                    obj(vec![
                        ("id", Value::String(transform)),
                        ("version", Value::String(version)),
                    ]),
                ),
                ("value", value),
            ];
            if let Some(profile) = profile {
                fields.push(("valueProfile", profile));
            }
            wire.push(obj(fields));
            let _ = di_sel;
        }
        rows.push(Value::Array(wire));
    }
    let batch = obj(vec![
        ("version", s("umf.security.disclosure/0.2.0")),
        ("policy", policy.clone()),
        ("protection", catalog.clone()),
        ("domains", Value::Array(domains.to_vec())),
        ("columns", Value::Array(columns.to_vec())),
        ("rows", Value::Array(rows)),
    ]);
    Ok(obj(vec![
        (
            "version",
            s("umf.security.logical-disclosure-batch/0.1-candidate"),
        ),
        ("status", s("rendered")),
        ("complete", Value::Bool(false)),
        ("authority", Value::Bool(false)),
        ("sources", get(input, "sources").ok_or_else(bad)?.clone()),
        ("decisions", Value::Array(decisions.to_vec())),
        ("resources", Value::Array(resources.to_vec())),
        ("batch", batch),
    ]))
}

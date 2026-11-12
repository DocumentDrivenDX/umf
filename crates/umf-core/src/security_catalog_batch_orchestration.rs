// SPDX-License-Identifier: MIT OR Apache-2.0
//! Admission and atomic composition for private logical-catalog batches.
use crate::{
    context::Context,
    error::EngineError,
    value::{Utf16, Value},
};
use std::collections::HashSet;

fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    if let Value::Object(xs) = v {
        xs.iter()
            .find(|(key, _)| key == &Utf16::from(k))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn array(v: Option<&Value>) -> Result<&[Value], EngineError> {
    match v {
        Some(Value::Array(xs)) => Ok(xs),
        _ => Err(bad()),
    }
}
fn string(v: Option<&Value>) -> Result<&Utf16, EngineError> {
    match v {
        Some(Value::String(s)) => Ok(s),
        _ => Err(bad()),
    }
}
fn number(v: Option<&Value>, min: usize, max: usize) -> Result<usize, EngineError> {
    match v {
        Some(Value::Number(n))
            if n.is_finite() && n.fract() == 0.0 && *n >= min as f64 && *n <= max as f64 =>
        {
            Ok(*n as usize)
        }
        _ => Err(bad()),
    }
}
fn bad() -> EngineError {
    EngineError::new(
        "SECURITY_CATALOG_BATCH",
        Utf16::default(),
        "Catalog batch admission or composition refused",
    )
}
fn shape(v: &Value, keys: &[&str]) -> Result<(), EngineError> {
    let Value::Object(xs) = v else {
        return Err(bad());
    };
    if xs.len() != keys.len()
        || keys.iter().any(|k| get(v, k).is_none())
        || xs
            .iter()
            .any(|(k, _)| !keys.iter().any(|known| k == &Utf16::from(*known)))
    {
        Err(bad())
    } else {
        Ok(())
    }
}
fn ref_valid(v: &Value) -> Result<(), EngineError> {
    shape(v, &["documentId", "moduleId", "elementId"])?;
    for k in ["documentId", "moduleId", "elementId"] {
        let s = string(get(v, k))?;
        if s.is_empty() {
            return Err(bad());
        }
    }
    Ok(())
}
fn same_ref(a: &Value, b: &Value) -> bool {
    ["documentId", "moduleId", "elementId"]
        .iter()
        .all(|k| string(get(a, k)).ok() == string(get(b, k)).ok())
}
fn id_valid(s: &Utf16, scan: bool) -> bool {
    let Ok(s) = s.to_utf8() else { return false };
    if scan {
        return s.len() <= 32
            && s.len() > 1
            && matches!(s.as_bytes()[0], b's' | b't')
            && s[1..].bytes().all(|b| b.is_ascii_digit());
    };
    s.len() <= 64
        && !s.is_empty()
        && s.as_bytes()[0].is_ascii_alphabetic()
        && s.bytes()
            .skip(1)
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}
fn object(xs: Vec<(&str, Value)>) -> Value {
    Value::Object(xs.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect())
}
fn result(admitted: bool, items: Vec<Value>, work: usize) -> Value {
    object(vec![
        ("admitted", Value::Bool(admitted)),
        ("items", Value::Array(items)),
        ("visitWork", Value::Number(work as f64)),
    ])
}

/// Validate operation occurrences and aggregate the same population the host
/// historically counted. `visitWork` is replayed into its shared ledger.
pub fn admit_operation_batch(input: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let ops = array(get(input, "operations"))?;
    let facts = array(get(input, "facts"))?;
    let graphs = array(get(input, "graphs"))?;
    let max = number(get(input, "maxFacts"), 1, 10_000)?;
    if ops.is_empty() || ops.len() > 256 {
        return Err(bad());
    }
    let mut population = facts.len().checked_add(graphs.len()).ok_or_else(bad)?;
    let mut ids = HashSet::new();
    let mut work = 0usize;
    let mut normalized = Vec::with_capacity(ops.len());
    for op in ops {
        ctx.charge_work(1, Utf16::default())?;
        let id = string(get(op, "id"))?;
        if !id_valid(id, false) || !ids.insert(id.clone()) {
            return Err(bad());
        }
        let kind = string(get(op, "kind"))?;
        if kind == &Utf16::from("scan") || kind == &Utf16::from("read-rules") {
            shape(op, &["id", "kind", "selection"])?;
            let sel = get(op, "selection").ok_or_else(bad)?;
            shape(
                sel,
                if kind == &Utf16::from("scan") {
                    &["type", "fields"]
                } else {
                    &["type"]
                },
            )?;
            let target = get(sel, "type").ok_or_else(bad)?;
            ref_valid(target)?;
            if kind == &Utf16::from("scan") {
                array(get(sel, "fields"))?;
            }
            for fact in facts {
                ctx.charge_work(1, Utf16::default())?;
                work += 1;
                let fact_type = get(fact, "type").ok_or_else(bad)?;
                ref_valid(fact_type)?;
                if same_ref(fact_type, target) {
                    population = population.checked_add(1).ok_or_else(bad)?;
                }
            }
        } else if kind == &Utf16::from("action") {
            shape(op, &["id", "kind", "request"])?;
            let request = get(op, "request").ok_or_else(bad)?;
            shape(request, &["action", "resources", "targets", "fields"])?;
            population = population
                .checked_add(array(get(request, "resources"))?.len())
                .ok_or_else(bad)?;
        } else {
            return Err(bad());
        }
        if population > max {
            return Err(bad());
        }
        normalized.push(op.clone());
    }
    Ok(result(true, normalized, work))
}

/// Validate scan occurrence names and cumulative fact/graph visitation.
pub fn admit_scan_batch(input: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let scans = array(get(input, "requests"))?;
    let facts = array(get(input, "facts"))?;
    let graphs = array(get(input, "graphs"))?;
    let max = number(get(input, "maxFacts"), 1, 10_000)?;
    if scans.is_empty() || scans.len() > 256 {
        return Err(bad());
    }
    let mut population = facts.len().checked_add(graphs.len()).ok_or_else(bad)?;
    let mut names = HashSet::new();
    let mut visits = 0usize;
    let mut normalized = Vec::with_capacity(scans.len());
    for scan in scans {
        ctx.charge_work(1, Utf16::default())?;
        shape(scan, &["scan", "type", "fields"])?;
        let name = string(get(scan, "scan"))?;
        if !id_valid(name, true) || !names.insert(name.clone()) {
            return Err(bad());
        }
        let target = get(scan, "type").ok_or_else(bad)?;
        ref_valid(target)?;
        array(get(scan, "fields"))?;
        for fact in facts {
            ctx.charge_work(1, Utf16::default())?;
            visits += 1;
            let fact_type = get(fact, "type").ok_or_else(bad)?;
            ref_valid(fact_type)?;
            if same_ref(fact_type, target) {
                population = population.checked_add(1).ok_or_else(bad)?;
            }
        }
        if population > max {
            return Err(bad());
        }
        normalized.push(scan.clone());
    }
    Ok(result(true, normalized, visits))
}

/// Atomic result fold; denied actions are ordinary evaluated outcomes.
pub fn compose_operation_batch(input: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let items = array(get(input, "items"))?;
    if items.is_empty() || items.len() > 256 {
        return Err(bad());
    }
    for item in items {
        ctx.charge_work(1, Utf16::default())?;
        shape(item, &["id", "kind", "outcome"])?;
        let outcome = get(item, "outcome").ok_or_else(bad)?;
        let kind = string(get(item, "kind"))?;
        let accepted = if kind == &Utf16::from("scan") {
            text_eq(get(outcome, "status"), "rendered")
        } else if kind == &Utf16::from("read-rules") || kind == &Utf16::from("action") {
            text_eq(get(outcome, "status"), "evaluated")
        } else {
            false
        };
        if !accepted || !bool_false_false(outcome) {
            return Err(bad());
        }
    }
    Ok(object(vec![
        ("status", Value::string_utf8("completed")),
        ("complete", Value::Bool(false)),
        ("authority", Value::Bool(false)),
        ("operations", Value::Array(items.to_vec())),
    ]))
}
fn text_eq(v: Option<&Value>, expected: &str) -> bool {
    matches!(v,Some(Value::String(s))if s==&Utf16::from(expected))
}
fn bool_false_false(v: &Value) -> bool {
    matches!(get(v, "complete"), Some(Value::Bool(false)))
        && matches!(get(v, "authority"), Some(Value::Bool(false)))
}

pub fn compose_scan_batch(input: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let scans = array(get(input, "scans"))?;
    if scans.is_empty() || scans.len() > 256 {
        return Err(bad());
    }
    for scan in scans {
        ctx.charge_work(1, Utf16::default())?;
        shape(scan, &["scan", "rows", "valueProfiles"])?;
        if !matches!(get(scan, "rows"), Some(Value::Array(_)))
            || !matches!(get(scan, "valueProfiles"), Some(Value::Array(_)))
        {
            return Err(bad());
        }
    }
    Ok(object(vec![
        ("status", Value::string_utf8("rendered")),
        ("complete", Value::Bool(false)),
        ("authority", Value::Bool(false)),
        ("scans", Value::Array(scans.to_vec())),
    ]))
}

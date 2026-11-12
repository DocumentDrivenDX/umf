// SPDX-License-Identifier: MIT OR Apache-2.0
//! Candidate logical-catalog disclosure selection. Inputs are already scoped
//! and evaluated by the host; this module owns the bounded fold and provenance.
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
        "SECURITY_CATALOG_DISCLOSURE",
        Utf16::default(),
        "Disclosure selection unresolved",
    )
}

/// Fold one field of an evaluated resource. The caller consumes this receipt
/// before advancing to the next field, preserving original field admission order.
pub fn select_candidate_catalog_disclosures(
    input: &Value,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let requested = get(input, "requested").ok_or_else(bad)?;
    let field = text(get(requested, "fieldToken"))?;
    let protected = get(requested, "protected") == Some(&Value::Bool(true));
    let rules = arr(get(input, "rules"))?;
    if rules.len() > 256 {
        return Err(bad());
    }
    let mut units = 1;
    let mut origins = Vec::new();
    for rule in rules {
        units += 1;
        if text(get(rule, "effect"))? != &Utf16::from("permit")
            || text(get(rule, "truth"))? != &Utf16::from("T")
        {
            continue;
        }
        let ri = number(get(rule, "ruleIndex"))?;
        let mut matched = false;
        for d in arr(get(rule, "disclosures"))? {
            units += 1;
            if text(get(d, "fieldToken"))? != field {
                continue;
            }
            matched = true;
            origins.push((
                text(get(d, "kind"))?.clone(),
                ri,
                Some(number(get(d, "disclosureIndex"))?),
            ));
        }
        if !matched && !protected {
            origins.push((Utf16::from("original"), ri, None));
        }
    }
    context.charge_work(units, Utf16::default())?;
    let original = Utf16::from("original");
    let withheld = Utf16::from("withheld");
    let transformed = Utf16::from("transformed");
    let kind = if origins.iter().any(|(kind, _, _)| kind == &withheld) {
        withheld
    } else if origins.iter().any(|(kind, _, _)| kind == &transformed) {
        transformed
    } else if protected && origins.is_empty() {
        Utf16::from("indeterminate")
    } else {
        original
    };
    let occurrences = origins
        .into_iter()
        .filter(|(candidate, _, _)| candidate == &kind)
        .map(|(_, rule, disclosure)| match disclosure {
            Some(disclosure) => occurrence(rule, disclosure),
            None => occurrence_null(rule),
        })
        .collect();
    Ok(obj(vec![
        ("kind", Value::String(kind)),
        ("occurrences", Value::Array(occurrences)),
        ("workUnits", Value::Number(units as f64)),
    ]))
}

/// A complete empty population still needs source-based output obligations.
pub fn plan_empty_disclosures(
    input: &Value,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let field = text(get(input, "fieldToken"))?;
    let unprotected = get(input, "protected") == Some(&Value::Bool(false));
    let mut work = 1;
    let mut unconditional_withholding = false;
    let mut unconditional_transform = false;
    let mut default_original = false;
    let mut directives = Vec::new();
    for rule in arr(get(input, "rules"))? {
        work += 1;
        if get(rule, "effect") != Some(&s("permit")) {
            continue;
        }
        let always = get(rule, "always") == Some(&Value::Bool(true));
        let rule_index = number(get(rule, "ruleIndex"))?;
        let mut found = false;
        for (index, disclosure) in arr(get(rule, "disclosures"))?.iter().enumerate() {
            work += 1;
            if text(get(disclosure, "fieldToken"))? != field {
                continue;
            }
            found = true;
            let kind = text(get(disclosure, "kind"))?
                .to_utf8()
                .map_err(|_| bad())?;
            unconditional_withholding |= always && kind == "withheld";
            unconditional_transform |= always && kind == "transformed";
            directives.push((kind, rule_index, index));
        }
        default_original |= !found && unprotected;
    }
    context.charge_work(work, Utf16::default())?;
    let directives = if unconditional_withholding {
        Vec::new()
    } else {
        directives
            .into_iter()
            .map(|(kind, rule, index)| {
                let mode = match kind.as_str() {
                    "original" if !unconditional_transform => "original",
                    "transformed" => "transformed",
                    _ => "skip",
                };
                obj(vec![
                    ("mode", s(mode)),
                    ("ruleIndex", Value::Number(rule as f64)),
                    ("disclosureIndex", Value::Number(index as f64)),
                ])
            })
            .collect()
    };
    Ok(obj(vec![
        ("workUnits", Value::Number(work as f64)),
        (
            "defaultOriginal",
            Value::Bool(default_original && !unconditional_withholding && !unconditional_transform),
        ),
        ("directives", Value::Array(directives)),
    ]))
}

/// Identity tokens are admitted only for effective, non-withheld directives.
pub fn disclosure_identities_agree(
    input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let tokens = arr(Some(input))?;
    if tokens.is_empty() || tokens.len() > 256 {
        return Err(bad());
    }
    let first = text(tokens.first())?;
    let mut agrees = true;
    for token in &tokens[1..] {
        let token = text(Some(token))?;
        ctx.charge_work(token.len().min(first.len()) + 1, Utf16::default())?;
        agrees &= token == first;
    }
    Ok(Value::Bool(agrees))
}

/// Materialize selected, already-admitted values into logical output cells.
/// Recipe execution remains a host callback into the issued native evaluator.
pub fn render_candidate_catalog_cells(
    input: &Value,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rows = arr(get(input, "rows"))?;
    if rows.len() > 10000 {
        return Err(bad());
    }
    let mut rendered = Vec::with_capacity(rows.len());
    for row in rows {
        let cells = arr(get(row, "cells"))?;
        if cells.len() > 4096 {
            return Err(bad());
        }
        let mut out = Vec::with_capacity(cells.len());
        for cell in cells {
            context.charge_work(1, Utf16::default())?;
            let field = get(cell, "field").ok_or_else(bad)?.clone();
            let disposition = text(get(cell, "disposition"))?;
            let present = matches!(get(cell, "present"), Some(Value::Bool(true)));
            let value = get(cell, "value").cloned();
            let result = if disposition == &Utf16::from("withheld") {
                obj(vec![("field", field), ("disposition", s("withheld"))])
            } else if disposition == &Utf16::from("original") {
                if present {
                    obj(vec![
                        ("field", field),
                        ("disposition", s("original")),
                        ("value", value.ok_or_else(bad)?),
                    ])
                } else {
                    obj(vec![("field", field), ("disposition", s("absent"))])
                }
            } else if disposition == &Utf16::from("transformed") {
                let output_type = get(cell, "outputType").ok_or_else(bad)?.clone();
                obj(vec![
                    ("field", field),
                    ("disposition", s("transformed")),
                    ("outputType", output_type),
                    ("value", value.ok_or_else(bad)?),
                ])
            } else {
                return Err(bad());
            };
            out.push(result);
        }
        rendered.push(Value::Array(out));
    }
    Ok(obj(vec![("rows", Value::Array(rendered))]))
}
fn number(v: Option<&Value>) -> Result<usize, EngineError> {
    match v {
        Some(Value::Number(n))
            if n.is_finite() && n.fract() == 0.0 && *n >= 0.0 && *n <= 1_000_000.0 =>
        {
            Ok(*n as usize)
        }
        _ => Err(bad()),
    }
}
fn occurrence(rule: usize, disclosure: usize) -> Value {
    obj(vec![
        ("ruleIndex", Value::Number(rule as f64)),
        ("disclosureIndex", Value::Number(disclosure as f64)),
    ])
}
fn occurrence_null(rule: usize) -> Value {
    obj(vec![
        ("ruleIndex", Value::Number(rule as f64)),
        ("disclosureIndex", Value::Null),
    ])
}

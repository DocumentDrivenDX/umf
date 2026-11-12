// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native lowering for the private candidate security compact-condition IR.
//! TS passes opaque tokens for its issued source objects; Rust owns occurrence
//! numbering, lexical witness checks, bounds, and compact output construction.

use crate::{
    context::Context,
    error::EngineError,
    value::{Utf16, Value},
};

fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, v)| v)
}
fn text(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(s)) => s.to_utf8().ok(),
        _ => None,
    }
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn string(value: &str) -> Value {
    Value::string_utf8(value)
}
fn fail() -> EngineError {
    EngineError::new(
        "SECURITY_CANDIDATE_CONDITION",
        Utf16::default(),
        "Invalid candidate condition",
    )
}
fn exact(value: &Value, required: &[&str]) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(fail());
    };
    if fields.len() != required.len()
        || fields
            .iter()
            .any(|(key, _)| !required.iter().any(|name| key == &Utf16::from(*name)))
    {
        return Err(fail());
    }
    Ok(())
}
fn uint(value: Option<&Value>, max_exclusive: usize) -> Result<usize, EngineError> {
    let Some(Value::Number(n)) = value else {
        return Err(fail());
    };
    if !n.is_finite() || *n < 0.0 || n.fract() != 0.0 || *n >= max_exclusive as f64 {
        return Err(fail());
    }
    Ok(*n as usize)
}

/// Lower one normalized candidate expression to the frozen compact shape.
/// This is structural compilation only and never admits policy authority.
pub fn compile_compact_condition(
    source: &Value,
    association_count: usize,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if association_count > 256 {
        return Err(fail());
    }
    let mut nodes = 0usize;
    let mut next_occurrence = 0usize;
    let mut active = Vec::<(usize, usize)>::new();
    let mut used_tokens = std::collections::HashSet::<usize>::new();

    fn term(value: &Value, count: usize, active: &[(usize, usize)]) -> Result<Value, EngineError> {
        let kind = text(get(value, "kind")).ok_or_else(fail)?;
        match kind.as_str() {
            "entity" => {
                exact(value, &["kind", "term", "domain"])?;
                if !matches!(get(value, "domain"), Some(Value::String(_))) {
                    return Err(fail());
                }
                Ok(object(vec![
                    ("kind", string("entity-term")),
                    ("term", get(value, "term").ok_or_else(fail)?.clone()),
                    ("domain", get(value, "domain").ok_or_else(fail)?.clone()),
                ]))
            }
            "association" | "context" => {
                if kind == "context" {
                    exact(value, &["kind", "context", "association", "term"])?;
                    if !matches!(
                        text(get(value, "context")).as_deref(),
                        Some("subject" | "resource")
                    ) {
                        return Err(fail());
                    }
                } else {
                    exact(value, &["kind", "association", "term"])?;
                }
                let association = uint(get(value, "association"), count)?;
                let mut fields = vec![(
                    "kind",
                    string(if kind == "context" {
                        "context-term"
                    } else {
                        "constant-term"
                    }),
                )];
                if kind == "context" {
                    fields.push(("context", get(value, "context").ok_or_else(fail)?.clone()));
                }
                fields.push(("association", Value::Number(association as f64)));
                fields.push(("term", get(value, "term").ok_or_else(fail)?.clone()));
                Ok(object(fields))
            }
            "witness" => {
                exact(value, &["kind", "token", "term"])?;
                let token = uint(get(value, "token"), 4096)?;
                let occurrence = active
                    .iter()
                    .rev()
                    .find(|(known, _)| *known == token)
                    .map(|(_, occurrence)| *occurrence)
                    .ok_or_else(fail)?;
                Ok(object(vec![
                    ("kind", string("witness-term")),
                    ("occurrence", Value::Number(occurrence as f64)),
                    ("term", get(value, "term").ok_or_else(fail)?.clone()),
                ]))
            }
            _ => Err(fail()),
        }
    }

    fn walk(
        value: &Value,
        count: usize,
        depth: usize,
        nodes: &mut usize,
        next: &mut usize,
        active: &mut Vec<(usize, usize)>,
        used: &mut std::collections::HashSet<usize>,
        context: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        *nodes += 1;
        if *nodes > 4096 || depth > 16 {
            return Err(fail());
        }
        context.charge_work(1, Utf16::default())?;
        match text(get(value, "op")).as_deref() {
            Some("literal") => {
                exact(value, &["op", "value"])?;
                if !matches!(get(value, "value"), Some(Value::Bool(_))) {
                    return Err(fail());
                }
                Ok(value.clone())
            }
            Some("eq") => {
                exact(value, &["op", "left", "right"])?;
                Ok(object(vec![
                    ("op", string("eq")),
                    (
                        "left",
                        term(get(value, "left").ok_or_else(fail)?, count, active)?,
                    ),
                    (
                        "right",
                        term(get(value, "right").ok_or_else(fail)?, count, active)?,
                    ),
                ]))
            }
            Some("not") => {
                exact(value, &["op", "arg"])?;
                Ok(object(vec![
                    ("op", string("not")),
                    (
                        "arg",
                        walk(
                            get(value, "arg").ok_or_else(fail)?,
                            count,
                            depth + 1,
                            nodes,
                            next,
                            active,
                            used,
                            context,
                        )?,
                    ),
                ]))
            }
            Some("and" | "or") => {
                exact(value, &["op", "args"])?;
                let Some(Value::Array(args)) = get(value, "args") else {
                    return Err(fail());
                };
                if args.is_empty() || args.len() > 64 {
                    return Err(fail());
                }
                let lowered = args
                    .iter()
                    .map(|arg| walk(arg, count, depth + 1, nodes, next, active, used, context))
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(object(vec![
                    ("op", get(value, "op").ok_or_else(fail)?.clone()),
                    ("args", Value::Array(lowered)),
                ]))
            }
            Some("exists") => {
                exact(value, &["op", "token", "alias", "association", "where"])?;
                let token = uint(get(value, "token"), 4096)?;
                let association = uint(get(value, "association"), count)?;
                if !used.insert(token) {
                    return Err(fail());
                }
                let occurrence = *next;
                *next += 1;
                active.push((token, occurrence));
                let where_value = walk(
                    get(value, "where").ok_or_else(fail)?,
                    count,
                    depth + 1,
                    nodes,
                    next,
                    active,
                    used,
                    context,
                );
                active.pop();
                let where_value = where_value?;
                let alias = get(value, "alias").ok_or_else(fail)?;
                if !matches!(alias, Value::String(text) if !text.is_empty()) {
                    return Err(fail());
                }
                Ok(object(vec![
                    ("op", string("exists")),
                    ("occurrence", Value::Number(occurrence as f64)),
                    ("alias", alias.clone()),
                    ("association", Value::Number(association as f64)),
                    ("where", where_value),
                ]))
            }
            _ => Err(fail()),
        }
    }

    let expression = walk(
        source,
        association_count,
        1,
        &mut nodes,
        &mut next_occurrence,
        &mut active,
        &mut used_tokens,
        context,
    )?;
    Ok(object(vec![
        ("kind", string("candidate-compact-condition/0.1")),
        ("expression", expression),
    ]))
}

#[cfg(test)]
mod tests {
    use super::compile_compact_condition;
    use crate::{
        context::Context,
        value::{Utf16, Value},
    };
    fn obj(fields: Vec<(&str, Value)>) -> Value {
        Value::Object(
            fields
                .into_iter()
                .map(|(k, v)| (Utf16::from(k), v))
                .collect(),
        )
    }
    fn s(v: &str) -> Value {
        Value::string_utf8(v)
    }
    fn n(v: usize) -> Value {
        Value::Number(v as f64)
    }
    #[test]
    fn lowers_preorder_and_lexical_witnesses() {
        let alias = Value::String(Utf16::new(vec![0xd800]));
        let witness = obj(vec![
            ("kind", s("witness")),
            ("token", n(9)),
            ("term", obj(vec![])),
        ]);
        let source = obj(vec![
            ("op", s("exists")),
            ("token", n(9)),
            ("alias", alias.clone()),
            ("association", n(0)),
            (
                "where",
                obj(vec![
                    ("op", s("eq")),
                    ("left", witness.clone()),
                    ("right", witness),
                ]),
            ),
        ]);
        let result = compile_compact_condition(&source, 1, &mut Context::ordinary()).unwrap();
        assert_eq!(
            super::get(super::get(&result, "expression").unwrap(), "occurrence"),
            Some(&Value::Number(0.0))
        );
        assert_eq!(
            super::get(super::get(&result, "expression").unwrap(), "alias"),
            Some(&alias)
        );
    }
    #[test]
    fn rejects_unbound_witness_and_bad_association_index() {
        let witness = obj(vec![
            ("kind", s("witness")),
            ("token", n(9)),
            ("term", obj(vec![])),
        ]);
        let source = obj(vec![
            ("op", s("eq")),
            ("left", witness.clone()),
            ("right", witness),
        ]);
        assert!(compile_compact_condition(&source, 1, &mut Context::ordinary()).is_err());
        let bad = obj(vec![
            ("op", s("exists")),
            ("token", n(9)),
            ("alias", s("a")),
            ("association", n(1)),
            (
                "where",
                obj(vec![("op", s("literal")), ("value", Value::Bool(true))]),
            ),
        ]);
        assert!(compile_compact_condition(&bad, 1, &mut Context::ordinary()).is_err());
    }
}

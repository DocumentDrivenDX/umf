// SPDX-License-Identifier: MIT OR Apache-2.0
use crate::{
    context::Context,
    error::EngineError,
    value::{Utf16, Value, copy_json},
};
use std::collections::BTreeSet;
fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(x, _)| x == &k(n)).map(|(_, v)| v),
        _ => None,
    }
}
fn txt_metered(v: &Value, ctx: &mut Context<'_>) -> Result<Option<String>, EngineError> {
    match v {
        Value::String(text) => {
            ctx.charge_work(text.len(), Utf16::default())?;
            Ok(text.to_utf8().ok())
        }
        _ => Ok(None),
    }
}
fn err(code: &str, msg: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), msg)
}
fn members<'a>(v: &'a Value) -> Result<&'a [(Utf16, Value)], EngineError> {
    match v {
        Value::Object(m) => Ok(m),
        _ => Err(err("CONSTRAINT_PROGRAM", "Expected instruction object")),
    }
}
fn keycheck(
    v: &Value,
    allowed: &[&str],
    required: &[&str],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let m = members(v)?;
    for r in required {
        if get(v, r).is_none() {
            return Err(err("CONSTRAINT_PROGRAM", "Missing instruction field"));
        }
    }
    for (k, _) in m {
        // Charge the worst-case UTF-8 materialization and field-name scan
        // before converting the owned UTF-16 key.
        ctx.charge_work(
            k.len().saturating_mul(3).saturating_add(allowed.len()),
            Utf16::default(),
        )?;
        let Some(s) = k.to_utf8().ok() else {
            return Err(err("CONSTRAINT_PROGRAM", "Malformed instruction key"));
        };
        if !allowed.contains(&s.as_str()) {
            return Err(EngineError::new(
                "CONSTRAINT_PROGRAM",
                Utf16::default(),
                format!("Unknown instruction field: {s}"),
            ));
        }
    }
    Ok(())
}
fn binding_metered(v: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let Value::String(name) = v else {
        return Err(err("CONSTRAINT_PROGRAM", "Expected binding name"));
    };
    if name.is_empty() {
        return Err(err("CONSTRAINT_PROGRAM", "Expected binding name"));
    }
    ctx.charge_work(name.len(), Utf16::default())?;
    Ok(name.clone())
}
fn clone_scope(
    scope: &BTreeSet<Utf16>,
    ctx: &mut Context<'_>,
) -> Result<BTreeSet<Utf16>, EngineError> {
    let copied_units = scope
        .iter()
        .map(Utf16::len)
        .fold(scope.len(), usize::saturating_add);
    ctx.charge_work(copied_units, Utf16::default())?;
    Ok(scope.clone())
}
fn scope_contains(
    scope: &BTreeSet<Utf16>,
    name: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    ctx.charge_work(scope_lookup_cost(scope.len(), name.len()), Utf16::default())?;
    Ok(scope.contains(name))
}
fn scope_lookup_cost(count: usize, name_units: usize) -> usize {
    if count == 0 {
        return 0;
    }
    // BTreeSet lookup compares at most a node's bounded fanout at each level.
    // Use a conservative logarithmic height bound rather than charging all n
    // keys; the latter spuriously rejects otherwise valid large scopes.
    let levels = (usize::BITS - count.leading_zeros()) as usize + 1;
    let comparisons = count.min(11usize.saturating_mul(levels));
    comparisons.saturating_mul(name_units.saturating_add(1))
}
fn scope_insert(
    scope: &mut BTreeSet<Utf16>,
    name: Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(
        name.len()
            .saturating_add(scope_lookup_cost(scope.len(), name.len())),
        Utf16::default(),
    )?;
    scope.insert(name);
    Ok(())
}
fn op_arity(name: &str) -> Option<(usize, usize)> {
    Some(match name {
        "get" | "has" | "without" | "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "lookup" => {
            (2, 2)
        }
        "keys" | "values" | "entries" | "flatten" | "length" | "not" | "pointer" | "canonical"
        | "filter" | "map" | "find" | "some" | "every" | "sort" | "index" => (1, 1),
        "and" | "or" | "concat" | "tuple" => (0, usize::MAX),
        "set" => (0, 0),
        "registered" => (2, 2),
        "literal-errors" | "extension-errors" => (5, 5),
        "literal-identity" | "numeric-interval" => (3, 3),
        _ => return None,
    })
}
fn collection(op: &str) -> bool {
    matches!(op, "filter" | "map" | "find" | "some" | "every" | "index")
}
fn array(v: Option<&Value>) -> Result<&[Value], EngineError> {
    match v {
        Some(Value::Array(a)) => Ok(a),
        _ => Err(err("CONSTRAINT_PROGRAM", "Expected array")),
    }
}
fn expression(v: &Value, depth: usize, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    if depth > ctx.limits().max_depth {
        return Err(err("LIMIT", "Constraint grammar resource limit"));
    }
    match v {
        Value::Array(a) => {
            for c in a {
                expression(c, depth + 1, ctx)?
            }
        }
        Value::Object(_) => {
            if let Some(variable) = get(v, "var") {
                keycheck(v, &["var"], &["var"], ctx)?;
                binding_metered(variable, ctx)?;
                return Ok(());
            }
            if let Some(operation) = get(v, "op") {
                let name = txt_metered(operation, ctx)?.unwrap_or_default();
                let Some((min, max)) = op_arity(&name) else {
                    return Err(EngineError::new(
                        "CONSTRAINT_OPCODE",
                        Utf16::default(),
                        format!("Unknown expression: {name}"),
                    ));
                };
                let coll = collection(&name);
                let mut allowed = vec!["op", "args"];
                let mut required = vec!["op", "args"];
                if coll {
                    allowed.extend(["as", "index", "value"]);
                    required.extend(["as", "value"])
                }
                keycheck(v, &allowed, &required, ctx)?;
                let args = array(get(v, "args"))?;
                if args.len() < min || args.len() > max {
                    return Err(EngineError::new(
                        "CONSTRAINT_PROGRAM",
                        Utf16::default(),
                        format!("Invalid expression arity: {name}"),
                    ));
                }
                for arg in args {
                    expression(arg, depth + 1, ctx)?
                }
                if coll {
                    binding_metered(get(v, "as").unwrap(), ctx)?;
                    if let Some(i) = get(v, "index") {
                        binding_metered(i, ctx)?;
                    }
                    expression(get(v, "value").unwrap(), depth + 1, ctx)?
                }
                return Ok(());
            }
            for (_, child) in members(v)? {
                expression(child, depth + 1, ctx)?
            }
        }
        _ => (),
    }
    Ok(())
}
fn sequence(steps: &Value, depth: usize, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    for step in array(Some(steps))? {
        let op = txt_metered(
            get(step, "op").ok_or_else(|| err("CONSTRAINT_OPCODE", "Unknown step"))?,
            ctx,
        )?
        .unwrap_or_default();
        let (required, optional): (&[&str], &[&str]) = match op.as_str() {
            "let" => (&["name", "value"], &[]),
            "for" => (&["each", "as", "body"], &["index"]),
            "if" => (&["test", "then"], &["else"]),
            "emit" => (&["diagnostic"], &["when"]),
            "remember" => (&["set", "key"], &["value", "diagnostic"]),
            _ => {
                return Err(EngineError::new(
                    "CONSTRAINT_OPCODE",
                    Utf16::default(),
                    format!("Unknown step: {op}"),
                ));
            }
        };
        let mut allowed = vec!["op"];
        allowed.extend_from_slice(required);
        allowed.extend_from_slice(optional);
        let mut req = vec!["op"];
        req.extend_from_slice(required);
        keycheck(step, &allowed, &req, ctx)?;
        for (name, val) in members(step)? {
            ctx.charge_work(name.len().saturating_mul(3), Utf16::default())?;
            let name = name.to_utf8().unwrap_or_default();
            match name.as_str() {
                "op" => (),
                "body" | "then" | "else" => sequence(val, depth + 1, ctx)?,
                "name" | "as" | "index" => {
                    binding_metered(val, ctx)?;
                }
                _ => expression(val, depth + 1, ctx)?,
            }
        }
    }
    Ok(())
}
fn vars(v: &Value, scope: &BTreeSet<Utf16>, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match v {
        Value::Array(a) => {
            for c in a {
                vars(c, scope, ctx)?
            }
        }
        Value::Object(_) => {
            if let Some(v) = get(v, "var") {
                let name = binding_metered(v, ctx)?;
                if !scope_contains(scope, &name, ctx)? {
                    let prefix = Utf16::from("Unbound variable: ");
                    ctx.charge_work(prefix.len().saturating_add(name.len()), Utf16::default())?;
                    let mut message = Utf16::from("Unbound variable: ").units().to_vec();
                    message.extend(name.units());
                    return Err(EngineError::new(
                        "CONSTRAINT_TARGET",
                        Utf16::default(),
                        Utf16::new(message),
                    ));
                }
                return Ok(());
            }
            if let Some(op) = get(v, "op") {
                let name = txt_metered(op, ctx)?.unwrap_or_default();
                for arg in array(get(v, "args"))? {
                    vars(arg, scope, ctx)?
                }
                if collection(&name) {
                    let mut local = clone_scope(scope, ctx)?;
                    let as_name = binding_metered(get(v, "as").unwrap(), ctx)?;
                    scope_insert(&mut local, as_name, ctx)?;
                    if let Some(i) = get(v, "index") {
                        let index_name = binding_metered(i, ctx)?;
                        scope_insert(&mut local, index_name, ctx)?;
                    }
                    vars(get(v, "value").unwrap(), &local, ctx)?
                }
                return Ok(());
            }
            for (_, c) in members(v)? {
                vars(c, scope, ctx)?
            }
        }
        _ => (),
    }
    Ok(())
}
fn bindings(
    steps: &Value,
    scope: &mut BTreeSet<Utf16>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    for step in array(Some(steps))? {
        ctx.charge_work(1, Utf16::default())?;
        let op = txt_metered(get(step, "op").unwrap(), ctx)?.unwrap_or_default();
        match op.as_str() {
            "let" => {
                vars(get(step, "value").unwrap(), scope, ctx)?;
                let name = binding_metered(get(step, "name").unwrap(), ctx)?;
                scope_insert(scope, name, ctx)?;
            }
            "for" => {
                vars(get(step, "each").unwrap(), scope, ctx)?;
                let mut local = clone_scope(scope, ctx)?;
                let as_name = binding_metered(get(step, "as").unwrap(), ctx)?;
                scope_insert(&mut local, as_name, ctx)?;
                if let Some(i) = get(step, "index") {
                    let index_name = binding_metered(i, ctx)?;
                    scope_insert(&mut local, index_name, ctx)?;
                }
                bindings(get(step, "body").unwrap(), &mut local, ctx)?
            }
            "if" => {
                vars(get(step, "test").unwrap(), scope, ctx)?;
                let mut local = clone_scope(scope, ctx)?;
                bindings(get(step, "then").unwrap(), &mut local, ctx)?;
                if let Some(other) = get(step, "else") {
                    let mut local = clone_scope(scope, ctx)?;
                    bindings(other, &mut local, ctx)?
                }
            }
            _ => {
                for (name, val) in members(step)? {
                    if name != &k("op") {
                        vars(val, scope, ctx)?
                    }
                }
            }
        }
    }
    Ok(())
}
pub fn check_program(program: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let p = copy_json(program, ctx)?;
    keycheck(
        &p,
        &["profile", "steps", "provenance"],
        &["profile", "steps"],
        ctx,
    )?;
    if txt_metered(get(&p, "profile").unwrap(), ctx)?.as_deref() != Some("umf.constraints/1") {
        return Err(err("CONSTRAINT_PROFILE", "Unsupported constraint program"));
    }
    let steps = get(&p, "steps").unwrap();
    sequence(steps, 0, ctx)?;
    ctx.charge_work(
        Utf16::from("doc").len() + Utf16::from("policy").len(),
        Utf16::default(),
    )?;
    let mut initial = BTreeSet::from([Utf16::from("doc"), Utf16::from("policy")]);
    bindings(steps, &mut initial, ctx)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lexical_scope_name_comparison_is_metered_before_tree_lookup() {
        let name = Utf16::new(vec![b'x' as u16; 2048]);
        let scope = BTreeSet::from([name.clone()]);
        let mut observed = Vec::new();
        let mut meter = |amount| {
            observed.push(amount);
            if amount > 1000 {
                Err(EngineError::new(
                    "SCOPE_METER_DENIED",
                    Utf16::default(),
                    "denied",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let error = scope_contains(&scope, &name, &mut ctx).unwrap_err();
        assert_eq!(error.code, "SCOPE_METER_DENIED");
        assert_eq!(observed, vec![2049]);
    }

    #[test]
    fn large_scope_lookup_uses_bounded_tree_height_not_linear_key_count() {
        let estimated = scope_lookup_cost(15_000, 50);
        assert!(
            estimated < 10_000,
            "unexpected scope comparison charge: {estimated}"
        );
        assert_eq!(estimated, 8_415);
    }

    #[test]
    fn recursive_scope_copy_is_metered_before_clone() {
        let scope = BTreeSet::from([
            Utf16::new(vec![b'a' as u16; 1024]),
            Utf16::new(vec![b'b' as u16; 2048]),
        ]);
        let expected = scope.iter().map(Utf16::len).sum::<usize>() + scope.len();
        let mut observed = Vec::new();
        let mut meter = |amount| {
            observed.push(amount);
            Err(EngineError::new(
                "SCOPE_COPY_DENIED",
                Utf16::default(),
                "denied",
            ))
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let error = clone_scope(&scope, &mut ctx).unwrap_err();
        assert_eq!(error.code, "SCOPE_COPY_DENIED");
        assert_eq!(observed, vec![expected]);
    }
}

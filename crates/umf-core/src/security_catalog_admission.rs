// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded native checks for detached logical catalog fact and graph inventories.
//! The host prepares exact schema references; Rust owns closed-shape, duplicate,
//! coverage, and inventory consistency checks.
use crate::{
    context::Context,
    error::EngineError,
    value::{Utf16, Value},
};

fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    let Value::Object(m) = v else { return None };
    m.iter().find(|(n, _)| n == &Utf16::from(k)).map(|(_, v)| v)
}
fn text(v: Option<&Value>) -> Option<Utf16> {
    match v {
        Some(Value::String(s)) => Some(s.clone()),
        _ => None,
    }
}
fn fail() -> EngineError {
    EngineError::new(
        "SECURITY_CATALOG_ADMISSION",
        Utf16::default(),
        "Invalid logical catalog inventory",
    )
}
fn exact(v: &Value, keys: &[&str]) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(fail());
    };
    if m.len() != keys.len()
        || m.iter()
            .any(|(k, _)| !keys.iter().any(|x| k == &Utf16::from(*x)))
    {
        return Err(fail());
    }
    Ok(())
}
fn arr<'a>(v: Option<&'a Value>) -> Result<&'a [Value], EngineError> {
    match v {
        Some(Value::Array(a)) => Ok(a),
        _ => Err(fail()),
    }
}
fn flag(v: Option<&Value>) -> Result<bool, EngineError> {
    match v {
        Some(Value::Bool(b)) => Ok(*b),
        _ => Err(fail()),
    }
}
fn token(v: Option<&Value>) -> Result<Utf16, EngineError> {
    text(v).filter(|s| !s.is_empty()).ok_or_else(fail)
}
fn charge(ctx: &mut Context<'_>, n: usize) -> Result<(), EngineError> {
    ctx.charge_work(n, Utf16::default())
}

/// Validate a host-prepared inventory projection. `fieldsByType` is a set-like
/// array of exact field-key tokens per type; tokens are opaque UTF-16 strings.
pub fn admit_inventory(input: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    exact(
        input,
        &[
            "facts",
            "fieldsByType",
            "coverage",
            "graphs",
            "graphCoverage",
            "graphPlans",
        ],
    )?;
    let mut membership = std::collections::HashMap::new();
    for entry in arr(get(input, "fieldsByType"))? {
        charge(ctx, 1)?;
        exact(entry, &["type", "fields", "absentAllowed"])?;
        let ty = token(get(entry, "type"))?;
        let mut fields = std::collections::HashSet::new();
        for f in arr(get(entry, "fields"))? {
            charge(ctx, 1)?;
            if !fields.insert(token(Some(f))?) {
                return Err(fail());
            }
        }
        let mut absent = std::collections::HashSet::new();
        for f in arr(get(entry, "absentAllowed"))? {
            let name = token(Some(f))?;
            if !fields.contains(&name) || !absent.insert(name) {
                return Err(fail());
            }
        }
        if membership.insert(ty, (fields, absent)).is_some() {
            return Err(fail());
        }
    }
    let mut fact_ids = std::collections::HashSet::new();
    let mut facts =
        std::collections::HashMap::<Utf16, Vec<std::collections::HashSet<Utf16>>>::new();
    for fact in arr(get(input, "facts"))? {
        charge(ctx, 1)?;
        exact(
            fact,
            &["type", "identity", "fields", "absent", "keyProjections"],
        )?;
        let ty = token(get(fact, "type"))?;
        let identity = token(get(fact, "identity"))?;
        let (members, absent_allowed) = membership.get(&ty).ok_or_else(fail)?;
        let mut known = std::collections::HashSet::new();
        for name in arr(get(fact, "fields"))? {
            charge(ctx, 1)?;
            let name = token(Some(name))?;
            if !members.contains(&name) || !known.insert(name) {
                return Err(fail());
            }
        }
        for name in arr(get(fact, "absent"))? {
            charge(ctx, 1)?;
            let name = token(Some(name))?;
            if !absent_allowed.contains(&name) || !known.insert(name) {
                return Err(fail());
            }
        }
        for pair in arr(get(fact, "keyProjections"))? {
            let pair = arr(Some(pair))?;
            if pair.len() != 2 || token(pair.first())? != token(pair.get(1))? {
                return Err(fail());
            }
        }
        if !fact_ids.insert(identity) {
            return Err(fail());
        }
        facts.entry(ty).or_default().push(known);
    }
    let mut covered =
        std::collections::HashMap::<Utf16, (bool, std::collections::HashSet<Utf16>)>::new();
    for c in arr(get(input, "coverage"))? {
        charge(ctx, 1)?;
        exact(c, &["type", "complete", "fields"])?;
        let ty = token(get(c, "type"))?;
        let allowed = &membership.get(&ty).ok_or_else(fail)?.0;
        let mut fs = std::collections::HashSet::new();
        for f in arr(get(c, "fields"))? {
            charge(ctx, 1)?;
            let f = token(Some(f))?;
            if !allowed.contains(&f) || !fs.insert(f) {
                return Err(fail());
            }
        }
        if covered
            .insert(ty, (flag(get(c, "complete"))?, fs))
            .is_some()
        {
            return Err(fail());
        }
    }
    let mut work = 0usize;
    for (ty, (_, known)) in &covered {
        for fields in facts.get(ty).into_iter().flatten() {
            charge(ctx, 1 + known.len())?;
            if !fields.is_superset(known) {
                return Err(fail());
            }
            work += known.len();
        }
    }
    let mut plans = std::collections::HashMap::<
        Utf16,
        (
            std::collections::HashSet<Utf16>,
            std::collections::HashSet<Utf16>,
        ),
    >::new();
    for p in arr(get(input, "graphPlans"))? {
        charge(ctx, 1)?;
        exact(p, &["relationship", "roles", "fields"])?;
        let rel = token(get(p, "relationship"))?;
        let mut roles = std::collections::HashSet::new();
        for x in arr(get(p, "roles"))? {
            charge(ctx, 1)?;
            if !roles.insert(token(Some(x))?) {
                return Err(fail());
            }
        }
        let mut fields = std::collections::HashSet::new();
        for x in arr(get(p, "fields"))? {
            charge(ctx, 1)?;
            if !fields.insert(token(Some(x))?) {
                return Err(fail());
            }
        }
        if plans.insert(rel, (roles, fields)).is_some() {
            return Err(fail());
        }
    }
    let mut graph_ids = std::collections::HashSet::<(Utf16, Utf16)>::new();
    let mut graphs = std::collections::HashMap::<
        Utf16,
        Vec<(
            std::collections::HashSet<Utf16>,
            std::collections::HashSet<Utf16>,
        )>,
    >::new();
    for g in arr(get(input, "graphs"))? {
        charge(ctx, 1)?;
        exact(g, &["relationship", "identity", "roles", "fields"])?;
        let rel = token(get(g, "relationship"))?;
        let ident = token(get(g, "identity"))?;
        if !graph_ids.insert((rel.clone(), ident)) {
            return Err(fail());
        }
        let plan = plans.get(&rel).ok_or_else(fail)?;
        let mut roles = std::collections::HashSet::new();
        for v in arr(get(g, "roles"))? {
            charge(ctx, 1)?;
            let role = token(Some(v))?;
            if !plan.0.contains(&role) || !roles.insert(role) {
                return Err(fail());
            }
        }
        let mut fields = std::collections::HashSet::new();
        for v in arr(get(g, "fields"))? {
            charge(ctx, 1)?;
            let field = token(Some(v))?;
            if !plan.1.contains(&field) || !fields.insert(field) {
                return Err(fail());
            }
        }
        graphs.entry(rel).or_default().push((roles, fields));
    }
    let mut gc = std::collections::HashSet::<Utf16>::new();
    for c in arr(get(input, "graphCoverage"))? {
        charge(ctx, 1)?;
        exact(c, &["relationship", "complete", "roles", "fields"])?;
        let rel = token(get(c, "relationship"))?;
        flag(get(c, "complete"))?;
        let plan = plans.get(&rel).ok_or_else(fail)?;
        let mut roles = std::collections::HashSet::new();
        for v in arr(get(c, "roles"))? {
            charge(ctx, 1)?;
            let role = token(Some(v))?;
            if !plan.0.contains(&role) || !roles.insert(role) {
                return Err(fail());
            }
        }
        let mut fields = std::collections::HashSet::new();
        for v in arr(get(c, "fields"))? {
            charge(ctx, 1)?;
            let field = token(Some(v))?;
            if !plan.1.contains(&field) || !fields.insert(field) {
                return Err(fail());
            }
        }
        for (graph_roles, graph_fields) in graphs.get(&rel).into_iter().flatten() {
            charge(ctx, 1 + roles.len() + fields.len())?;
            if !graph_roles.is_superset(&roles) || !graph_fields.is_superset(&fields) {
                return Err(fail());
            }
            work += roles.len() + fields.len();
        }
        if !gc.insert(rel) {
            return Err(fail());
        }
    }
    Ok(Value::Object(vec![
        (Utf16::from("admitted"), Value::Bool(true)),
        (Utf16::from("workUnits"), Value::Number(work as f64)),
    ]))
}

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (key.into(), value))
            .collect(),
    )
}

/// Select checked condition positions and admit the closed request scope.
pub fn plan_request(input: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let action = token(get(input, "action"))?;
    if !arr(get(input, "actions"))?.contains(&Value::String(action.clone())) {
        return Err(fail());
    }
    let context_fields = arr(get(input, "contextFields"))?;
    let mut context = std::collections::HashSet::new();
    for value in arr(get(input, "context"))? {
        charge(ctx, 1)?;
        let name = token(Some(value))?;
        if !context_fields.contains(value) || !context.insert(name) {
            return Err(fail());
        }
    }
    let targets = arr(get(input, "targets"))?;
    if targets.is_empty() {
        return Err(fail());
    }
    let mut scope = std::collections::HashMap::new();
    let mut positions = vec![Vec::new(); targets.len()];
    for (index, target) in targets.iter().enumerate() {
        charge(ctx, 1)?;
        if !flag(get(target, "complete"))?
            || scope.insert(token(get(target, "type"))?, index).is_some()
        {
            return Err(fail());
        }
    }
    for resource in arr(get(input, "resources"))? {
        charge(ctx, 1)?;
        if !scope.contains_key(&token(Some(resource))?) {
            return Err(fail());
        }
    }
    let mut fields = std::collections::HashSet::new();
    for field in arr(get(input, "fields"))? {
        charge(ctx, 1)?;
        if !fields.insert(token(Some(field))?) {
            return Err(fail());
        }
    }
    for target in targets {
        let members = arr(get(target, "fields"))?;
        charge(ctx, members.len())?;
        let members = members
            .iter()
            .map(|member| token(Some(member)))
            .collect::<Result<std::collections::HashSet<_>, _>>()?;
        if !members.is_superset(&fields) {
            return Err(fail());
        }
    }
    for (index, condition) in arr(get(input, "conditions"))?.iter().enumerate() {
        charge(ctx, 1)?;
        if let Some(target) = scope.get(&token(get(condition, "type"))?) {
            if arr(get(condition, "actions"))?.contains(&Value::String(action.clone())) {
                positions[*target].push(Value::Number(index as f64));
            }
        }
    }
    Ok(Value::Array(
        positions.into_iter().map(Value::Array).collect(),
    ))
}

pub fn admit_date_profiles(input: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    use crate::gregorian_date::GREGORIAN_DATE_PROFILE;
    let mut known = std::collections::HashSet::new();
    for value in arr(Some(input))? {
        charge(ctx, 1)?;
        let key = token(get(value, "key"))?;
        let field = required(value, "field")?;
        if !known.insert(key)
            || get(value, "profile") != Some(&Value::string_utf8(GREGORIAN_DATE_PROFILE))
            || get(field, "scalarType") != Some(&Value::string_utf8("date"))
            || get(field, "cardinality") != Some(&Value::string_utf8("one"))
            || !matches!(
                text(get(field, "nullability"))
                    .and_then(|value| value.to_utf8().ok())
                    .as_deref(),
                Some("required" | "absent-allowed")
            )
            || get(field, "itemType").is_some()
            || matches!(get(field, "references"), Some(Value::Array(values)) if !values.is_empty())
            || matches!(get(field, "facets"), Some(Value::Object(values)) if !values.is_empty())
            || get(field, "allowedValues").is_some()
            || get(field, "default").is_some()
        {
            return Err(fail());
        }
    }
    Ok(Value::Bool(true))
}
fn required<'a>(value: &'a Value, key: &str) -> Result<&'a Value, EngineError> {
    get(value, key).ok_or_else(fail)
}
fn limit(value: Option<&Value>, max: usize) -> Result<usize, EngineError> {
    match value {
        Some(Value::Number(number))
            if *number >= 1.0 && *number <= max as f64 && number.fract() == 0.0 =>
        {
            Ok(*number as usize)
        }
        _ => Err(fail()),
    }
}
fn bounded_list(value: &Value, key: &str, limit: usize) -> Result<usize, EngineError> {
    let length = arr(get(value, key))?.len();
    if length > limit {
        return Err(fail());
    }
    Ok(length)
}
fn pin(actual: &Value, expected: &Value, keys: &[&str]) -> Result<(), EngineError> {
    exact(actual, keys)?;
    for key in keys {
        let actual = token(get(actual, key))?;
        if text(get(expected, key)).as_ref() != Some(&actual) {
            return Err(fail());
        }
    }
    Ok(())
}
fn snapshot_units(packet: &Value, ctx: &mut Context<'_>) -> Result<(usize, usize), EngineError> {
    let mut nodes = 0;
    let mut units = 0;
    let mut pending = vec![packet];
    while let Some(value) = pending.pop() {
        charge(ctx, 1)?;
        nodes += 1;
        match value {
            Value::String(text) => units += text.len(),
            Value::Array(items) => {
                for (index, value) in items.iter().enumerate() {
                    units += index.to_string().len();
                    pending.push(value);
                }
            }
            Value::Object(fields) => {
                for (key, value) in fields {
                    units += key.len();
                    pending.push(value);
                }
            }
            _ => {}
        }
    }
    Ok((nodes, units))
}

/// Admit the catalog cut header and normalize the operation request before any
/// fact key or field capabilities are invoked.
pub fn admit_cut(input: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let packet = required(input, "packet")?;
    let owner = required(packet, "owner")?;
    let cut = required(packet, "cut")?;
    let request = required(packet, "request")?;
    let source = required(input, "source")?;
    let read_action = get(owner, "disclosure").and_then(|disclosure| get(disclosure, "readAction"));
    let normalized = if flag(get(input, "scan"))? {
        exact(request, &["type", "fields"])?;
        object(vec![
            ("action", read_action.cloned().unwrap_or(Value::Null)),
            ("resources", Value::Array(Vec::new())),
            (
                "targets",
                Value::Array(vec![required(request, "type")?.clone()]),
            ),
            ("fields", required(request, "fields")?.clone()),
        ])
    } else {
        exact(request, &["action", "resources", "targets", "fields"])?;
        request.clone()
    };
    exact(
        cut,
        &[
            "version",
            "trusted",
            "generation",
            "expectedGeneration",
            "policy",
            "ontology",
            "protection",
            "domains",
            "owner",
            "subject",
            "facts",
            "graphs",
            "coverage",
            "graphCoverage",
            "context",
            "valueProfiles",
            "maxFacts",
            "maxSteps",
        ],
    )?;
    let generation = token(get(cut, "generation"))?;
    if get(cut, "version") != Some(&Value::string_utf8("umf.security.logical-facts/0.1"))
        || get(cut, "trusted") != Some(&Value::Bool(true))
        || text(get(cut, "expectedGeneration")).as_ref() != Some(&generation)
    {
        return Err(fail());
    }
    pin(required(cut, "owner")?, owner, &["id", "revision"])?;
    pin(
        required(cut, "policy")?,
        required(source, "policy")?,
        &["id", "revision"],
    )?;
    pin(
        required(cut, "ontology")?,
        required(source, "ontology")?,
        &["documentId", "revision"],
    )?;
    match required(source, "protection")? {
        Value::Null if get(cut, "protection") == Some(&Value::Null) => {}
        Value::Null => return Err(fail()),
        protection => pin(
            required(cut, "protection")?,
            protection,
            &["id", "revision"],
        )?,
    }
    let mut domains = std::collections::HashMap::new();
    for domain in arr(get(source, "domains"))? {
        domains.insert(
            token(get(domain, "documentId"))?,
            token(get(domain, "revision"))?,
        );
    }
    bounded_list(cut, "domains", 256)?;
    for domain in arr(get(cut, "domains"))? {
        exact(domain, &["documentId", "revision"])?;
        if domains.remove(&token(get(domain, "documentId"))?).as_ref()
            != Some(&token(get(domain, "revision"))?)
        {
            return Err(fail());
        }
    }
    if !domains.is_empty() {
        return Err(fail());
    }
    let facts = limit(get(cut, "maxFacts"), 10_000)?;
    let steps = limit(get(cut, "maxSteps"), 1_000_000)?;
    let (work, text) = snapshot_units(packet, ctx)?;
    if bounded_list(cut, "facts", facts)?
        + bounded_list(cut, "graphs", facts)?
        + bounded_list(&normalized, "resources", facts)?
        > facts
    {
        return Err(fail());
    }
    for key in ["coverage", "graphCoverage", "context"] {
        bounded_list(cut, key, 256)?;
    }
    bounded_list(cut, "valueProfiles", 4096)?;
    bounded_list(&normalized, "targets", 256)?;
    bounded_list(&normalized, "fields", 4096)?;
    if flag(get(input, "render"))?
        && (read_action.is_none() || get(&normalized, "action") != read_action)
    {
        return Err(fail());
    }
    Ok(object(vec![
        ("request", normalized),
        ("maxSteps", Value::Number(steps as f64)),
        ("workUnits", Value::Number(work as f64)),
        ("textUnits", Value::Number(text as f64)),
    ]))
}

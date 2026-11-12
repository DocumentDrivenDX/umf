// SPDX-License-Identifier: MIT OR Apache-2.0
//! Pure normalized before/after catalog write comparison.
use crate::{
    context::Context,
    error::EngineError,
    value::{Utf16, Value},
};
use std::collections::{HashMap, HashSet};

fn get<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = v else {
        return None;
    };
    fields
        .iter()
        .find(|(k, _)| k == &Utf16::from(name))
        .map(|(_, v)| v)
}
fn same_qualified_ref(a: &Value, b: &Value) -> Result<bool, EngineError> {
    Ok(["documentId", "moduleId", "elementId"].iter().all(|name| {
        match (get(a, name), get(b, name)) {
            (Some(Value::String(a)), Some(Value::String(b))) => a == b,
            _ => false,
        }
    }))
}
fn same_qualified_relationship(a: &Value, b: &Value) -> Result<bool, EngineError> {
    Ok(["documentId", "moduleId", "relationshipId"]
        .iter()
        .all(|name| match (get(a, name), get(b, name)) {
            (Some(Value::String(a)), Some(Value::String(b))) => a == b,
            _ => false,
        }))
}
fn strict_json_primitive_equal(a: Option<&Value>, b: Option<&Value>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(Value::Null), Some(Value::Null)) => true,
        (Some(Value::Bool(a)), Some(Value::Bool(b))) => a == b,
        (Some(Value::Number(a)), Some(Value::Number(b))) => a == b,
        (Some(Value::String(a)), Some(Value::String(b))) => a == b,
        _ => false,
    }
}
fn string(v: Option<&Value>) -> Result<Utf16, EngineError> {
    match v {
        Some(Value::String(s)) => Ok(s.clone()),
        _ => Err(invalid()),
    }
}
fn array(v: Option<&Value>) -> Result<&[Value], EngineError> {
    match v {
        Some(Value::Array(a)) => Ok(a),
        _ => Err(invalid()),
    }
}
fn invalid() -> EngineError {
    EngineError::new(
        "SECURITY_CATALOG_WRITE_UNRESOLVED",
        Utf16::default(),
        "Catalog write snapshot comparison is unresolved",
    )
}

/// Fold already-evaluated catalog authorization obligations with the native
/// three-valued decision precedence. The host may transport obligations, but
/// cannot choose the transaction outcome.
pub fn fold_catalog_write_decisions(input: &Value) -> Result<Value, EngineError> {
    let decisions = array(Some(input))?;
    let mut all_permit = true;
    let mut unresolved = false;
    for decision in decisions {
        match string(Some(decision))? {
            value if value == Utf16::from("permit") => {}
            value if value == Utf16::from("deny") => all_permit = false,
            value if value == Utf16::from("indeterminate") || value == Utf16::from("conflict") => {
                unresolved = true;
                all_permit = false;
            }
            _ => return Err(invalid()),
        }
    }
    Ok(Value::String(Utf16::from(if unresolved {
        "indeterminate"
    } else if all_permit {
        "permit"
    } else {
        "deny"
    })))
}

/// Return changed-field indices whose blind action did not permit.
pub fn catalog_write_read_needs(input: &Value) -> Result<Value, EngineError> {
    let mut needs = Vec::new();
    for (index, item) in array(Some(input))?.iter().enumerate() {
        let decision = string(Some(item))?;
        if !["permit", "deny", "indeterminate", "conflict"]
            .iter()
            .any(|v| decision == Utf16::from(*v))
        {
            return Err(invalid());
        }
        if decision != Utf16::from("permit") {
            needs.push(Value::Number(index as f64));
        }
    }
    Ok(Value::Array(needs))
}

/// Resolve each conditional read fallback from native decisions and typed
/// original-disposition evidence supplied by the evaluator callback.
pub fn resolve_catalog_write_read(input: &Value) -> Result<Value, EngineError> {
    let mut decisions = Vec::new();
    for item in array(Some(input))? {
        let blind = string(get(item, "blind"))?;
        let read = string(get(item, "read"))?;
        if !["permit", "deny", "indeterminate", "conflict"]
            .iter()
            .any(|v| blind == Utf16::from(*v))
            || !["permit", "deny", "indeterminate", "conflict"]
                .iter()
                .any(|v| read == Utf16::from(*v))
        {
            return Err(invalid());
        }
        let original = match get(item, "original") {
            Some(Value::Bool(v)) => *v,
            _ => return Err(invalid()),
        };
        let result = if read == Utf16::from("permit") && original {
            "permit"
        } else if [blind.clone(), read.clone()]
            .iter()
            .any(|d| d == &Utf16::from("indeterminate") || d == &Utf16::from("conflict"))
        {
            "indeterminate"
        } else {
            "deny"
        };
        decisions.push(Value::String(Utf16::from(result)));
    }
    Ok(Value::Array(decisions))
}

/// Build ordered unconditional action requests for each mutation/cut. The
/// host invokes the typed evaluator for each returned request.
pub fn plan_catalog_write_actions(input: &Value) -> Result<Value, EngineError> {
    let mut profiles =
        HashMap::<Utf16, (Utf16, Utf16, Utf16, Utf16, Utf16, HashMap<Utf16, Utf16>)>::new();
    for profile in array(get(input, "profiles"))? {
        let ty = string(get(profile, "type"))?;
        let mut fields = HashMap::new();
        for pair in array(get(profile, "fieldActions"))? {
            let pair = array(Some(pair))?;
            if pair.len() != 2
                || fields
                    .insert(string(pair.first())?, string(pair.get(1))?)
                    .is_some()
            {
                return Err(invalid());
            }
        }
        let value = (
            string(get(profile, "createAction"))?,
            string(get(profile, "updateAction"))?,
            string(get(profile, "deleteAction"))?,
            string(get(profile, "ownershipAction"))?,
            string(get(profile, "policyAction"))?,
            fields,
        );
        if profiles.insert(ty, value).is_some() {
            return Err(invalid());
        }
    }
    let mut storage = HashMap::<(Utf16, Utf16), Vec<Utf16>>::new();
    for item in array(get(input, "storageActions"))? {
        let purposes = strings(get(item, "purposes"))?;
        if purposes.as_slice() != [Utf16::from("vault-write")] {
            return Err(invalid());
        }
        let key = (string(get(item, "type"))?, string(get(item, "field"))?);
        storage
            .entry(key)
            .or_default()
            .push(string(get(item, "action"))?);
    }
    let mut requests = Vec::new();
    for mutation in array(get(input, "mutations"))? {
        let key = string(get(mutation, "key"))?;
        let ty = string(get(mutation, "type"))?;
        let operation = string(get(mutation, "operation"))?;
        let profile = profiles.get(&ty).ok_or_else(invalid)?;
        let changed = strings(get(mutation, "changed"))?;
        let mut actions = Vec::new();
        let object_action = match operation.units() {
            [99, 114, 101, 97, 116, 101] => &profile.0,
            [117, 112, 100, 97, 116, 101] => &profile.1,
            [100, 101, 108, 101, 116, 101] => &profile.2,
            _ => return Err(invalid()),
        };
        actions.push(object_action.clone());
        for field in &changed {
            actions.push(profile.5.get(field).ok_or_else(invalid)?.clone());
        }
        let ownership = match get(mutation, "ownership") {
            Some(Value::Bool(value)) => *value,
            _ => return Err(invalid()),
        };
        let policy = match get(mutation, "policy") {
            Some(Value::Bool(value)) => *value,
            _ => return Err(invalid()),
        };
        if ownership {
            actions.push(profile.3.clone());
        }
        if policy {
            actions.push(profile.4.clone());
        }
        for field in &changed {
            if let Some(extra) = storage.get(&(ty.clone(), field.clone())) {
                actions.extend(extra.iter().cloned());
            }
        }
        let mut unique = HashSet::new();
        actions.retain(|action| unique.insert(action.clone()));
        let states: &[&str] = match operation.units() {
            [99, 114, 101, 97, 116, 101] => &["after"],
            [100, 101, 108, 101, 116, 101] => &["before"],
            _ => &["before", "after"],
        };
        for state in states {
            for action in &actions {
                requests.push(object(vec![
                    ("key", str_value(key.clone())),
                    ("state", Value::String(Utf16::from(*state))),
                    ("action", str_value(action.clone())),
                ]));
            }
        }
    }
    Ok(Value::Array(requests))
}

/// Walk source conditions with lexical association occurrences and enforce
/// that every referenced policy field is declared by its profile.
pub fn validate_catalog_write_dependencies(input: &Value) -> Result<Value, EngineError> {
    fn index(value: Option<&Value>) -> Result<usize, EngineError> {
        match value {
            Some(Value::Number(n))
                if n.is_finite() && n.fract() == 0.0 && *n >= 0.0 && *n <= usize::MAX as f64 =>
            {
                Ok(*n as usize)
            }
            _ => Err(invalid()),
        }
    }
    fn add_field(
        fields: &mut Vec<(Value, Value)>,
        ty: &Value,
        field: &Value,
    ) -> Result<(), EngineError> {
        if !fields.iter().any(|(t, f)| {
            same_qualified_ref(t, ty).unwrap_or(false)
                && same_qualified_ref(f, field).unwrap_or(false)
        }) {
            fields.push((ty.clone(), field.clone()));
        }
        Ok(())
    }
    fn add_key(
        fields: &mut Vec<(Value, Value)>,
        ty: &Value,
        key: &Value,
    ) -> Result<(), EngineError> {
        let document = get(ty, "documentId").ok_or_else(invalid)?.clone();
        let elements = array(get(key, "fields"))?;
        for item in elements {
            let module = get(item, "module").ok_or_else(invalid)?.clone();
            let element = get(item, "element").ok_or_else(invalid)?.clone();
            let field = object(vec![
                ("documentId", document.clone()),
                ("moduleId", module),
                ("elementId", element),
            ]);
            add_field(fields, ty, &field)?;
        }
        Ok(())
    }
    fn walk(
        expr: &Value,
        vars: &HashMap<usize, usize>,
        associations: &[Value],
        fields: &mut Vec<(Value, Value)>,
        dependent: &mut HashSet<usize>,
        work: &mut usize,
    ) -> Result<(), EngineError> {
        *work = (*work).saturating_add(1);
        match string(get(expr, "op"))?
            .to_utf8()
            .map_err(|_| invalid())?
            .as_str()
        {
            "eq" => {
                for name in ["left", "right"] {
                    *work = (*work).saturating_add(1);
                    let term = get(expr, name).ok_or_else(invalid)?;
                    let kind = string(get(term, "kind"))?;
                    let desc = get(term, "term").ok_or_else(invalid)?;
                    let desc_kind = string(get(desc, "kind"))?;
                    if kind == Utf16::from("entity-term") {
                        if desc_kind == Utf16::from("record-attribute") {
                            add_field(
                                fields,
                                get(desc, "type").ok_or_else(invalid)?,
                                get(desc, "field").ok_or_else(invalid)?,
                            )?;
                        } else if desc_kind == Utf16::from("entity-identity") {
                            add_key(
                                fields,
                                get(desc, "type").ok_or_else(invalid)?,
                                get(desc, "key").ok_or_else(invalid)?,
                            )?;
                        }
                    } else if kind == Utf16::from("witness-term") {
                        let occurrence = index(get(term, "occurrence"))?;
                        let association_index = *vars.get(&occurrence).ok_or_else(invalid)?;
                        let check = associations.get(association_index).ok_or_else(invalid)?;
                        if desc_kind == Utf16::from("record-attribute") {
                            add_field(
                                fields,
                                get(desc, "type").ok_or_else(invalid)?,
                                get(desc, "field").ok_or_else(invalid)?,
                            )?;
                        } else if desc_kind == Utf16::from("record-identity")
                            || desc_kind == Utf16::from("entity-identity")
                        {
                            add_key(
                                fields,
                                get(desc, "type").ok_or_else(invalid)?,
                                get(desc, "key").ok_or_else(invalid)?,
                            )?;
                            if desc_kind == Utf16::from("entity-identity")
                                && string(get(check, "kind"))?
                                    == Utf16::from("candidate-record-association-checks/0.1")
                            {
                                let owner_type =
                                    get(get(check, "plan").ok_or_else(invalid)?, "type")
                                        .ok_or_else(invalid)?;
                                for field in array(get(desc, "fields"))? {
                                    add_field(fields, owner_type, field)?;
                                }
                            }
                        }
                    }
                }
            }
            "and" | "or" => {
                for arg in array(get(expr, "args"))? {
                    walk(arg, vars, associations, fields, dependent, work)?;
                }
            }
            "not" => walk(
                get(expr, "arg").ok_or_else(invalid)?,
                vars,
                associations,
                fields,
                dependent,
                work,
            )?,
            "exists" => {
                let association = index(get(expr, "association"))?;
                let occurrence = index(get(expr, "occurrence"))?;
                dependent.insert(association);
                let mut next = vars.clone();
                next.insert(occurrence, association);
                walk(
                    get(expr, "where").ok_or_else(invalid)?,
                    &next,
                    associations,
                    fields,
                    dependent,
                    work,
                )?;
            }
            _ => {}
        }
        Ok(())
    }
    let associations = array(get(input, "associations"))?;
    let mut fields = Vec::<(Value, Value)>::new();
    let mut dependent = HashSet::<usize>::new();
    let mut work = 0usize;
    for condition in array(get(input, "conditions"))? {
        let expression = get(
            get(condition, "condition").ok_or_else(invalid)?,
            "expression",
        )
        .ok_or_else(invalid)?;
        walk(
            expression,
            &HashMap::new(),
            associations,
            &mut fields,
            &mut dependent,
            &mut work,
        )?;
    }
    for profile in array(get(input, "profiles"))? {
        let ty = get(profile, "type").ok_or_else(invalid)?;
        let policy = array(get(profile, "policyFields"))?;
        if fields.iter().any(|(field_type, field)| {
            same_qualified_ref(field_type, ty).unwrap_or(false)
                && !policy
                    .iter()
                    .any(|candidate| same_qualified_ref(candidate, field).unwrap_or(false))
        }) {
            return Err(invalid());
        }
    }
    Ok(object(vec![
        (
            "dependencyAssociations",
            Value::Array(
                dependent
                    .into_iter()
                    .map(|i| Value::Number(i as f64))
                    .collect(),
            ),
        ),
        ("workUnits", Value::Number(work as f64)),
    ]))
}

/// Admit association bindings against the original checked plans and owned
/// entity profiles. Host parsing only preserves the qualified source objects.
pub fn admit_catalog_write_associations(input: &Value) -> Result<Value, EngineError> {
    let checks = array(get(input, "associations"))?;
    let bindings = array(get(input, "bindings"))?;
    if checks.len() > 256 || bindings.len() != checks.len() {
        return Err(invalid());
    }
    let profiles = array(get(input, "profileTypes"))?;
    let mut selected = HashSet::new();
    let mut indices = Vec::new();
    for binding in bindings {
        let source = get(binding, "source").ok_or_else(invalid)?;
        let source_kind = string(get(source, "kind"))?;
        let source_ref = get(source, "ref").ok_or_else(invalid)?;
        let mut match_index = None;
        for (index, check) in checks.iter().enumerate() {
            let check_kind = string(get(check, "kind"))?;
            let (expected_kind, expected_ref) =
                if check_kind == Utf16::from("candidate-graph-relationship-checks/0.1") {
                    (
                        Utf16::from("core-relationship"),
                        get(get(check, "plan").ok_or_else(invalid)?, "relationship")
                            .ok_or_else(invalid)?,
                    )
                } else if check_kind == Utf16::from("candidate-record-association-checks/0.1") {
                    (
                        Utf16::from("record-members"),
                        get(get(check, "plan").ok_or_else(invalid)?, "type").ok_or_else(invalid)?,
                    )
                } else {
                    return Err(invalid());
                };
            let ref_equal = if expected_kind == Utf16::from("core-relationship") {
                same_qualified_relationship(source_ref, expected_ref)?
            } else {
                same_qualified_ref(source_ref, expected_ref)?
            };
            if source_kind == expected_kind && ref_equal {
                match_index = Some(index);
            }
        }
        let index = match_index.ok_or_else(invalid)?;
        if !selected.insert(index) {
            return Err(invalid());
        }
        indices.push(index);
        let check = &checks[index];
        let graph =
            string(get(check, "kind"))? == Utf16::from("candidate-graph-relationship-checks/0.1");
        let mode = string(get(binding, "mode"))?;
        if mode == Utf16::from("immutable") {
            if get(binding, "ownerType").is_some() || get(binding, "anchor").is_some() {
                return Err(invalid());
            }
            continue;
        }
        if mode != Utf16::from("owned") {
            return Err(invalid());
        }
        let owner = get(binding, "ownerType").ok_or_else(invalid)?;
        if !profiles.iter().any(|profile| {
            get(profile, "type")
                .and_then(|ty| same_qualified_ref(ty, owner).ok())
                .unwrap_or(false)
        }) {
            return Err(invalid());
        }
        let anchor = get(binding, "anchor").ok_or_else(invalid)?;
        let anchor_kind = string(get(anchor, "kind"))?;
        if anchor_kind == Utf16::from("endpoint") {
            let role = string(get(anchor, "role"))?;
            let endpoints = array(get(get(check, "plan").ok_or_else(invalid)?, "endpoints"))?;
            if !endpoints.iter().any(|endpoint| {
                string(get(endpoint, "role")).ok().as_ref() == Some(&role)
                    && get(endpoint, "target")
                        .and_then(|target| same_qualified_ref(target, owner).ok())
                        .unwrap_or(false)
            }) {
                return Err(invalid());
            }
        } else if anchor_kind == Utf16::from("witness") {
            let plan = get(check, "plan").ok_or_else(invalid)?;
            let witness_type = if graph {
                let witness = get(plan, "witness").ok_or_else(invalid)?;
                if string(get(witness, "kind"))? != Utf16::from("record-key") {
                    return Err(invalid());
                }
                get(witness, "type").ok_or_else(invalid)?
            } else {
                get(plan, "type").ok_or_else(invalid)?
            };
            if !same_qualified_ref(witness_type, owner)? {
                return Err(invalid());
            }
        } else {
            return Err(invalid());
        }
    }
    if selected.len() != checks.len() {
        return Err(invalid());
    }
    Ok(Value::Array(
        indices
            .into_iter()
            .map(|i| Value::Number(i as f64))
            .collect(),
    ))
}

/// Validate complete record-field and graph role/attribute coverage for one
/// catalog cut, returning the same bounded work charge as the host guard.
pub fn validate_catalog_write_coverage(input: &Value) -> Result<Value, EngineError> {
    let entities = array(get(input, "entities"))?;
    let associations = array(get(input, "associations"))?;
    let cut = get(input, "cut").ok_or_else(invalid)?;
    let mut work = 0usize;
    let coverage = array(get(cut, "coverage"))?;
    for entry in coverage {
        let ty = get(entry, "type").ok_or_else(invalid)?;
        let entity = entities.iter().find(|entity| {
            get(entity, "type")
                .and_then(|candidate| same_qualified_ref(candidate, ty).ok())
                .unwrap_or(false)
        });
        let fields = array(get(entry, "fields"))?;
        work = work.saturating_add(fields.len());
        let field_set = unique_qualified_refs(fields)?;
        let expected = entity.ok_or_else(invalid)?;
        let expected_fields_raw = array(get(expected, "fields"))?;
        let expected_fields = unique_qualified_refs(expected_fields_raw)?;
        let complete = matches!(get(entry, "complete"), Some(Value::Bool(true)));
        if !complete
            || field_set.len() != expected_fields_raw.len()
            || field_set.len() != expected_fields.len()
            || expected_fields.iter().any(|field| {
                !field_set
                    .iter()
                    .any(|candidate| same_qualified_ref(candidate, field).unwrap_or(false))
            })
        {
            return Err(invalid());
        }
    }
    if coverage.len() != entities.len() {
        return Err(invalid());
    }
    let has_graph = associations.iter().any(|check| {
        string(get(check, "kind")).ok().as_ref()
            == Some(&Utf16::from("candidate-graph-relationship-checks/0.1"))
    });
    let graph_coverage = if has_graph {
        array(get(cut, "graphCoverage"))?
    } else {
        &[]
    };
    for check in associations {
        if string(get(check, "kind"))? != Utf16::from("candidate-graph-relationship-checks/0.1") {
            continue;
        }
        let plan = get(check, "plan").ok_or_else(invalid)?;
        let relationship = get(plan, "relationship").ok_or_else(invalid)?;
        let entry = graph_coverage
            .iter()
            .find(|entry| {
                get(entry, "relationship")
                    .and_then(|candidate| same_qualified_relationship(candidate, relationship).ok())
                    .unwrap_or(false)
            })
            .ok_or_else(invalid)?;
        let endpoints = array(get(plan, "endpoints"))?;
        let roles: Vec<Utf16> = endpoints
            .iter()
            .map(|endpoint| string(get(endpoint, "role")))
            .collect::<Result<_, _>>()?;
        let attributes = if string(get(get(plan, "witness").ok_or_else(invalid)?, "kind"))?
            == Utf16::from("record-key")
        {
            array(get(get(plan, "witness").ok_or_else(invalid)?, "attributes"))?
        } else {
            &[]
        };
        let roles_present = strings(get(entry, "roles"))?;
        let fields = array(get(entry, "fields"))?;
        work = work
            .saturating_add(roles_present.len())
            .saturating_add(fields.len());
        let role_set: HashSet<Utf16> = roles_present.iter().cloned().collect();
        let field_set = unique_qualified_refs(fields)?;
        let complete = matches!(get(entry, "complete"), Some(Value::Bool(true)));
        if !complete
            || role_set.len() != roles.len()
            || roles.iter().any(|role| !role_set.contains(role))
            || field_set.len() != attributes.len()
            || attributes.iter().any(|field| {
                !field_set
                    .iter()
                    .any(|candidate| same_qualified_ref(candidate, field).unwrap_or(false))
            })
        {
            return Err(invalid());
        }
    }
    Ok(Value::Number(work as f64))
}

fn unique_qualified_refs(values: &[Value]) -> Result<Vec<Value>, EngineError> {
    let mut out: Vec<Value> = Vec::new();
    for value in values {
        if !out
            .iter()
            .any(|candidate| same_qualified_ref(candidate, value).unwrap_or(false))
        {
            out.push(value.clone());
        }
    }
    Ok(out)
}

/// Compute ownership/policy obligations from normalized before/after incidence
/// multisets. Typed association and key interpretation stays at the host edge.
pub fn plan_catalog_write_incidence(input: &Value) -> Result<Value, EngineError> {
    fn grouped(
        value: Option<&Value>,
    ) -> Result<HashMap<Utf16, (usize, Option<Utf16>)>, EngineError> {
        let mut out = HashMap::new();
        for row in array(value)? {
            let signature = string(get(row, "signature"))?;
            let anchor = match get(row, "anchor") {
                Some(Value::Null) => None,
                value => Some(string(value)?),
            };
            let entry = out.entry(signature).or_insert((0usize, anchor.clone()));
            if entry.1 != anchor {
                return Err(invalid());
            }
            entry.0 = entry.0.checked_add(1).ok_or_else(invalid)?;
        }
        Ok(out)
    }
    let mutations = array(get(input, "mutations"))?;
    if mutations.len() > 256 {
        return Err(invalid());
    }
    let mut mutation_index = HashMap::new();
    let mut types = Vec::new();
    let mut operations = Vec::new();
    for (index, mutation) in mutations.iter().enumerate() {
        let key = string(get(mutation, "key"))?;
        let ty = string(get(mutation, "type"))?;
        operations.push(string(get(mutation, "operation"))?);
        if !["create", "update", "delete"]
            .iter()
            .any(|op| operations.last() == Some(&Utf16::from(*op)))
        {
            return Err(invalid());
        }
        if mutation_index.insert(key, index).is_some() {
            return Err(invalid());
        }
        types.push(ty);
    }
    let mut obligations = vec![(false, false); mutations.len()];
    let mut work_units = 0usize;
    let before_facts: HashSet<Utf16> = array(get(input, "beforeFacts"))?
        .iter()
        .map(|v| string(Some(v)))
        .collect::<Result<_, _>>()?;
    let after_facts: HashSet<Utf16> = array(get(input, "afterFacts"))?
        .iter()
        .map(|v| string(Some(v)))
        .collect::<Result<_, _>>()?;
    let associations = array(get(input, "associations"))?;
    if associations.len() > 256 {
        return Err(invalid());
    }
    for association in associations {
        let before = grouped(get(association, "before"))?;
        let after = grouped(get(association, "after"))?;
        let binding = get(association, "binding").ok_or_else(invalid)?;
        let mode = string(get(binding, "mode"))?;
        if mode != Utf16::from("owned") && mode != Utf16::from("immutable") {
            return Err(invalid());
        }
        let dependency = match get(association, "dependency") {
            Some(Value::Bool(value)) => *value,
            _ => return Err(invalid()),
        };
        let owner_type = if mode == Utf16::from("owned") {
            string(get(binding, "ownerType"))?
        } else {
            Utf16::default()
        };
        for (index, ty) in types.iter().enumerate() {
            if ty == &owner_type
                && operations[index] != Utf16::from("update")
                && mode == Utf16::from("owned")
            {
                obligations[index].0 = true;
                if dependency {
                    obligations[index].1 = true;
                }
            }
        }
        if mode != Utf16::from("owned") {
            if before != after {
                return Err(invalid());
            }
            continue;
        }
        let mut signatures: HashSet<Utf16> = before.keys().cloned().collect();
        signatures.extend(after.keys().cloned());
        for signature in signatures {
            work_units = work_units.saturating_add(1);
            let (old_count, old_anchor) = before.get(&signature).cloned().unwrap_or((0, None));
            let (new_count, new_anchor) = after.get(&signature).cloned().unwrap_or((0, None));
            let anchor = if old_count > new_count {
                if !before_facts.contains(old_anchor.as_ref().ok_or_else(invalid)?) {
                    return Err(invalid());
                }
                old_anchor
            } else if new_count > old_count {
                if !after_facts.contains(new_anchor.as_ref().ok_or_else(invalid)?) {
                    return Err(invalid());
                }
                new_anchor
            } else {
                continue;
            };
            work_units = work_units.saturating_add(old_count.abs_diff(new_count));
            let wanted = anchor.ok_or_else(invalid)?;
            let index = *mutation_index.get(&wanted).ok_or_else(invalid)?;
            if types[index] != owner_type {
                return Err(invalid());
            }
            obligations[index].0 = true;
            if dependency {
                obligations[index].1 = true;
            }
        }
    }
    let mut result = Vec::new();
    for (index, mutation) in mutations.iter().enumerate() {
        result.push(object(vec![
            ("key", str_value(string(get(mutation, "key"))?)),
            ("ownership", Value::Bool(obligations[index].0)),
            ("policy", Value::Bool(obligations[index].1)),
        ]));
    }
    Ok(object(vec![
        ("mutations", Value::Array(result)),
        ("workUnits", Value::Number(work_units as f64)),
    ]))
}

/// Validate the action/member portion of catalog write profiles from a
/// normalized, source-qualified admission packet.
pub fn admit_catalog_write_profiles(input: &Value) -> Result<Value, EngineError> {
    if let Some(envelope) = get(input, "envelope") {
        validate_catalog_write_envelope(envelope)?;
    }
    if matches!(get(input, "envelopeOnly"), Some(Value::Bool(true))) {
        return Ok(Value::Bool(true));
    }
    let mut purposes = HashMap::<Utf16, Vec<Utf16>>::new();
    for item in array(get(input, "actionPurposes"))? {
        let action = string(get(item, "action"))?;
        let values = strings(get(item, "purposes"))?;
        if purposes.insert(action, values).is_some() {
            return Err(invalid());
        }
    }
    let mut types = HashSet::new();
    let mut ordinary = HashSet::new();
    let mut blind_actions = Vec::new();
    let profiles = array(get(input, "profiles"))?;
    if profiles.is_empty() || profiles.len() > 256 {
        return Err(invalid());
    }
    for profile in profiles {
        let ty = string(get(profile, "type"))?;
        if !types.insert(ty) {
            return Err(invalid());
        }
        let object = strings(get(profile, "objectActions"))?;
        if object.len() != 3 || object.iter().collect::<HashSet<_>>().len() != 3 {
            return Err(invalid());
        }
        let policy = string(get(profile, "policyAction"))?;
        let ownership = string(get(profile, "ownershipAction"))?;
        let read = string(get(profile, "readAction"))?;
        if object.contains(&policy) || object.contains(&ownership) || policy == ownership {
            return Err(invalid());
        }
        for action in object.iter().chain([&policy, &ownership]) {
            let values = purposes.get(action).ok_or_else(invalid)?;
            if values.is_empty()
                || values.iter().any(|v| {
                    !["read", "field", "original-authorized"]
                        .iter()
                        .any(|x| v == &Utf16::from(*x))
                })
            {
                return Err(invalid());
            }
            ordinary.insert(action.clone());
        }
        let read_purposes = purposes.get(&read).ok_or_else(invalid)?;
        if read_purposes.is_empty()
            || !read_purposes.contains(&Utf16::from("read"))
            || read_purposes.iter().any(|v| {
                !["read", "field", "original-authorized"]
                    .iter()
                    .any(|x| v == &Utf16::from(*x))
            })
        {
            return Err(invalid());
        }
        ordinary.insert(read);
        let members: HashSet<Utf16> = strings(get(profile, "members"))?.into_iter().collect();
        if members.len() > 4096 {
            return Err(invalid());
        }
        let bindings = array(get(profile, "fieldActions"))?;
        if bindings.len() != members.len() {
            return Err(invalid());
        }
        let mut fields = HashSet::new();
        let mut field_actions = HashSet::new();
        for pair in bindings {
            let pair = array(Some(pair))?;
            if pair.len() != 2 {
                return Err(invalid());
            }
            let field = string(pair.first())?;
            let action = string(pair.get(1))?;
            let values = purposes.get(&action).ok_or_else(invalid)?;
            if !members.contains(&field)
                || !fields.insert(field)
                || object.contains(&action)
                || action == policy
                || action == ownership
                || values.is_empty()
                || !values.contains(&Utf16::from("field"))
                || values.iter().any(|v| {
                    !["read", "field", "original-authorized"]
                        .iter()
                        .any(|x| v == &Utf16::from(*x))
                })
            {
                return Err(invalid());
            }
            field_actions.insert(action.clone());
            ordinary.insert(action);
        }
        if fields.len() != members.len() || field_actions.len() > 64 {
            return Err(invalid());
        }
        for name in ["policyFields", "ownershipFields"] {
            let values = strings(get(profile, name))?;
            let unique: HashSet<_> = values.iter().cloned().collect();
            if unique.len() != values.len() || values.iter().any(|v| !members.contains(v)) {
                return Err(invalid());
            }
        }
        let blind = array(get(profile, "blindActions"))?;
        let mut blind_fields = HashSet::new();
        for pair in blind {
            let pair = array(Some(pair))?;
            if pair.len() != 2 {
                return Err(invalid());
            }
            let field = string(pair.first())?;
            let action = string(pair.get(1))?;
            let values = purposes.get(&action).ok_or_else(invalid)?;
            if !members.contains(&field)
                || !blind_fields.insert(field)
                || values.as_slice() != [Utf16::from("field")]
            {
                return Err(invalid());
            }
            blind_actions.push(action);
        }
    }
    if blind_actions.iter().any(|action| ordinary.contains(action)) {
        return Err(invalid());
    }
    Ok(Value::Bool(true))
}

fn validate_catalog_write_envelope(input: &Value) -> Result<(), EngineError> {
    let owner = get(input, "owner").ok_or_else(invalid)?;
    let profile = get(input, "profile").ok_or_else(invalid)?;
    let request = get(input, "request").ok_or_else(invalid)?;
    if string(get(profile, "version"))? != Utf16::from("umf.security.catalog-write/0.1")
        || string(get(request, "version"))? != Utf16::from("umf.security.catalog-transaction/0.1")
    {
        return Err(invalid());
    }
    let profile_id = string(get(profile, "id"))?;
    let profile_revision = string(get(profile, "revision"))?;
    if profile_id.is_empty()
        || profile_revision.is_empty()
        || profile_id.len() > 4096
        || profile_revision.len() > 4096
    {
        return Err(invalid());
    }
    let profile_owner = get(profile, "owner").ok_or_else(invalid)?;
    let request_profile = get(request, "profile").ok_or_else(invalid)?;
    if !strict_json_primitive_equal(get(profile_owner, "id"), get(owner, "id"))
        || !strict_json_primitive_equal(get(profile_owner, "revision"), get(owner, "revision"))
        || !strict_json_primitive_equal(get(request_profile, "id"), get(profile, "id"))
        || !strict_json_primitive_equal(get(request_profile, "revision"), get(profile, "revision"))
    {
        return Err(invalid());
    }
    let max_facts = match get(request, "maxFacts") {
        Some(Value::Number(value))
            if value.is_finite()
                && value.fract() == 0.0
                && *value >= 1.0
                && *value <= 10_000.0
                && *value <= 9_007_199_254_740_991.0 =>
        {
            *value as usize
        }
        _ => return Err(invalid()),
    };
    let count = |name: &str| -> Result<usize, EngineError> {
        match get(request, name) {
            Some(Value::Number(value))
                if value.is_finite()
                    && value.fract() == 0.0
                    && *value >= 0.0
                    && *value <= 9_007_199_254_740_991.0 =>
            {
                Ok(*value as usize)
            }
            _ => Err(invalid()),
        }
    };
    let types = count("typesCount")?;
    let bindings = count("associationsCount")?;
    let mutations = count("mutationsCount")?;
    if types > 256 || bindings > 256 || mutations == 0 || mutations > 256 {
        return Err(invalid());
    }
    let total = [
        count("beforeFactsCount")?,
        count("afterFactsCount")?,
        count("beforeGraphsCount")?,
        count("afterGraphsCount")?,
        mutations,
    ]
    .into_iter()
    .try_fold(0usize, |sum, value| {
        sum.checked_add(value).ok_or_else(invalid)
    })?;
    if total > max_facts {
        return Err(invalid());
    }
    Ok(())
}
fn pairs(v: Option<&Value>) -> Result<Vec<(Utf16, Utf16)>, EngineError> {
    if array(v)?.len() > 10_000 {
        return Err(invalid());
    }
    let mut out: Vec<(Utf16, Utf16)> = Vec::new();
    let mut positions: HashMap<Utf16, usize> = HashMap::new();
    for pair in array(v)? {
        let pair = array(Some(pair))?;
        if pair.len() != 2 {
            return Err(invalid());
        }
        let key = string(pair.first());
        let value = string(pair.get(1));
        let (key, value) = (key?, value?);
        if let Some(index) = positions.get(&key).copied() {
            out[index].1 = value;
        } else {
            positions.insert(key.clone(), out.len());
            out.push((key, value));
        }
    }
    Ok(out)
}
fn equal_projection(
    a: &[(Utf16, Utf16)],
    b: &[(Utf16, Utf16)],
    work: &mut usize,
    literal: &mut usize,
    work_limit: usize,
    literal_limit: usize,
    context: &mut Context<'_>,
) -> Result<bool, EngineError> {
    if a.len() != b.len() {
        return Ok(false);
    }
    let lookup: HashMap<_, _> = b.iter().map(|(key, value)| (key.clone(), value)).collect();
    for (key, value) in a {
        *work = work.saturating_add(1);
        if *work > work_limit {
            return Err(invalid());
        }
        context.charge_work(1, Utf16::default())?;
        let Some(other) = lookup.get(key) else {
            return Ok(false);
        };
        *literal = literal.saturating_add(value.len().saturating_add(other.len()));
        if *literal > literal_limit {
            return Err(invalid());
        }
        if value != *other {
            return Ok(false);
        }
    }
    Ok(true)
}
fn value_equal(a: Option<&Value>, b: Option<&Value>) -> bool {
    a == b
}
fn pair_values(v: Option<&Value>) -> Result<Vec<(Utf16, Utf16)>, EngineError> {
    pairs(v)
}
fn fact_rows(v: Option<&Value>) -> Result<Vec<(Utf16, Vec<(Utf16, Utf16)>)>, EngineError> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    let rows = array(v)?;
    if rows.len() > 10_000 {
        return Err(invalid());
    }
    for row in rows {
        let key = string(get(row, "key"))?;
        if !seen.insert(key.clone()) {
            return Err(invalid());
        }
        out.push((key, pairs(get(row, "projection"))?));
    }
    Ok(out)
}
fn strings(v: Option<&Value>) -> Result<Vec<Utf16>, EngineError> {
    array(v)?.iter().map(|v| string(Some(v))).collect()
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn str_value(s: Utf16) -> Value {
    Value::String(s)
}

/// Validate snapshot invariants, reject unlisted changes, and return ordered mutation diffs.
pub fn compare_catalog_write(
    input: &Value,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let limit = |name: &str, maximum: usize| match get(input, name) {
        Some(Value::Number(n))
            if n.is_finite() && n.fract() == 0.0 && *n >= 0.0 && *n <= maximum as f64 =>
        {
            Ok(*n as usize)
        }
        _ => Err(invalid()),
    };
    let work_limit = limit("workLimit", 1_000_000)?;
    let literal_limit = limit("literalLimit", 100_000)?;
    let subject_before = get(input, "subjectBefore").ok_or_else(invalid)?;
    let subject_after = get(input, "subjectAfter").ok_or_else(invalid)?;
    if !value_equal(get(subject_before, "key"), get(subject_after, "key"))
        || !value_equal(
            get(subject_before, "generation"),
            get(subject_after, "generation"),
        )
        || !value_equal(
            get(subject_before, "expectedGeneration"),
            get(subject_after, "expectedGeneration"),
        )
    {
        return Err(invalid());
    }
    let before_subject_projection = pairs(get(subject_before, "projection"))?;
    let after_subject_projection = pairs(get(subject_after, "projection"))?;
    let mut work = 0usize;
    let mut literal = 0usize;
    if !equal_projection(
        &before_subject_projection,
        &after_subject_projection,
        &mut work,
        &mut literal,
        work_limit,
        literal_limit,
        context,
    )? {
        return Err(invalid());
    }
    let before_context = pair_values(get(input, "contextBefore"))?;
    let after_context = pair_values(get(input, "contextAfter"))?;
    if !equal_projection(
        &before_context,
        &after_context,
        &mut work,
        &mut literal,
        work_limit,
        literal_limit,
        context,
    )? {
        return Err(invalid());
    }
    let mut before_profiles = pair_values(get(input, "profilesBefore"))?;
    let mut after_profiles = pair_values(get(input, "profilesAfter"))?;
    before_profiles.sort_by(|a, b| a.0.cmp(&b.0));
    after_profiles.sort_by(|a, b| a.0.cmp(&b.0));
    if before_profiles != after_profiles {
        return Err(invalid());
    }

    let before = fact_rows(get(input, "beforeFacts"))?;
    let after = fact_rows(get(input, "afterFacts"))?;
    if before.len() > 10_000 || after.len() > 10_000 || array(get(input, "mutations"))?.len() > 256
    {
        return Err(invalid());
    }
    let before_map: HashMap<_, _> = before
        .iter()
        .map(|(key, projection)| (key.clone(), projection))
        .collect();
    let after_map: HashMap<_, _> = after
        .iter()
        .map(|(key, projection)| (key.clone(), projection))
        .collect();
    let mut used = HashSet::<Utf16>::new();
    let mut changed_mutations = Vec::new();
    for mutation in array(get(input, "mutations"))? {
        work = work.saturating_add(1);
        if work > work_limit {
            return Err(invalid());
        }
        context.charge_work(1, Utf16::default())?;
        let key = string(get(mutation, "key"))?;
        let operation = string(get(mutation, "operation"))?;
        if !["create", "update", "delete"]
            .iter()
            .any(|candidate| operation == Utf16::from(*candidate))
            || !used.insert(key.clone())
        {
            return Err(invalid());
        }
        let old = before_map.get(&key).copied();
        let next = after_map.get(&key).copied();
        match operation.to_utf8().map_err(|_| invalid())?.as_str() {
            "create" if old.is_none() && next.is_some() => {}
            "delete" if old.is_some() && next.is_none() => {}
            "update" if old.is_some() && next.is_some() => {}
            _ => return Err(invalid()),
        }
        let fields = strings(get(mutation, "fields"))?;
        if fields.len() > 4096 {
            return Err(invalid());
        }
        let ownership_fields: HashSet<_> = strings(get(mutation, "ownershipFields"))?
            .into_iter()
            .collect();
        let policy_fields: HashSet<_> = strings(get(mutation, "policyFields"))?
            .into_iter()
            .collect();
        let old_fields: HashMap<_, _> = old
            .into_iter()
            .flat_map(|p| p.iter())
            .map(|(name, value)| (name.clone(), value))
            .collect();
        let next_fields: HashMap<_, _> = next
            .into_iter()
            .flat_map(|p| p.iter())
            .map(|(name, value)| (name.clone(), value))
            .collect();
        let mut changed = Vec::new();
        for field in fields {
            work = work.saturating_add(1);
            if work > work_limit {
                return Err(invalid());
            }
            context.charge_work(1, Utf16::default())?;
            let is_changed = if operation != Utf16::from("update") {
                true
            } else {
                let a = old_fields.get(&field).ok_or_else(invalid)?;
                let b = next_fields.get(&field).ok_or_else(invalid)?;
                literal = literal.saturating_add(a.len().saturating_add(b.len()));
                if literal > literal_limit {
                    return Err(invalid());
                }
                a != b
            };
            if is_changed {
                changed.push(field);
            }
        }
        let ownership = if operation == Utf16::from("update") {
            changed.iter().any(|f| ownership_fields.contains(f))
        } else {
            !ownership_fields.is_empty()
        };
        let policy = if operation == Utf16::from("update") {
            changed.iter().any(|f| policy_fields.contains(f))
        } else {
            !policy_fields.is_empty()
        };
        changed_mutations.push(object(vec![
            ("key", str_value(key)),
            ("operation", str_value(operation)),
            (
                "changed",
                Value::Array(changed.into_iter().map(str_value).collect()),
            ),
            ("ownership", Value::Bool(ownership)),
            ("policy", Value::Bool(policy)),
        ]));
    }
    let mut all = Vec::new();
    let mut seen = HashSet::new();
    for (key, _) in before.iter().chain(after.iter()) {
        if seen.insert(key.clone()) {
            all.push(key);
        }
    }
    for key in all {
        work = work.saturating_add(1);
        if work > work_limit {
            return Err(invalid());
        }
        context.charge_work(1, Utf16::default())?;
        let a = before_map.get(key).copied();
        let b = after_map.get(key).copied();
        let changed = match (a, b) {
            (Some(a), Some(b)) => !equal_projection(
                a,
                b,
                &mut work,
                &mut literal,
                work_limit,
                literal_limit,
                context,
            )?,
            _ => true,
        };
        if changed && !used.contains(key) {
            return Err(invalid());
        }
    }
    Ok(object(vec![
        ("mutations", Value::Array(changed_mutations)),
        ("workUnits", Value::Number(work as f64)),
        ("literalUnits", Value::Number(literal as f64)),
    ]))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(value: &str) -> Value {
        Value::string_utf8(value)
    }
    fn arr(values: Vec<Value>) -> Value {
        Value::Array(values)
    }
    fn pair(key: &str, value: &str) -> Value {
        arr(vec![s(key), s(value)])
    }
    fn fact(value: &str) -> Value {
        object(vec![
            ("key", s("fact:1")),
            ("projection", arr(vec![pair("field:1", value)])),
        ])
    }
    fn input(after: &str, mutations: Vec<Value>) -> Value {
        let subject = |projection: &str| {
            object(vec![
                ("key", s("subject:1")),
                ("projection", arr(vec![pair("subject-field", projection)])),
                ("generation", s("g1")),
                ("expectedGeneration", s("g1")),
            ])
        };
        object(vec![
            ("workLimit", Value::Number(100.0)),
            ("literalLimit", Value::Number(100.0)),
            ("subjectBefore", subject("subject")),
            ("subjectAfter", subject("subject")),
            ("contextBefore", arr(vec![])),
            ("contextAfter", arr(vec![])),
            ("profilesBefore", arr(vec![])),
            ("profilesAfter", arr(vec![])),
            ("beforeFacts", arr(vec![fact("old")])),
            ("afterFacts", arr(vec![fact(after)])),
            ("mutations", arr(mutations)),
        ])
    }

    #[test]
    fn returns_ordered_changed_fields_and_policy_flags() {
        let mutation = object(vec![
            ("key", s("fact:1")),
            ("operation", s("update")),
            ("fields", arr(vec![s("field:1")])),
            ("ownershipFields", arr(vec![s("field:1")])),
            ("policyFields", arr(vec![])),
        ]);
        let result =
            compare_catalog_write(&input("new", vec![mutation]), &mut Context::ordinary()).unwrap();
        let mutations = get(&result, "mutations").unwrap();
        let result = array(Some(mutations)).unwrap()[0].clone();
        assert_eq!(get(&result, "ownership"), Some(&Value::Bool(true)));
        assert_eq!(get(&result, "policy"), Some(&Value::Bool(false)));
        assert_eq!(array(get(&result, "changed")).unwrap(), &[s("field:1")]);
    }

    #[test]
    fn refuses_unlisted_fact_changes() {
        assert!(compare_catalog_write(&input("new", vec![]), &mut Context::ordinary()).is_err());
    }
}

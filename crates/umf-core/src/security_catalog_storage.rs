// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native validation of the private logical-owner storage map.
//! This admits no policy authority and returns only the validated DTO rows.

use crate::{
    context::Context,
    error::EngineError,
    value::{Utf16, Value},
};
use std::collections::{HashMap, HashSet};

fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    let Value::Object(items) = v else { return None };
    items
        .iter()
        .find(|(key, _)| key == &Utf16::from(k))
        .map(|(_, v)| v)
}
fn raw(v: Option<&Value>) -> Option<&Utf16> {
    match v {
        Some(Value::String(s)) => Some(s),
        _ => None,
    }
}
fn text(v: Option<&Value>) -> Option<String> {
    raw(v)?.to_utf8().ok()
}
fn arr(v: Option<&Value>) -> Option<&[Value]> {
    match v {
        Some(Value::Array(a)) => Some(a),
        _ => None,
    }
}
fn fail() -> EngineError {
    EngineError::new(
        "SECURITY_CATALOG_STORAGE",
        Utf16::default(),
        "Invalid logical owner storage map",
    )
}
fn exact(v: &Value, required: &[&str], optional: &[&str]) -> Result<(), EngineError> {
    let Value::Object(items) = v else {
        return Err(fail());
    };
    if required.iter().any(|k| get(v, k).is_none())
        || items.iter().any(|(k, _)| {
            !required
                .iter()
                .chain(optional)
                .any(|allowed| k == &Utf16::from(*allowed))
        })
    {
        return Err(fail());
    }
    Ok(())
}
fn req_text(v: &Value, k: &str) -> Result<Utf16, EngineError> {
    raw(get(v, k))
        .filter(|s| !s.units().is_empty())
        .cloned()
        .ok_or_else(fail)
}
fn charge(steps: &mut usize, max_steps: usize, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    *steps += 1;
    if *steps > max_steps {
        return Err(fail());
    }
    ctx.charge_work(1, Utf16::default())
}
type Ref = (Utf16, Utf16, Utf16);
fn reference(v: &Value) -> Result<Ref, EngineError> {
    exact(v, &["documentId", "moduleId", "elementId"], &[])?;
    Ok((
        req_text(v, "documentId")?,
        req_text(v, "moduleId")?,
        req_text(v, "elementId")?,
    ))
}
fn transform_is_stored(t: &Value, field: &Ref, id: &Utf16, version: &Utf16) -> bool {
    let Some(custody) = get(t, "custody") else {
        return false;
    };
    text(get(custody, "storageEffect")).as_deref() == Some("stored-transformed")
        && reference(get(t, "outputDomain").unwrap_or(&Value::Null))
            .ok()
            .as_ref()
            == Some(field)
        && raw(get(t, "id")) == Some(id)
        && raw(get(t, "version")) == Some(version)
        && matches!(
            text(get(t, "kind")).as_deref(),
            Some("tokenize" | "encrypt")
        )
}

/// Validate an owner storage map and return its source rows with the number of
/// legacy operation-ledger steps that the TypeScript caller must replay.
pub fn validate_logical_owner_storage(
    program: &Value,
    owner: &Value,
    max_steps: usize,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if max_steps > 1_000_000 {
        return Err(fail());
    }
    exact(
        owner,
        &["version", "id", "revision", "storage"],
        &["disclosure"],
    )?;
    if req_text(owner, "id").is_err()
        || req_text(owner, "revision").is_err()
        || text(get(owner, "version")).as_deref() != Some("umf.security.logical-owner/0.1")
    {
        return Err(fail());
    }
    let storage = arr(get(owner, "storage"))
        .filter(|a| a.len() <= 4096)
        .ok_or_else(fail)?;
    let ontology = get(get(program, "ontology").ok_or_else(fail)?, "ontology").ok_or_else(fail)?;
    let entities = arr(get(ontology, "entities")).ok_or_else(fail)?;
    let mut fields = HashMap::<Ref, HashSet<Ref>>::new();
    for entity in entities {
        ctx.charge_work(1, Utf16::default())?;
        let ty = reference(get(entity, "type").ok_or_else(fail)?)?;
        let declared = arr(get(entity, "fields")).ok_or_else(fail)?;
        let mut refs = HashSet::new();
        for field in declared {
            ctx.charge_work(1, Utf16::default())?;
            let reference = reference(get(field, "ref").ok_or_else(fail)?)?;
            refs.insert(reference);
        }
        fields.insert(ty, refs);
    }
    if get(owner, "disclosure").is_some() {
        let disclosure = get(owner, "disclosure").ok_or_else(fail)?;
        exact(disclosure, &["readAction"], &[])?;
        let action = req_text(disclosure, "readAction")?;
        let purposes = arr(get(ontology, "actionPurposes")).ok_or_else(fail)?;
        let mut declared = false;
        for purpose in purposes {
            ctx.charge_work(1, Utf16::default())?;
            if raw(get(purpose, "action")) == Some(&action) {
                for value in arr(get(purpose, "purposes")).ok_or_else(fail)? {
                    ctx.charge_work(1, Utf16::default())?;
                    if text(Some(value)).as_deref() == Some("read") {
                        declared = true;
                        break;
                    }
                }
            }
            if declared {
                break;
            }
        }
        if !declared {
            return Err(fail());
        }
    }
    let catalog = get(program, "catalog").filter(|v| !matches!(**v, Value::Null));
    let transforms = match catalog {
        Some(c) => arr(get(c, "transforms")).ok_or_else(fail)?,
        None => &[],
    };
    let mut result = Vec::with_capacity(storage.len());
    let mut seen = HashSet::<(Ref, Ref)>::new();
    let mut steps = 0usize;
    for entry in storage {
        charge(&mut steps, max_steps, ctx)?;
        exact(
            entry,
            &["type", "field", "storageEffect"],
            &["storageTransform"],
        )?;
        let ty = reference(get(entry, "type").ok_or_else(fail)?)?;
        let field = reference(get(entry, "field").ok_or_else(fail)?)?;
        if !fields
            .get(&ty)
            .is_some_and(|members| members.contains(&field))
            || !seen.insert((ty, field.clone()))
        {
            return Err(fail());
        }
        let mut stored = Vec::new();
        for t in transforms {
            charge(&mut steps, max_steps, ctx)?;
            if text(get(
                get(t, "custody").unwrap_or(&Value::Null),
                "storageEffect",
            ))
            .as_deref()
                == Some("stored-transformed")
                && reference(get(t, "outputDomain").unwrap_or(&Value::Null))
                    .ok()
                    .as_ref()
                    == Some(&field)
            {
                stored.push(t);
            }
        }
        match text(get(entry, "storageEffect")).as_deref() {
            Some("canonical") => {
                if get(entry, "storageTransform").is_some() || !stored.is_empty() {
                    return Err(fail());
                }
            }
            Some("stored-transformed") => {
                let tr = get(entry, "storageTransform").ok_or_else(fail)?;
                exact(tr, &["id", "version"], &[])?;
                let id = req_text(tr, "id")?;
                let version = req_text(tr, "version")?;
                if !stored
                    .iter()
                    .any(|t| transform_is_stored(t, &field, &id, &version))
                {
                    return Err(fail());
                }
            }
            _ => return Err(fail()),
        }
        result.push(entry.clone());
    }
    for (ty, members) in fields {
        for field in members {
            charge(&mut steps, max_steps, ctx)?;
            if !seen.contains(&(ty.clone(), field)) {
                return Err(fail());
            }
        }
    }
    Ok(Value::Object(vec![
        (Utf16::from("storage"), Value::Array(result)),
        (Utf16::from("steps"), Value::Number(steps as f64)),
    ]))
}

#[cfg(test)]
mod tests {
    use super::{get, validate_logical_owner_storage};
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
    fn reference(id: &str) -> Value {
        obj(vec![
            ("documentId", s("d")),
            ("moduleId", s("m")),
            ("elementId", s(id)),
        ])
    }
    #[test]
    fn admits_complete_canonical_map_and_counts_legacy_steps() {
        let ty = reference("R");
        let field = reference("f");
        let entity = obj(vec![
            ("type", ty.clone()),
            (
                "fields",
                Value::Array(vec![obj(vec![("ref", field.clone())])]),
            ),
        ]);
        let purpose = obj(vec![
            ("action", s("read")),
            ("purposes", Value::Array(vec![s("read")])),
        ]);
        let ontology = obj(vec![
            ("entities", Value::Array(vec![entity])),
            ("actionPurposes", Value::Array(vec![purpose])),
        ]);
        let program = obj(vec![
            ("ontology", obj(vec![("ontology", ontology)])),
            ("catalog", Value::Null),
        ]);
        let owner = obj(vec![
            ("version", s("umf.security.logical-owner/0.1")),
            ("id", s("owner")),
            ("revision", s("r1")),
            ("disclosure", obj(vec![("readAction", s("read"))])),
            (
                "storage",
                Value::Array(vec![obj(vec![
                    ("type", ty),
                    ("field", field),
                    ("storageEffect", s("canonical")),
                ])]),
            ),
        ]);
        let result =
            validate_logical_owner_storage(&program, &owner, 100, &mut Context::ordinary())
                .unwrap();
        assert_eq!(get(&result, "steps"), Some(&Value::Number(2.0)));
    }
}

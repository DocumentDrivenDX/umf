// SPDX-License-Identifier: MIT OR Apache-2.0
//! Stateful native pins for registered Security read definitions.
use crate::{
    context::Context,
    error::EngineError,
    serialization,
    value::{copy_json, Utf16, Value},
};
use std::collections::HashMap;

fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
}
fn array(value: Option<&Value>) -> &[Value] {
    match value {
        Some(Value::Array(values)) => values,
        _ => &[],
    }
}
fn text(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(value)) => value.to_utf8().ok(),
        _ => None,
    }
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}
fn string(value: &str) -> Value {
    Value::string_utf8(value)
}
fn fail(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn canonicalize(value: &mut Value, depth: usize, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    if depth > 128 {
        return Err(fail(
            "SECURITY_REGISTRATION_BOUND",
            "Registered definition nesting exceeds its bound",
        ));
    }
    match value {
        Value::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            for item in items {
                canonicalize(item, depth + 1, ctx)?;
            }
        }
        Value::Object(fields) => {
            let width = fields.iter().map(|(key, _)| key.len()).max().unwrap_or(0);
            let count = fields.len() as u64;
            let comparisons = count.saturating_mul(count.max(1).ilog2() as u64 + 1);
            ctx.charge_work_u64(
                comparisons.saturating_mul(width.max(1) as u64),
                Utf16::default(),
            )?;
            fields.sort_unstable_by(|left, right| left.0.units().cmp(right.0.units()));
            if fields.windows(2).any(|pair| pair[0].0 == pair[1].0) {
                return Err(fail(
                    "SECURITY_REGISTRATION_REFUSED",
                    "Duplicate definition member cannot be pinned",
                ));
            }
            for (_, item) in fields {
                canonicalize(item, depth + 1, ctx)?;
            }
        }
        _ => {}
    }
    Ok(())
}
fn canonical(value: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let mut value = copy_json(value, ctx)?;
    canonicalize(&mut value, 0, ctx)?;
    serialization::stringify_compact(&value)
}
fn pin_key(kind: &str, id: &Value, revision: &Value) -> Result<String, EngineError> {
    let id = text(Some(id))
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            fail(
                "SECURITY_REGISTRATION_REFUSED",
                "Pinned source identity is invalid",
            )
        })?;
    let revision = text(Some(revision))
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            fail(
                "SECURITY_REGISTRATION_REFUSED",
                "Pinned source revision is invalid",
            )
        })?;
    Ok(format!(
        "{}:{}{}:{}{}:{}",
        kind.len(),
        kind,
        id.len(),
        id,
        revision.len(),
        revision
    ))
}

#[derive(Default)]
pub struct SecurityReadRegistration {
    pins: HashMap<String, Utf16>,
    definitions: HashMap<u64, (Value, Value)>,
    next_handle: u64,
    characters: usize,
}
impl SecurityReadRegistration {
    pub fn new() -> Self {
        Self {
            next_handle: 1,
            ..Self::default()
        }
    }

    pub fn register(
        &mut self,
        policy: &Value,
        resolution: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let interpreted =
            crate::security_policy::require_security_interpretation(policy, resolution, ctx)?;
        let policy = get(&interpreted, "source").cloned().ok_or_else(|| {
            fail(
                "SECURITY_REGISTRATION_REFUSED",
                "Interpreted policy source is missing",
            )
        })?;
        let resolution = get(&interpreted, "resolution").cloned().ok_or_else(|| {
            fail(
                "SECURITY_REGISTRATION_REFUSED",
                "Interpreted resolution is missing",
            )
        })?;
        let ontology = get(&resolution, "ontology").ok_or_else(|| {
            fail(
                "SECURITY_REGISTRATION_REFUSED",
                "Interpreted ontology is missing",
            )
        })?;
        let mut candidates = Vec::<(String, Utf16)>::new();
        candidates.push((
            pin_key(
                "policy",
                get(&policy, "id").ok_or_else(|| {
                    fail(
                        "SECURITY_REGISTRATION_REFUSED",
                        "Policy identity is missing",
                    )
                })?,
                get(&policy, "revision").ok_or_else(|| {
                    fail(
                        "SECURITY_REGISTRATION_REFUSED",
                        "Policy revision is missing",
                    )
                })?,
            )?,
            canonical(&policy, ctx)?,
        ));
        candidates.push((
            pin_key(
                "ontology",
                get(ontology, "documentId").ok_or_else(|| {
                    fail(
                        "SECURITY_REGISTRATION_REFUSED",
                        "Ontology identity is missing",
                    )
                })?,
                get(ontology, "revision").ok_or_else(|| {
                    fail(
                        "SECURITY_REGISTRATION_REFUSED",
                        "Ontology revision is missing",
                    )
                })?,
            )?,
            canonical(ontology, ctx)?,
        ));
        for resolved in array(get(&resolution, "documents")) {
            let document = get(resolved, "document").ok_or_else(|| {
                fail(
                    "SECURITY_REGISTRATION_REFUSED",
                    "Resolved document is missing",
                )
            })?;
            candidates.push((
                pin_key(
                    "document",
                    get(document, "id").ok_or_else(|| {
                        fail(
                            "SECURITY_REGISTRATION_REFUSED",
                            "Document identity is missing",
                        )
                    })?,
                    get(resolved, "revision").ok_or_else(|| {
                        fail(
                            "SECURITY_REGISTRATION_REFUSED",
                            "Document revision is missing",
                        )
                    })?,
                )?,
                canonical(document, ctx)?,
            ));
        }
        let mut pending = HashMap::<String, Utf16>::new();
        for (key, value) in &candidates {
            let prior = self.pins.get(key).or_else(|| pending.get(key));
            if prior.is_some_and(|existing| existing != value) {
                return Err(fail(
                    "SECURITY_REVISION_REUSE",
                    "Registered source revision has different content",
                ));
            }
            if prior.is_none() {
                pending.insert(key.clone(), value.clone());
            }
        }
        let added = pending.iter().fold(0usize, |sum, (key, value)| {
            sum.saturating_add(key.encode_utf16().count())
                .saturating_add(value.units().len())
        });
        if self.definitions.len() >= 32
            || self.pins.len().saturating_add(pending.len()) > 512
            || self.characters.saturating_add(added) > 16_000_000
        {
            return Err(fail(
                "SECURITY_REGISTRATION_BOUND",
                "Security registration bound exceeded",
            ));
        }
        let handle = self.next_handle;
        self.next_handle = self.next_handle.checked_add(1).ok_or_else(|| {
            fail(
                "SECURITY_REGISTRATION_BOUND",
                "Security registration handle exhausted",
            )
        })?;
        for (key, value) in pending {
            self.pins.insert(key, value);
        }
        self.characters = self.characters.saturating_add(added);
        self.definitions.insert(handle, (policy, resolution));
        Ok(object(vec![("handle", Value::Number(handle as f64))]))
    }

    pub fn evaluate(
        &self,
        handle: u64,
        cut: &Value,
        request: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let Some((policy, resolution)) = self.definitions.get(&handle) else {
            return Ok(object(vec![
                ("status", string("refused")),
                ("rows", Value::Array(Vec::new())),
            ]));
        };
        crate::security_evaluation::evaluate_security_collection(
            policy, resolution, cut, request, ctx,
        )
    }
}

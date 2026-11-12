// SPDX-License-Identifier: MIT OR Apache-2.0
//! Admission and same-manifest replacement policy for host-backed registries.
use crate::{
    error::EngineError,
    value::{Utf16, Value},
};
use std::collections::HashSet;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RegistrationDecision {
    pub replace: bool,
    /// Ordered opaque host callback identities; Rust never invokes these values.
    pub callbacks: Vec<String>,
}

fn canonical(value: &Value) -> Value {
    match value {
        Value::Array(values) => Value::Array(values.iter().map(canonical).collect()),
        Value::Object(fields) => {
            let mut fields: Vec<_> = fields
                .iter()
                .map(|(key, value)| (key.clone(), canonical(value)))
                .collect();
            fields.sort_by(|a, b| a.0.cmp(&b.0));
            Value::Object(fields)
        }
        other => other.clone(),
    }
}

/// Evaluate duplicate and native-owner replacement semantics while returning
/// the callback identities in their exact invocation order.
#[allow(clippy::too_many_arguments)]
pub fn decide_registration(
    existing_manifest: Option<&Value>,
    new_manifest: &Value,
    existing_owner: bool,
    existing_native: Option<&str>,
    existing_callers: &[String],
    supplied_owner: bool,
    supplied_native: Option<&str>,
    supplied_callers: &[String],
    replace_actions: bool,
) -> Result<RegistrationDecision, EngineError> {
    let same_manifest =
        existing_manifest.is_some_and(|old| canonical(old) == canonical(new_manifest));
    let retained_caller_replacement = same_manifest && existing_owner && supplied_native.is_none();
    let replacing_native_owner = supplied_owner
        && (existing_manifest.is_none()
            || (same_manifest && (existing_owner || existing_native.is_none())))
        && (replace_actions || existing_owner);
    let replacing_owned = retained_caller_replacement || replacing_native_owner;
    if replace_actions && !replacing_owned {
        return Err(EngineError::new(
            "DUPLICATE_VERSION",
            Utf16::default(),
            "Only the native semantic owner may replace its unchanged package registration",
        ));
    }
    if existing_manifest.is_some() && !replacing_owned {
        return Err(EngineError::new(
            "DUPLICATE_VERSION",
            Utf16::default(),
            "Extension version is already registered",
        ));
    }
    let mut callbacks = Vec::new();
    let mut seen = HashSet::new();
    if replacing_owned {
        for token in existing_callers {
            if seen.insert(token.clone()) {
                callbacks.push(token.clone());
            }
        }
    }
    for token in supplied_callers {
        if seen.insert(token.clone()) {
            callbacks.push(token.clone());
        }
    }
    if let Some(native) = if replacing_native_owner {
        supplied_native
    } else if retained_caller_replacement {
        existing_native
    } else {
        supplied_native
    } {
        callbacks.push(native.to_owned());
    }
    Ok(RegistrationDecision {
        replace: replacing_owned,
        callbacks,
    })
}

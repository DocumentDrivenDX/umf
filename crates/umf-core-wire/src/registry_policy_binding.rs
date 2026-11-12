// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned admission policy for the host registry's opaque callbacks.
use umf_core::{Context, EngineError, Utf16, Value};

pub const PROFILE: &str = "umf.registry-policy-wire/1";

fn field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
}
fn text(value: Option<&Value>) -> Option<String> {
    let Value::String(value) = value? else {
        return None;
    };
    value.to_utf8().ok()
}
fn strings(value: Option<&Value>) -> Result<Vec<String>, EngineError> {
    let Some(Value::Array(values)) = value else {
        return Err(request_error("Callback tokens must be arrays"));
    };
    values
        .iter()
        .map(|value| {
            text(Some(value)).ok_or_else(|| request_error("Callback tokens must be strings"))
        })
        .collect()
}
fn request_error(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}

/// Decide whether this registration can be admitted or replace an owned entry.
/// Tokens are opaque stable host identities; their order is returned unchanged.
pub fn decide(
    existing_manifest: Option<&Value>,
    new_manifest: &Value,
    existing_owner: bool,
    existing_native: Option<&str>,
    existing_callers: &[String],
    supplied_owner: bool,
    supplied_native: Option<&str>,
    supplied_callers: &[String],
    replace_actions: bool,
) -> Result<(String, Vec<String>), EngineError> {
    let result = umf_core::registry_policy::decide_registration(
        existing_manifest,
        new_manifest,
        existing_owner,
        existing_native,
        existing_callers,
        supplied_owner,
        supplied_native,
        supplied_callers,
        replace_actions,
    )?;
    Ok((
        if result.replace { "replace" } else { "admit" }.to_owned(),
        result.callbacks,
    ))
}

pub fn execute_wire(wire: &str) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary();
        let req = umf_tagged_wire::decode_host_value(wire, &mut ctx)?;
        if text(field(&req, "profile")).as_deref() != Some(PROFILE)
            || text(field(&req, "op")).as_deref() != Some("registry-policy.decide")
        {
            return Err(request_error(
                "Registry policy profile and operation are required",
            ));
        }
        let old = field(&req, "existingManifest").filter(|value| !matches!(value, Value::Null));
        let manifest =
            field(&req, "manifest").ok_or_else(|| request_error("Manifest is required"))?;
        let existing_owner = matches!(field(&req, "existingOwner"), Some(Value::Bool(true)));
        let supplied_owner = matches!(field(&req, "suppliedOwner"), Some(Value::Bool(true)));
        let existing_native = text(field(&req, "existingNative"));
        let supplied_native = text(field(&req, "suppliedNative"));
        let existing_callers = strings(field(&req, "existingCallers"))?;
        let supplied_callers = strings(field(&req, "suppliedCallers"))?;
        let replace = matches!(field(&req, "replaceActions"), Some(Value::Bool(true)));
        let (decision, callbacks) = decide(
            old,
            manifest,
            existing_owner,
            existing_native.as_deref(),
            &existing_callers,
            supplied_owner,
            supplied_native.as_deref(),
            &supplied_callers,
            replace,
        )?;
        umf_tagged_wire::encode_host_value(
            &Value::Object(vec![
                (Utf16::from("decision"), Value::string_utf8(decision)),
                (
                    Utf16::from("callbacks"),
                    Value::Array(callbacks.into_iter().map(Value::string_utf8).collect()),
                ),
            ]),
            &mut ctx,
        )
    })();
    crate::result_envelope(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identical_native_owner_replacement_retains_ordered_callback_tokens() {
        let manifest = Value::Object(vec![(Utf16::from("id"), Value::string_utf8("pkg"))]);
        let (decision, callbacks) = decide(
            Some(&manifest),
            &manifest,
            true,
            Some("native-old"),
            &["caller-a".into(), "caller-b".into()],
            true,
            Some("native-new"),
            &["caller-c".into()],
            true,
        )
        .unwrap();
        assert_eq!(decision, "replace");
        assert_eq!(
            callbacks,
            vec![
                "caller-a".to_owned(),
                "caller-b".to_owned(),
                "caller-c".to_owned(),
                "native-new".to_owned()
            ]
        );
    }

    #[test]
    fn replacement_deduplicates_callers_without_removing_native_tail() {
        let manifest = Value::Object(vec![(Utf16::from("id"), Value::string_utf8("pkg"))]);
        let (_, callbacks) = decide(
            Some(&manifest),
            &manifest,
            true,
            Some("native-old"),
            &["caller-a".into(), "caller-a".into(), "native-new".into()],
            true,
            Some("native-new"),
            &["caller-b".into(), "caller-a".into()],
            true,
        )
        .unwrap();
        assert_eq!(
            callbacks,
            vec![
                "caller-a".to_owned(),
                "native-new".to_owned(),
                "caller-b".to_owned(),
                "native-new".to_owned()
            ]
        );
    }

    #[test]
    fn differing_manifest_and_unowned_replacement_refuse() {
        let old = Value::Object(vec![(Utf16::from("id"), Value::string_utf8("old"))]);
        let new = Value::Object(vec![(Utf16::from("id"), Value::string_utf8("new"))]);
        let refusal = decide(
            Some(&old),
            &new,
            true,
            Some("native"),
            &[],
            true,
            Some("native-2"),
            &[],
            true,
        )
        .unwrap_err();
        assert_eq!(refusal.code, "DUPLICATE_VERSION");
        let refusal =
            decide(Some(&old), &old, false, None, &[], false, None, &[], true).unwrap_err();
        assert_eq!(refusal.code, "DUPLICATE_VERSION");
    }
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in tagged wire for exact, data-only V2 catalog source resolution.
//! Policy/catalog interpretation and authority remain unimplemented.

use umf_core::{Context, EngineError, Value};

use crate::{decode, encode, fail, field, result_envelope, text_field};

pub const SECURITY_PROTECTION_SOURCE_PROFILE: &str = "umf.security-protection-source/1";

pub fn execute_security_protection_source_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_security_protection_source_wire_with_control(wire_json, &mut no_control)
}

pub fn execute_security_protection_source_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut context = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut context)?;
        if text_field(&request, "profile").as_deref() != Some(SECURITY_PROTECTION_SOURCE_PROFILE) {
            return Err(fail(
                "REQUEST",
                "Security protection source profile is required",
            ));
        }
        if text_field(&request, "op").as_deref() != Some("resolveSecurityProtectionSources") {
            return Err(fail(
                "REQUEST",
                "Unknown security protection source operation",
            ));
        }
        if !closed_object(&request, &["profile", "op", "policy", "catalog"]) {
            return Err(fail(
                "REQUEST",
                "Closed security protection source request required",
            ));
        }
        let policy = field(&request, "policy")
            .ok_or_else(|| fail("REQUEST", "Policy source is required"))?;
        let catalog = field(&request, "catalog")
            .ok_or_else(|| fail("REQUEST", "Protection catalog source is required"))?;
        let result = umf_core::security_logic::resolve_security_protection_sources_candidate(
            policy,
            catalog,
            &mut context,
        )?;
        encode(&result, &mut context)
    })();
    result_envelope(result)
}

fn closed_object(value: &Value, expected: &[&str]) -> bool {
    let Value::Object(members) = value else {
        return false;
    };
    members.len() == expected.len()
        && expected.iter().all(|name| {
            members
                .iter()
                .any(|(key, _)| key.to_utf8().ok().as_deref() == Some(*name))
        })
}

#[cfg(test)]
mod tests {
    use super::{SECURITY_PROTECTION_SOURCE_PROFILE, execute_security_protection_source_wire};
    use crate::{decode, encode};
    use serde_json::Value as Json;
    use umf_core::{
        Context, Utf16, Value,
        serialization::{Format, read_json_value},
    };

    fn parse(source: &str) -> Value {
        read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    fn member<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
        match value {
            Value::Object(fields) => fields
                .iter()
                .find(|(key, _)| key == &Utf16::from(name))
                .map(|(_, value)| value),
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

    fn expected(case: &Value, policy: &Value, catalog: &Value) -> Value {
        let expected = member(member(case, "outcome").unwrap(), "value").unwrap();
        object(vec![
            ("status", member(expected, "status").unwrap().clone()),
            ("complete", member(expected, "complete").unwrap().clone()),
            ("authority", member(expected, "authority").unwrap().clone()),
            ("policy", policy.clone()),
            ("catalog", catalog.clone()),
            (
                "references",
                member(expected, "references").unwrap().clone(),
            ),
            (
                "diagnostics",
                member(expected, "diagnostics").unwrap().clone(),
            ),
        ])
    }

    #[test]
    fn tagged_wire_replays_every_frozen_source_case_exactly() {
        let packet = parse(include_str!(
            "../../../tests/rust-core/fixtures/r8-security-protection-resolution/predecessor.json"
        ));
        let Value::Array(cases) = member(&packet, "cases").unwrap() else {
            panic!("cases")
        };
        let mut replayed = 0;
        for case in cases {
            if member(case, "stage") != Some(&Value::string_utf8("source")) {
                continue;
            }
            let sources = member(case, "sources").expect("tagged source inputs");
            let policy = member(sources, "policy").unwrap();
            let catalog = member(sources, "catalog").unwrap();
            let request = object(vec![
                (
                    "profile",
                    Value::string_utf8(SECURITY_PROTECTION_SOURCE_PROFILE),
                ),
                ("op", Value::string_utf8("resolveSecurityProtectionSources")),
                ("policy", policy.clone()),
                ("catalog", catalog.clone()),
            ]);
            let wire = encode(&request, &mut Context::ordinary()).unwrap();
            let envelope: Json =
                serde_json::from_str(&execute_security_protection_source_wire(&wire)).unwrap();
            assert_eq!(
                envelope["status"],
                "ok",
                "{:?}: {envelope}",
                member(case, "id").unwrap()
            );
            let actual =
                decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
            assert_eq!(
                actual,
                expected(case, policy, catalog),
                "{:?}",
                member(case, "id").unwrap()
            );
            replayed += 1;
        }
        assert_eq!(replayed, 10);
    }

    #[test]
    fn operation_refuses_wrong_profile_and_unknown_members() {
        let mut request = object(vec![
            ("profile", Value::string_utf8("wrong")),
            ("op", Value::string_utf8("resolveSecurityProtectionSources")),
            ("policy", Value::Null),
            ("catalog", Value::Null),
        ]);
        let wire = encode(&request, &mut Context::ordinary()).unwrap();
        let response: Json =
            serde_json::from_str(&execute_security_protection_source_wire(&wire)).unwrap();
        assert_eq!(response["code"], "REQUEST");
        if let Value::Object(members) = &mut request {
            members[0].1 = Value::string_utf8(SECURITY_PROTECTION_SOURCE_PROFILE);
            members.push(("future".into(), Value::Bool(true)));
        }
        let wire = encode(&request, &mut Context::ordinary()).unwrap();
        let response: Json =
            serde_json::from_str(&execute_security_protection_source_wire(&wire)).unwrap();
        assert_eq!(response["code"], "REQUEST");
    }
}

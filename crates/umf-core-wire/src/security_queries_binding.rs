// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in tagged wire for protection query-property comparison.
use crate::{decode, encode, fail, field, result_envelope, text_field};
use umf_core::{Context, EngineError, Value};

pub const SECURITY_QUERIES_PROFILE: &str = "umf.security-queries/1";

pub fn execute_security_queries_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_security_queries_wire_with_control(wire_json, &mut no_control)
}
pub fn execute_security_queries_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut context = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut context)?;
        if text_field(&request, "profile").as_deref() != Some(SECURITY_QUERIES_PROFILE) {
            return Err(fail("REQUEST", "Security queries profile is required"));
        }
        if text_field(&request, "op").as_deref() != Some("inspectProtectionQueryProperties") {
            return Err(fail("REQUEST", "Unknown security queries operation"));
        }
        if !closed_object(
            &request,
            &["profile", "op", "policy", "catalog", "closure", "use"],
        ) {
            return Err(fail("REQUEST", "Closed security queries request required"));
        }
        let policy = field(&request, "policy")
            .ok_or_else(|| fail("REQUEST", "Policy source is required"))?;
        let catalog = field(&request, "catalog")
            .ok_or_else(|| fail("REQUEST", "Protection catalog source is required"))?;
        let closure = field(&request, "closure")
            .ok_or_else(|| fail("REQUEST", "Core closure is required"))?;
        let use_input =
            field(&request, "use").ok_or_else(|| fail("REQUEST", "Query use is required"))?;
        let value =
            umf_core::security_queries::inspect_security_protection_query_properties_candidate(
                policy,
                catalog,
                closure,
                use_input,
                &mut context,
            )?;
        encode(&value, &mut context)
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
    use super::{
        execute_security_queries_wire, execute_security_queries_wire_with_control,
        SECURITY_QUERIES_PROFILE,
    };
    use crate::{decode, encode};
    use serde_json::Value as Json;
    use umf_core::{
        serialization::{read_json_value, Format},
        Context, EngineError, Utf16, Value,
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
    fn text(value: Option<&Value>) -> Option<String> {
        match value? {
            Value::String(value) => value.to_utf8().ok(),
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

    fn set_member(value: &mut Value, name: &str, replacement: Value) {
        if let Value::Object(fields) = value {
            if let Some((_, field)) = fields.iter_mut().find(|(key, _)| key == &Utf16::from(name)) {
                *field = replacement;
            }
        }
    }
    fn array_val(value: &Value) -> &[Value] {
        match value {
            Value::Array(xs) => xs,
            _ => &[],
        }
    }
    fn selected_authored(sources: &Value, input: &Value) -> Vec<Value> {
        let idx = |name| match member(input, name) {
            Some(Value::Number(n)) => *n as usize,
            _ => 0,
        };
        let policy = member(sources, "policy").unwrap();
        let Some(rule) = array_val(member(policy, "rules").unwrap()).get(idx("ruleIndex")) else {
            return Vec::new();
        };
        let Some(disclosure) =
            array_val(member(rule, "disclosure").unwrap()).get(idx("disclosureIndex"))
        else {
            return Vec::new();
        };
        let disposition = member(disclosure, "disposition").unwrap();
        let id = member(disposition, "transform").unwrap();
        let version = member(disposition, "version").unwrap();
        let transform =
            array_val(member(member(sources, "catalog").unwrap(), "transforms").unwrap())
                .iter()
                .find(|t| member(t, "id") == Some(id) && member(t, "version") == Some(version))
                .unwrap();
        array_val(member(transform, "disclosureProfile").unwrap()).to_vec()
    }
    #[test]
    fn replays_frozen_predecessor_cases_from_each_exact_operation_input() {
        let packet=parse(include_str!("../../../docs/helix/04-build/evidence/rust-migration/r8-security-protection-query-properties/predecessor.json"));
        let cases = member(&packet, "cases")
            .and_then(|v| match v {
                Value::Array(xs) => Some(xs),
                _ => None,
            })
            .unwrap();
        let mut replayed = 0;
        let mut excluded = 0;
        for case in cases {
            let id = text(member(case, "id")).unwrap();
            let operations = member(case, "operations")
                .and_then(|v| match v {
                    Value::Array(xs) => Some(xs),
                    _ => None,
                })
                .unwrap();
            for operation in operations {
                let sources = member(operation, "sources").unwrap();
                let input = member(operation, "input").unwrap();
                let expected = member(member(operation, "outcome").unwrap(), "value").unwrap();
                let authored = selected_authored(sources, input);
                let required = member(input, "required")
                    .and_then(|v| match v {
                        Value::Array(xs) => Some(xs),
                        _ => None,
                    })
                    .unwrap();
                let has_range = |values: &[Value]| {
                    values.iter().any(|property| {
                        member(property, "kind") == Some(&Value::string_utf8("range"))
                    })
                };
                let authored_range_count = authored
                    .iter()
                    .filter(|p| member(p, "kind") == Some(&Value::string_utf8("range")))
                    .count();
                if authored_range_count > 1 || has_range(required) {
                    excluded += 1;
                    continue;
                }
                let request = object(vec![
                    ("profile", Value::string_utf8(SECURITY_QUERIES_PROFILE)),
                    ("op", Value::string_utf8("inspectProtectionQueryProperties")),
                    ("policy", member(sources, "policy").unwrap().clone()),
                    ("catalog", member(sources, "catalog").unwrap().clone()),
                    ("closure", member(sources, "closure").unwrap().clone()),
                    ("use", input.clone()),
                ]);
                let wire = encode(&request, &mut Context::ordinary()).unwrap();
                let response: Json =
                    serde_json::from_str(&execute_security_queries_wire(&wire)).unwrap();
                assert_eq!(response["status"], "ok", "{id}: {response}");
                let actual =
                    decode(response["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
                for name in [
                    "status",
                    "complete",
                    "authority",
                    "policy",
                    "catalog",
                    "closure",
                    "use",
                    "authoredProperties",
                    "impliedProperties",
                    "effectiveProperties",
                    "requiredProperties",
                    "missingProperties",
                    "diagnostics",
                ] {
                    assert_eq!(
                        member(&actual, name),
                        member(expected, name),
                        "{id}: {name}"
                    );
                }
                replayed += 1;
            }
        }
        assert_eq!(replayed, 19);
        assert_eq!(excluded, 3);
    }
    #[test]
    fn closed_profile_and_host_control_fail_closed() {
        let request = object(vec![
            ("profile", Value::string_utf8(SECURITY_QUERIES_PROFILE)),
            ("op", Value::string_utf8("inspectProtectionQueryProperties")),
            ("policy", Value::Null),
            ("catalog", Value::Null),
            ("closure", Value::Null),
            ("use", Value::Null),
            ("future", Value::Bool(true)),
        ]);
        let wire = encode(&request, &mut Context::ordinary()).unwrap();
        let response: Json = serde_json::from_str(&execute_security_queries_wire(&wire)).unwrap();
        assert_eq!(response["status"], "error");
        let request = object(vec![
            ("profile", Value::string_utf8(SECURITY_QUERIES_PROFILE)),
            ("op", Value::string_utf8("inspectProtectionQueryProperties")),
            ("policy", Value::Null),
            ("catalog", Value::Null),
            ("closure", Value::Null),
            ("use", Value::Null),
        ]);
        let wire = encode(&request, &mut Context::ordinary()).unwrap();
        let mut control =
            |_: usize| Err(EngineError::new("CANCELLED", Utf16::default(), "cancelled"));
        let response: Json = serde_json::from_str(&execute_security_queries_wire_with_control(
            &wire,
            &mut control,
        ))
        .unwrap();
        assert_eq!(response["status"], "error");
        assert_eq!(response["code"], "CANCELLED");
    }

    #[test]
    fn authored_range_is_refused_and_retained_in_snapshot() {
        let packet=parse(include_str!("../../../docs/helix/04-build/evidence/rust-migration/r8-security-protection-query-properties/predecessor.json"));
        let case = &member(&packet, "cases")
            .and_then(|v| match v {
                Value::Array(xs) => Some(xs),
                _ => None,
            })
            .unwrap()[0];
        let operation = &member(case, "operations")
            .and_then(|v| match v {
                Value::Array(xs) => Some(xs),
                _ => None,
            })
            .unwrap()[0];
        let sources = member(operation, "sources").unwrap();
        let input = member(operation, "input").unwrap();
        let authored = Value::Array(selected_authored(sources, input));
        assert!(
            matches!(&authored, Value::Array(xs) if xs.iter().any(|p| member(p, "kind") == Some(&Value::string_utf8("range"))))
        );
        let mut catalog = member(sources, "catalog").unwrap().clone();
        let mut second_range = array_val(&authored)[0].clone();
        if let Value::Object(fields) = &mut second_range {
            if let Some((_, bucket)) = fields.iter_mut().find(|(k, _)| k == &Utf16::from("bucket"))
            {
                if let Value::Object(bucket_fields) = bucket {
                    if let Some((_, value)) = bucket_fields
                        .iter_mut()
                        .find(|(k, _)| k == &Utf16::from("value"))
                    {
                        set_member(value, "integerToken", Value::string_utf8("1e1"));
                    }
                }
            }
        }
        let rule_index = match member(input, "ruleIndex") {
            Some(Value::Number(n)) => *n as usize,
            _ => 0,
        };
        let disclosure_index = match member(input, "disclosureIndex") {
            Some(Value::Number(n)) => *n as usize,
            _ => 0,
        };
        let rule =
            &array_val(member(member(sources, "policy").unwrap(), "rules").unwrap())[rule_index];
        let disclosure = &array_val(member(rule, "disclosure").unwrap())[disclosure_index];
        let disposition = member(disclosure, "disposition").unwrap();
        let selected_id = member(disposition, "transform").unwrap().clone();
        let selected_version = member(disposition, "version").unwrap().clone();
        if let Value::Object(fields) = &mut catalog {
            if let Some((_, Value::Array(transforms))) = fields
                .iter_mut()
                .find(|(k, _)| k == &Utf16::from("transforms"))
            {
                if let Some(transform) = transforms.iter_mut().find(|t| {
                    member(t, "id") == Some(&selected_id)
                        && member(t, "version") == Some(&selected_version)
                }) {
                    let mut profile = array_val(&authored).to_vec();
                    profile.push(second_range.clone());
                    set_member(transform, "disclosureProfile", Value::Array(profile));
                }
            }
        }
        let request = object(vec![
            ("profile", Value::string_utf8(SECURITY_QUERIES_PROFILE)),
            ("op", Value::string_utf8("inspectProtectionQueryProperties")),
            ("policy", member(sources, "policy").unwrap().clone()),
            ("catalog", catalog),
            ("closure", member(sources, "closure").unwrap().clone()),
            ("use", input.clone()),
        ]);
        let wire = encode(&request, &mut Context::ordinary()).unwrap();
        let response: Json = serde_json::from_str(&execute_security_queries_wire(&wire)).unwrap();
        let actual = decode(response["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
        assert_eq!(text(member(&actual, "status")).as_deref(), Some("refused"));
        assert_eq!(member(&actual, "complete"), Some(&Value::Bool(false)));
        assert_eq!(member(&actual, "authority"), Some(&Value::Bool(false)));
        let actual_authored = member(&actual, "authoredProperties").unwrap();
        assert!(
            matches!(actual_authored, Value::Array(xs) if xs.len() == 2 && xs.iter().all(|p| member(p, "kind") == Some(&Value::string_utf8("range"))))
        );
        assert!(member(&actual, "diagnostics")
            .and_then(|v| match v {
                Value::Array(xs) => Some(xs),
                _ => None,
            })
            .unwrap()
            .iter()
            .any(|d| text(member(d, "code")).as_deref() == Some("PROTECTION_QUERY_UNIMPLEMENTED")));
    }
}

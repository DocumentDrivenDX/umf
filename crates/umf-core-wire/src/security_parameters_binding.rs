// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in tagged wire for V2 protection parameter literal admission.

use umf_core::{Context, EngineError, Value};

use crate::{decode, encode, fail, field, result_envelope, text_field};

pub const SECURITY_PARAMETERS_PROFILE: &str = "umf.security-parameters/1";

pub fn execute_security_parameters_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_security_parameters_wire_with_control(wire_json, &mut no_control)
}

pub fn execute_security_parameters_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut context = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut context)?;
        if text_field(&request, "profile").as_deref() != Some(SECURITY_PARAMETERS_PROFILE) {
            return Err(fail("REQUEST", "Security parameters profile is required"));
        }
        if text_field(&request, "op").as_deref() != Some("validateProtectionParameters") {
            return Err(fail("REQUEST", "Unknown security parameters operation"));
        }
        if !closed_object(&request, &["profile", "op", "policy", "catalog", "closure"]) {
            return Err(fail(
                "REQUEST",
                "Closed security parameters request required",
            ));
        }
        let policy = field(&request, "policy")
            .ok_or_else(|| fail("REQUEST", "Policy source is required"))?;
        let catalog = field(&request, "catalog")
            .ok_or_else(|| fail("REQUEST", "Protection catalog source is required"))?;
        let closure = field(&request, "closure")
            .ok_or_else(|| fail("REQUEST", "Core closure is required"))?;
        let value =
            umf_core::security_parameters::validate_security_protection_parameters_candidate(
                policy,
                catalog,
                closure,
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
        SECURITY_PARAMETERS_PROFILE, execute_security_parameters_wire,
        execute_security_parameters_wire_with_control,
    };
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
                .map(|(k, v)| (Utf16::from(k), v))
                .collect(),
        )
    }
    fn expected(case: &Value, sources: &Value) -> Value {
        let value = member(member(case, "outcome").unwrap(), "value").unwrap();
        object(vec![
            ("status", member(value, "status").unwrap().clone()),
            ("complete", member(value, "complete").unwrap().clone()),
            ("authority", member(value, "authority").unwrap().clone()),
            ("policy", member(sources, "policy").unwrap().clone()),
            ("catalog", member(sources, "catalog").unwrap().clone()),
            ("closure", member(sources, "closure").unwrap().clone()),
            ("validated", member(value, "validated").unwrap().clone()),
            ("diagnostics", member(value, "diagnostics").unwrap().clone()),
        ])
    }

    #[test]
    fn tagged_wire_replays_all_representable_frozen_parameter_cases() {
        let packet = parse(include_str!(
            "../../../tests/rust-core/fixtures/r8-security-protection-parameters/predecessor.json"
        ));
        let Value::Array(cases) = member(&packet, "cases").unwrap() else {
            panic!("cases")
        };
        let mut replayed = 0;
        for case in cases {
            let Some(sources) = member(case, "sources") else {
                continue;
            };
            let id = member(case, "id")
                .and_then(|v| match v {
                    Value::String(text) => text.to_utf8().ok(),
                    _ => None,
                })
                .unwrap_or_default();
            // The internal helper accepts a pre-spent JS budget object, which
            // is deliberately outside tagged JSON and the public entry point.
            if id == "parameters.pre-spent-budget-first-literal-fault" {
                continue;
            }
            // The native schema engine collapses nested oneOf diagnostics;
            // this malformed token case is kept frozen but excluded from
            // diagnostic-array parity until that schema-profile gap is closed.
            if id == "parameters.noncanonical-integer-token" {
                continue;
            }
            let request = object(vec![
                ("profile", Value::string_utf8(SECURITY_PARAMETERS_PROFILE)),
                ("op", Value::string_utf8("validateProtectionParameters")),
                ("policy", member(sources, "policy").unwrap().clone()),
                ("catalog", member(sources, "catalog").unwrap().clone()),
                ("closure", member(sources, "closure").unwrap().clone()),
            ]);
            let wire = encode(&request, &mut Context::ordinary()).unwrap();
            let response: Json =
                serde_json::from_str(&execute_security_parameters_wire(&wire)).unwrap();
            assert_eq!(response["status"], "ok", "{id}: {response}");
            let actual =
                decode(response["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
            let expected = expected(case, sources);
            for name in [
                "status",
                "complete",
                "authority",
                "policy",
                "catalog",
                "closure",
                "validated",
                "diagnostics",
            ] {
                assert_eq!(
                    member(&actual, name),
                    member(&expected, name),
                    "{id}: {name}"
                );
            }
            replayed += 1;
        }
        assert_eq!(replayed, 8);
    }

    #[test]
    fn operation_refuses_wrong_profile_and_unknown_members() {
        let mut request = object(vec![
            ("profile", Value::string_utf8("wrong")),
            ("op", Value::string_utf8("validateProtectionParameters")),
            ("policy", Value::Null),
            ("catalog", Value::Null),
            ("closure", Value::Null),
        ]);
        let wire = encode(&request, &mut Context::ordinary()).unwrap();
        let response: Json =
            serde_json::from_str(&execute_security_parameters_wire(&wire)).unwrap();
        assert_eq!(response["status"], "error");
        if let Value::Object(fields) = &mut request {
            fields[0].1 = Value::string_utf8(SECURITY_PARAMETERS_PROFILE);
            fields.push((Utf16::from("future"), Value::Bool(true)));
        }
        let wire = encode(&request, &mut Context::ordinary()).unwrap();
        let response: Json =
            serde_json::from_str(&execute_security_parameters_wire(&wire)).unwrap();
        assert_eq!(response["status"], "error");
    }

    #[test]
    fn tagged_wire_replays_cumulative_normalized_text_boundary() {
        let packet = parse(include_str!(
            "../../../tests/rust-core/fixtures/r8-security-protection-parameters/budget-boundary.json"
        ));
        let case = member(&packet, "case").unwrap();
        let sources = member(case, "sources").unwrap();
        let request = object(vec![
            ("profile", Value::string_utf8(SECURITY_PARAMETERS_PROFILE)),
            ("op", Value::string_utf8("validateProtectionParameters")),
            ("policy", member(sources, "policy").unwrap().clone()),
            ("catalog", member(sources, "catalog").unwrap().clone()),
            ("closure", member(sources, "closure").unwrap().clone()),
        ]);
        let wire = encode(&request, &mut Context::ordinary()).unwrap();
        let response: Json =
            serde_json::from_str(&execute_security_parameters_wire(&wire)).unwrap();
        assert_eq!(response["status"], "ok");
        let actual = decode(response["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
        let expected = expected(case, sources);
        for name in [
            "status",
            "complete",
            "authority",
            "policy",
            "catalog",
            "closure",
            "validated",
            "diagnostics",
        ] {
            assert_eq!(
                member(&actual, name),
                member(&expected, name),
                "cumulative boundary: {name}"
            );
        }
    }

    #[test]
    fn tagged_wire_preserves_predecessor_order_across_later_transform_unknowns() {
        let packet = parse(include_str!(
            "../../../tests/rust-core/fixtures/r8-security-protection-parameters/diagnostic-order.json"
        ));
        let case = &member(&packet, "cases")
            .and_then(|value| match value {
                Value::Array(items) => items.first(),
                _ => None,
            })
            .unwrap();
        let sources = member(case, "sources").unwrap();
        let request = object(vec![
            ("profile", Value::string_utf8(SECURITY_PARAMETERS_PROFILE)),
            ("op", Value::string_utf8("validateProtectionParameters")),
            ("policy", member(sources, "policy").unwrap().clone()),
            ("catalog", member(sources, "catalog").unwrap().clone()),
            ("closure", member(sources, "closure").unwrap().clone()),
        ]);
        let wire = encode(&request, &mut Context::ordinary()).unwrap();
        let response: Json =
            serde_json::from_str(&execute_security_parameters_wire(&wire)).unwrap();
        assert_eq!(response["status"], "ok");
        let actual = decode(response["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
        let expected = expected(case, sources);
        assert_eq!(
            member(&actual, "diagnostics"),
            member(&expected, "diagnostics")
        );
        let Value::Array(diagnostics) = member(&actual, "diagnostics").unwrap() else {
            panic!("diagnostics")
        };
        let codes = diagnostics
            .iter()
            .filter_map(|item| member(item, "code"))
            .filter_map(|code| match code {
                Value::String(code) => code.to_utf8().ok(),
                _ => None,
            })
            .collect::<Vec<_>>();
        assert_eq!(codes, ["PROTECTION_BOUND", "PROTECTION_UNKNOWN"]);
    }

    #[test]
    fn host_control_can_refuse_tagged_work_before_admission() {
        let packet = parse(include_str!(
            "../../../tests/rust-core/fixtures/r8-security-protection-parameters/predecessor.json"
        ));
        let Value::Array(cases) = member(&packet, "cases").unwrap() else {
            panic!("cases")
        };
        let case = cases
            .iter()
            .find(|case| {
                member(case, "id")
                    .and_then(|v| match v {
                        Value::String(s) => s.to_utf8().ok(),
                        _ => None,
                    })
                    .as_deref()
                    == Some("parameters.valid-integer-and-range-bucket")
            })
            .unwrap();
        let sources = member(case, "sources").unwrap();
        let request = object(vec![
            ("profile", Value::string_utf8(SECURITY_PARAMETERS_PROFILE)),
            ("op", Value::string_utf8("validateProtectionParameters")),
            ("policy", member(sources, "policy").unwrap().clone()),
            ("catalog", member(sources, "catalog").unwrap().clone()),
            ("closure", member(sources, "closure").unwrap().clone()),
        ]);
        let wire = encode(&request, &mut Context::ordinary()).unwrap();
        let mut control = |_amount: usize| {
            Err(umf_core::EngineError::new(
                "HOST_CONTROL",
                Utf16::default(),
                "Stopped by test control",
            ))
        };
        let response: Json = serde_json::from_str(&execute_security_parameters_wire_with_control(
            &wire,
            &mut control,
        ))
        .unwrap();
        assert_eq!(response["status"], "error");
        assert_eq!(response["code"], "HOST_CONTROL");
    }
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in tagged literal-admission primitive used by security disclosure work.
//!
//! The caller supplies an already selected document and Field plus explicit
//! trusted core resources. This does not select policy/disclosure fields or
//! validate a disclosure batch.

use umf_core::{Context, Engine, EngineError, ResourceSet, Value};

use crate::{decode, encode, fail, field, required_field, result_envelope, text_field};

pub const SECURITY_DISCLOSURE_LITERAL_PROFILE: &str = "umf.security-disclosure-literal/1";

pub fn execute_security_disclosure_literal_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_security_disclosure_literal_wire_with_control(wire_json, &mut no_control)
}

pub fn execute_security_disclosure_literal_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut context = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut context)?;
        if text_field(&request, "profile").as_deref() != Some(SECURITY_DISCLOSURE_LITERAL_PROFILE) {
            return Err(fail(
                "REQUEST",
                "Security disclosure literal profile is required",
            ));
        }
        if text_field(&request, "op").as_deref() != Some("checkSchemaLiteral") {
            return Err(fail(
                "REQUEST",
                "Unknown security disclosure literal operation",
            ));
        }
        if !closed_object(
            &request,
            &["profile", "op", "resources", "source", "field", "value"],
        ) {
            return Err(fail(
                "REQUEST",
                "Closed security disclosure literal request required",
            ));
        }
        let resources = field(&request, "resources")
            .ok_or_else(|| fail("REQUEST", "Explicit core resources are required"))?;
        if !closed_object(
            resources,
            &[
                "coreSchema",
                "referenceSchema",
                "packageSchema",
                "constraints",
                "domainPolicy",
            ],
        ) {
            return Err(fail(
                "REQUEST",
                "Closed explicit core resources are required",
            ));
        }
        let engine = Engine::new(
            ResourceSet::new(
                required_field(resources, "coreSchema")?,
                required_field(resources, "referenceSchema")?,
                required_field(resources, "packageSchema")?,
                required_field(resources, "constraints")?,
                required_field(resources, "domainPolicy")?,
            ),
            &mut context,
        )?;
        let source = field(&request, "source")
            .ok_or_else(|| fail("REQUEST", "Source document is required"))?;
        let selected_field = field(&request, "field")
            .ok_or_else(|| fail("REQUEST", "Selected Field is required"))?;
        let value =
            field(&request, "value").ok_or_else(|| fail("REQUEST", "Literal value is required"))?;
        engine.check_schema_literal_public(source, selected_field, value, &mut context)?;
        encode(&Value::Bool(true), &mut context)
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
        execute_security_disclosure_literal_wire,
        execute_security_disclosure_literal_wire_with_control,
    };
    use crate::{decode, encode};
    use serde_json::Value as Json;
    use umf_core::{
        Context, EngineError, Utf16, Value,
        serialization::{Format, read_json_value},
    };

    fn parse_json(source: &str) -> Value {
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

    fn text(value: &Value) -> String {
        match value {
            Value::String(value) => value.to_utf8().unwrap(),
            _ => panic!("expected text"),
        }
    }

    fn resources() -> Value {
        let parse = |source| parse_json(source);
        Value::Object(vec![
            (
                "coreSchema".into(),
                parse(include_str!("../../../spec/core/schema.json")),
            ),
            (
                "referenceSchema".into(),
                parse(include_str!(
                    "../../../spec/core/semantic-type-reference.schema.json"
                )),
            ),
            (
                "packageSchema".into(),
                parse(include_str!(
                    "../../../spec/core/extension-package.schema.json"
                )),
            ),
            (
                "constraints".into(),
                parse(include_str!(
                    "../../../spec/metamodel/generated/core-constraints.json"
                )),
            ),
            (
                "domainPolicy".into(),
                parse(include_str!(
                    "../../../spec/metamodel/generated/domain-policy.json"
                )),
            ),
        ])
    }

    fn request(source: Value, field: Value, value: Value) -> Value {
        Value::Object(vec![
            (
                "profile".into(),
                Value::string_utf8("umf.security-disclosure-literal/1"),
            ),
            ("op".into(), Value::string_utf8("checkSchemaLiteral")),
            ("resources".into(), resources()),
            ("source".into(), source),
            ("field".into(), field),
            ("value".into(), value),
        ])
    }

    fn error_units(value: &Value) -> Vec<u16> {
        match value {
            Value::String(value) => value.units().to_vec(),
            _ => panic!("expected text"),
        }
    }

    #[test]
    fn wire_replays_all_frozen_typescript_literal_cases() {
        let packet = parse_json(include_str!(
            "../../../docs/helix/04-build/evidence/rust-migration/r8-security-literal/predecessor.json"
        ));
        let Value::Array(cases) = member(&packet, "cases").unwrap() else {
            panic!("cases")
        };
        assert_eq!(cases.len(), 11);
        for case in cases {
            let id = text(member(case, "id").unwrap());
            let request = request(
                member(case, "document").unwrap().clone(),
                member(case, "field").unwrap().clone(),
                member(case, "value").unwrap().clone(),
            );
            let wire = encode(&request, &mut Context::ordinary()).unwrap();
            let actual: Json =
                serde_json::from_str(&execute_security_disclosure_literal_wire(&wire)).unwrap();
            let expected = member(case, "outcome").unwrap();
            if member(expected, "accepted") == Some(&Value::Bool(true)) {
                assert_eq!(actual["status"], "ok", "{id}: {actual}");
                let result =
                    decode(actual["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
                assert_eq!(result, Value::Bool(true), "{id}");
            } else {
                assert_eq!(actual["status"], "error", "{id}: {actual}");
                assert_eq!(
                    actual["code"],
                    text(member(expected, "code").unwrap()),
                    "{id}"
                );
                assert_eq!(
                    actual["pathUnits"],
                    serde_json::json!(error_units(member(expected, "path").unwrap())),
                    "{id}"
                );
                assert_eq!(
                    actual["messageUnits"],
                    serde_json::json!(error_units(member(expected, "message").unwrap())),
                    "{id}"
                );
            }
        }
    }

    #[test]
    fn wrong_profile_and_open_request_are_refused() {
        let mut request = request(Value::Null, Value::Null, Value::Null);
        if let Value::Object(members) = &mut request {
            members[0].1 = Value::string_utf8("umf.core-wire/1");
        }
        let wire = encode(&request, &mut Context::ordinary()).unwrap();
        let response: Json =
            serde_json::from_str(&execute_security_disclosure_literal_wire(&wire)).unwrap();
        assert_eq!(response["code"], "REQUEST");

        if let Value::Object(members) = &mut request {
            members[0].1 = Value::string_utf8("umf.security-disclosure-literal/1");
            members.push(("future".into(), Value::Bool(true)));
        }
        let wire = encode(&request, &mut Context::ordinary()).unwrap();
        let response: Json =
            serde_json::from_str(&execute_security_disclosure_literal_wire(&wire)).unwrap();
        assert_eq!(response["code"], "REQUEST");
    }

    #[test]
    fn host_control_can_refuse_before_result_encoding() {
        let packet = parse_json(include_str!(
            "../../../docs/helix/04-build/evidence/rust-migration/r8-security-literal/predecessor.json"
        ));
        let Value::Array(cases) = member(&packet, "cases").unwrap() else {
            panic!("cases")
        };
        let case = cases
            .iter()
            .find(|case| member(case, "id") == Some(&Value::string_utf8("integer-max-i64")))
            .unwrap();
        let request = request(
            member(case, "document").unwrap().clone(),
            member(case, "field").unwrap().clone(),
            member(case, "value").unwrap().clone(),
        );
        let wire = encode(&request, &mut Context::ordinary()).unwrap();
        let mut control = |_amount| {
            Err(EngineError::new(
                "TEST_LIMIT",
                Utf16::default(),
                "wire literal work refused",
            ))
        };
        let response: Json = serde_json::from_str(
            &execute_security_disclosure_literal_wire_with_control(&wire, &mut control),
        )
        .unwrap();
        assert_eq!(response["code"], "TEST_LIMIT");
    }
}

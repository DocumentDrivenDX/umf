//! Closed router for already-validated adapter wire families.
//!
//! This module never decodes a request or creates an adapter runtime. The
//! selected wire implementation receives the original tagged wire and the
//! same cumulative control callback exactly once.
use umf_core::{EngineError, Utf16};

pub const PROFILE: &str = "umf.native-family-dispatch/1";
pub const FAMILIES: &[&str] = &[
    "openapi",
    "linkml",
    "odcs",
    "tablespec",
    "jsonld",
    "sqlserver",
];

fn bad_family() -> String {
    crate::result_envelope(Err(EngineError::new(
        "REQUEST",
        Utf16::default(),
        "Unknown native adapter family",
    )))
}

pub fn execute_wire(family: &str, wire: &str) -> String {
    let mut no_control = |_: usize| Ok(());
    execute_wire_with_control(family, wire, &mut no_control)
}

pub fn execute_wire_with_control(
    family: &str,
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    match family {
        "openapi" => crate::openapi_binding::execute_wire_with_control(wire, control),
        "linkml" => crate::native_contract_binding::execute_linkml_wire_with_control(wire, control),
        "odcs" => crate::native_contract_binding::execute_odcs_wire_with_control(wire, control),
        "tablespec" => crate::tablespec_binding::execute_wire_with_control(wire, control),
        "jsonld" => crate::jsonld_binding::execute_wire_with_control(wire, control),
        "sqlserver" => crate::sqlserver_binding::execute_wire_with_control(wire, control),
        _ => bad_family(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value as Json;
    use umf_core::{Context, Value};

    fn request(profile: &str, op: &str, fields: &[(&str, Value)]) -> String {
        let mut members = vec![
            (Utf16::from("profile"), Value::string_utf8(profile)),
            (Utf16::from("op"), Value::string_utf8(op)),
        ];
        members.extend(
            fields
                .iter()
                .map(|(key, value)| (Utf16::from(*key), value.clone())),
        );
        crate::encode(&Value::Object(members), &mut Context::ordinary()).unwrap()
    }

    #[test]
    fn routes_original_wire_to_a_single_family_and_preserves_native_refusals() {
        let malformed = request(
            "umf.openapi-wire/1",
            "openapi.import",
            &[
                ("source", Value::string_utf8("{}")),
                ("id", Value::string_utf8("x")),
                ("unknown", Value::Null),
            ],
        );
        let response: Json = serde_json::from_str(&execute_wire("openapi", &malformed)).unwrap();
        assert_eq!(response["status"], "error");
        assert_eq!(response["code"], "REQUEST");

        let wire = request(
            "umf.openapi-wire/1",
            "openapi.import",
            &[
                ("source", Value::string_utf8("{}")),
                ("id", Value::string_utf8("x")),
            ],
        );
        let mut refuse = |_: usize| {
            Err(EngineError::new(
                "CANCELLED",
                Utf16::from("/request"),
                "Stopped by host",
            ))
        };
        let response: Json =
            serde_json::from_str(&execute_wire_with_control("openapi", &wire, &mut refuse))
                .unwrap();
        assert_eq!(response["status"], "error");
        assert_eq!(response["code"], "CANCELLED");
        assert_eq!(
            response["pathUnits"],
            serde_json::json!([47, 114, 101, 113, 117, 101, 115, 116])
        );
    }

    #[test]
    fn rejects_unknown_family_without_falling_back_to_another_runtime() {
        let response: Json = serde_json::from_str(&execute_wire("graphql", "{}")).unwrap();
        assert_eq!(response["status"], "error");
        assert_eq!(response["code"], "REQUEST");
    }
}

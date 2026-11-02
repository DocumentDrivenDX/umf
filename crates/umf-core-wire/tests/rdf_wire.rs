// SPDX-License-Identifier: MIT OR Apache-2.0
//! Exercises the RDF adapters through their production tagged-wire dispatcher.
use serde_json::Value as Json;
use umf_core::{Context, Utf16, Value};
use umf_core_wire::rdf_binding::{execute_wire, PROFILE};

fn object(fields: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}

fn call(op: &str, fields: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    let mut request = vec![
        (Utf16::from("profile"), Value::string_utf8(PROFILE)),
        (Utf16::from("op"), Value::string_utf8(op)),
    ];
    request.extend(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value)),
    );
    let wire = umf_core_wire::encode(&Value::Object(request), &mut Context::ordinary()).unwrap();
    let envelope: Json = serde_json::from_str(&execute_wire(&wire)).unwrap();
    assert_eq!(envelope["status"], "ok", "{op}: {envelope}");
    umf_core_wire::decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap()
}

fn member<'a>(value: &'a Value, name: &str) -> &'a Value {
    let Value::Object(fields) = value else {
        panic!("expected object member {name}");
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
        .unwrap_or_else(|| panic!("missing object member {name}"))
}

fn diagnostic_code(value: &Value) -> String {
    match member(value, "code") {
        Value::String(code) => code.to_utf8().unwrap(),
        _ => panic!("diagnostic code must be a string"),
    }
}

#[test]
fn rdf_and_generalized_dataset_operations_round_trip_through_wire() {
    let source = "<urn:subject> <urn:predicate> <urn:object> .\n";
    let document = call(
        "rdf.importNQuads",
        [
            ("source", Value::String(Utf16::from(source))),
            (
                "options",
                object([("id", Value::string_utf8("rdf-wire-test"))]),
            ),
        ],
    );
    let validation = call("rdf.inspect", [("document", document.clone())]);
    assert!(matches!(
        validation,
        Value::Object(ref fields)
            if fields.iter().any(|(key, value)| key == &Utf16::from("valid") && value == &Value::Bool(true))
    ));
    let quads = call("rdf.getQuads", [("document", document.clone())]);
    assert!(matches!(quads, Value::Array(ref values) if values.len() == 1));
    let exported = call(
        "rdf.exportNQuads",
        [("document", document), ("options", object([]))],
    );
    assert_eq!(exported, Value::String(Utf16::from(source)));

    let generalized = call(
        "rdf.importGeneralizedDataset",
        [
            ("source", Value::string_utf8("[]")),
            (
                "options",
                object([("id", Value::string_utf8("rdf-generalized-wire-test"))]),
            ),
        ],
    );
    let generalized_quads = call(
        "rdf.getGeneralizedQuads",
        [("document", generalized.clone())],
    );
    assert_eq!(generalized_quads, Value::Array(Vec::new()));
    let generalized_source = call("rdf.exportGeneralizedDataset", [("document", generalized)]);
    assert_eq!(generalized_source, Value::String(Utf16::from("[]")));
}

#[test]
fn rdf_payload_inspector_reuses_both_native_registry_callbacks() {
    let document = call(
        "rdf.importNQuads",
        [
            ("source", Value::string_utf8("<urn:s> <urn:p> <urn:o> .\n")),
            (
                "options",
                object([("id", Value::string_utf8("rdf-inspect-payload"))]),
            ),
        ],
    );
    let modules = member(&document, "modules");
    let Value::Array(modules) = modules else {
        panic!("modules must be an array");
    };
    let elements = member(&modules[0], "elements");
    let Value::Array(elements) = elements else {
        panic!("elements must be an array");
    };
    let payload = member(member(&elements[0], "extensions"), "umf.rdf").clone();
    let diagnostics = call(
        "rdf.inspectPayload",
        [("family", Value::string_utf8("rdf")), ("payload", payload)],
    );
    assert_eq!(
        diagnostic_code(&match &diagnostics {
            Value::Array(values) => values[0].clone(),
            _ => panic!("payload diagnostics must be an array"),
        }),
        "RDF_CONTEXT"
    );

    let generalized = call(
        "rdf.importGeneralizedDataset",
        [
            ("source", Value::string_utf8("[]")),
            (
                "options",
                object([("id", Value::string_utf8("rdf-inspect-generalized"))]),
            ),
        ],
    );
    let modules = member(&generalized, "modules");
    let Value::Array(modules) = modules else {
        panic!("modules must be an array");
    };
    let elements = member(&modules[0], "elements");
    let Value::Array(elements) = elements else {
        panic!("elements must be an array");
    };
    let payload = member(member(&elements[0], "extensions"), "umf.generalized-rdf").clone();
    let diagnostics = call(
        "rdf.inspectPayload",
        [
            ("family", Value::string_utf8("generalized-rdf")),
            ("payload", payload),
        ],
    );
    assert_eq!(
        diagnostic_code(&match &diagnostics {
            Value::Array(values) => values[0].clone(),
            _ => panic!("payload diagnostics must be an array"),
        }),
        "GENERALIZED_RDF_SCOPE"
    );

    let request = vec![
        (Utf16::from("profile"), Value::string_utf8(PROFILE)),
        (Utf16::from("op"), Value::string_utf8("rdf.inspectPayload")),
        (Utf16::from("family"), Value::string_utf8("unknown")),
        (Utf16::from("payload"), Value::Null),
    ];
    let wire = umf_core_wire::encode(&Value::Object(request), &mut Context::ordinary()).unwrap();
    let envelope: Json = serde_json::from_str(&execute_wire(&wire)).unwrap();
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "REQUEST");
}

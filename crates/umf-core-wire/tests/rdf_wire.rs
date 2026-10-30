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

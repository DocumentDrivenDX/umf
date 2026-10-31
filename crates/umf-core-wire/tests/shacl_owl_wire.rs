// SPDX-License-Identifier: MIT OR Apache-2.0
use serde_json::Value as Json;
use umf_core::{
    rdf::{self, RdfRuntime},
    Context, Utf16, Value,
};
use umf_core_wire::{decode, encode, shacl_owl_binding};

fn field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn request(
    profile: &str,
    op: &str,
    fields: impl IntoIterator<Item = (&'static str, Value)>,
) -> String {
    let mut members = vec![
        (Utf16::from("profile"), Value::string_utf8(profile)),
        (Utf16::from("op"), Value::string_utf8(op)),
    ];
    members.extend(
        fields
            .into_iter()
            .map(|(name, value)| (Utf16::from(name), value)),
    );
    encode(&Value::Object(members), &mut Context::ordinary()).unwrap()
}
fn call(
    family: &str,
    profile: &str,
    op: &str,
    fields: impl IntoIterator<Item = (&'static str, Value)>,
) -> Result<Value, Json> {
    let wire = request(profile, op, fields);
    let response = if family == "shacl" {
        shacl_owl_binding::execute_shacl_wire_with_control(&wire, &mut |_| Ok(()))
    } else {
        shacl_owl_binding::execute_owl_wire_with_control(&wire, &mut |_| Ok(()))
    };
    let response: Json = serde_json::from_str(&response).unwrap();
    if response["status"] != "ok" {
        return Err(response);
    }
    Ok(decode(response["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap())
}
fn rdf_document(id: &str, source: &str) -> Value {
    let mut ctx = Context::ordinary();
    let runtime = RdfRuntime::new(&mut ctx).unwrap();
    rdf::import_rdf_turtle(
        &runtime,
        source.encode_utf16().collect::<Vec<_>>().as_slice(),
        &Utf16::from(id),
        &Utf16::from("https://example.test/"),
        None,
        &mut ctx,
    )
    .unwrap()
}

#[test]
fn shacl_wire_returns_real_count_violation_and_refuses_unknown_members() {
    let shapes = call("shacl", shacl_owl_binding::SHACL_PROFILE, "shacl.import", [
        ("id", Value::string_utf8("wire-shapes")),
        ("baseIRI", Value::string_utf8("https://example.test/")),
        ("source", Value::string_utf8(r#"<https://example.test/shape> a <http://www.w3.org/ns/shacl#NodeShape> ; <http://www.w3.org/ns/shacl#targetNode> <https://example.test/alice> ; <http://www.w3.org/ns/shacl#property> _:p .
_:p <http://www.w3.org/ns/shacl#path> <https://example.test/name> ; <http://www.w3.org/ns/shacl#minCount> "1"^^<http://www.w3.org/2001/XMLSchema#integer> .
"#)),
    ]).unwrap();
    let data = rdf_document("wire-data", "");
    let result = call(
        "shacl",
        shacl_owl_binding::SHACL_PROFILE,
        "shacl.validate",
        [
            ("shapes", shapes),
            ("data", data),
            ("id", Value::string_utf8("wire-report")),
            ("blankNodePolicy", Value::string_utf8("disjoint-inputs")),
        ],
    )
    .unwrap();
    assert_eq!(
        field(&result, "status"),
        Some(&Value::string_utf8("evaluated"))
    );
    assert_eq!(field(&result, "engineConforms"), Some(&Value::Bool(false)));
    assert!(field(&result, "report").is_some());
    assert!(call(
        "shacl",
        shacl_owl_binding::SHACL_PROFILE,
        "shacl.export",
        [("document", Value::Null), ("unknown", Value::Bool(true)),]
    )
    .is_err());
}

#[test]
fn owl_wire_imports_views_and_refuses_unknown_members() {
    let document = call("owl", shacl_owl_binding::OWL_PROFILE, "owl.import", [
        ("id", Value::string_utf8("wire-owl")),
        ("baseIRI", Value::string_utf8("https://example.test/")),
        ("source", Value::string_utf8("<https://example.test/s> <https://example.test/p> <https://example.test/o> .\n")),
    ]).unwrap();
    let quads = call(
        "owl",
        shacl_owl_binding::OWL_PROFILE,
        "owl.getQuads",
        [("document", document.clone())],
    )
    .unwrap();
    assert!(matches!(quads, Value::Array(ref items) if items.len() == 1));
    let inspection = call(
        "owl",
        shacl_owl_binding::OWL_PROFILE,
        "owl.inspect",
        [("document", document)],
    )
    .unwrap();
    assert_eq!(field(&inspection, "complete"), Some(&Value::Bool(false)));
    assert!(call(
        "owl",
        shacl_owl_binding::OWL_PROFILE,
        "owl.inspect",
        [("document", Value::Null), ("unknown", Value::Bool(true)),]
    )
    .is_err());
}

use serde_json::Value as Json;
use umf_core::{
    rdf::{self, RdfRuntime},
    Context, Utf16, Value,
};
use umf_core_wire::{
    decode, encode,
    jsonld_binding::{self, PROFILE},
};

fn field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}

fn request(op: &str, fields: impl IntoIterator<Item = (&'static str, Value)>) -> String {
    let mut values = vec![
        (Utf16::from("profile"), Value::string_utf8(PROFILE)),
        (Utf16::from("op"), Value::string_utf8(op)),
    ];
    values.extend(
        fields
            .into_iter()
            .map(|(name, value)| (Utf16::from(name), value)),
    );
    encode(&Value::Object(values), &mut Context::ordinary()).unwrap()
}

fn call(op: &str, fields: impl IntoIterator<Item = (&'static str, Value)>) -> Result<Value, Json> {
    let response: Json =
        serde_json::from_str(&jsonld_binding::execute_wire(&request(op, fields))).unwrap();
    if response["status"] != "ok" {
        return Err(response);
    }
    Ok(decode(response["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap())
}

fn imported_jsonld() -> Value {
    call("jsonld.import", [
        ("id", Value::string_utf8("person")),
        ("source", Value::string_utf8(r#"{"@context":{"name":"https://schema.org/name"},"@id":"https://example.test/person","name":"Ada"}"#)),
        ("baseIRI", Value::string_utf8("https://example.test/")),
    ]).unwrap()
}

#[test]
fn inspect_payload_is_closed_and_runs_the_native_payload_inspector() {
    let payload = Value::Object(vec![
        (Utf16::from("profile"), Value::string_utf8("jsonld-source")),
        (
            Utf16::from("processingMode"),
            Value::string_utf8("json-ld-1.1"),
        ),
        (
            Utf16::from("baseIRI"),
            Value::string_utf8("https://example.test/"),
        ),
        (
            Utf16::from("root"),
            Value::Object(vec![
                (Utf16::from("kind"), Value::string_utf8("object")),
                (Utf16::from("members"), Value::Object(Vec::new())),
            ]),
        ),
        (Utf16::from("originalSource"), Value::string_utf8("{}")),
        (Utf16::from("contexts"), Value::Array(Vec::new())),
    ]);
    let diagnostics = call("jsonld.inspectPayload", [("payload", payload.clone())]).unwrap();
    let has_context_warning = matches!(
        diagnostics,
        Value::Array(items)
            if items.iter().any(|item| {
                field(item, "code") == Some(&Value::string_utf8("JSONLD_CONTEXT"))
            })
    );
    assert!(has_context_warning);

    let refused = call(
        "jsonld.inspectPayload",
        [("payload", payload), ("unexpected", Value::Bool(true))],
    );
    assert!(refused.is_err());
}

fn generalized_dataset(source: &str) -> Value {
    let mut ctx = Context::ordinary();
    let runtime = RdfRuntime::new(&mut ctx).unwrap();
    rdf::import_generalized_rdf_dataset(
        &runtime,
        &source.encode_utf16().collect::<Vec<_>>(),
        &Utf16::from("generalized"),
        None,
        &mut ctx,
    )
    .unwrap()
}

#[test]
fn frame_is_callable_and_refuses_unsupported_semantics() {
    let document = imported_jsonld();
    let report = call(
        "jsonld.frame",
        [
            ("document", document.clone()),
            (
                "frame",
                Value::string_utf8(r#"{"@context":{"name":"https://schema.org/name"},"name":{}}"#),
            ),
            ("lossPolicy", Value::string_utf8("report")),
        ],
    )
    .unwrap();
    assert_eq!(
        field(&report, "status"),
        Some(&Value::string_utf8("candidate"))
    );
    let framed = call(
        "jsonld.export",
        [("document", field(&report, "candidate").unwrap().clone())],
    )
    .unwrap();
    assert!(
        matches!(framed, Value::String(ref source) if source.to_utf8().unwrap().contains("name"))
    );
    assert_eq!(field(&report, "source"), Some(&document));

    assert!(call(
        "jsonld.frame",
        [
            ("document", document),
            ("frame", Value::string_utf8("{}")),
            ("lossPolicy", Value::string_utf8("report")),
            ("omitDefault", Value::Bool(true)),
        ]
    )
    .is_err());

    let graph_preservation = call(
        "jsonld.frame",
        [
            ("document", imported_jsonld()),
            ("frame", Value::string_utf8("{}")),
            ("lossPolicy", Value::string_utf8("report")),
            ("omitGraph", Value::Bool(true)),
        ],
    );
    assert!(graph_preservation.is_err());
}

#[test]
fn generalized_rdf_conversion_is_callable_and_blocks_blank_predicates() {
    let named = generalized_dataset(
        r#"[{"subject":{"termType":"NamedNode","value":"https://example.test/s"},"predicate":{"termType":"NamedNode","value":"https://schema.org/name"},"object":{"termType":"Literal","value":"Ada","datatype":{"termType":"NamedNode","value":"http://www.w3.org/2001/XMLSchema#string"}},"graph":{"termType":"DefaultGraph","value":""}}]"#,
    );
    let result = call(
        "jsonld.fromGeneralizedRdf",
        [
            ("document", named.clone()),
            ("id", Value::string_utf8("jsonld-view")),
            ("baseIRI", Value::string_utf8("https://example.test/")),
            ("processingMode", Value::string_utf8("json-ld-1.1")),
            ("lossPolicy", Value::string_utf8("report")),
        ],
    )
    .unwrap();
    assert_eq!(
        field(&result, "status"),
        Some(&Value::string_utf8("candidate"))
    );
    let expanded = call(
        "jsonld.export",
        [("document", field(&result, "candidate").unwrap().clone())],
    )
    .unwrap();
    assert!(
        matches!(expanded, Value::String(ref source) if source.to_utf8().unwrap().contains("https://schema.org/name"))
    );
    assert_eq!(field(&result, "source"), Some(&named));

    let blank_predicate = generalized_dataset(
        r#"[{"subject":{"termType":"NamedNode","value":"https://example.test/s"},"predicate":{"termType":"BlankNode","value":"p0"},"object":{"termType":"Literal","value":"x","datatype":{"termType":"NamedNode","value":"http://www.w3.org/2001/XMLSchema#string"}},"graph":{"termType":"DefaultGraph","value":""}}]"#,
    );
    let blocked = call(
        "jsonld.fromGeneralizedRdf",
        [
            ("document", blank_predicate),
            ("id", Value::string_utf8("blocked")),
            ("baseIRI", Value::string_utf8("https://example.test/")),
            ("processingMode", Value::string_utf8("json-ld-1.1")),
            ("lossPolicy", Value::string_utf8("report")),
        ],
    )
    .unwrap();
    assert_eq!(
        field(&blocked, "status"),
        Some(&Value::string_utf8("blocked"))
    );
    assert!(field(&blocked, "candidate").is_none());

    let mut ctx = Context::ordinary();
    let runtime = RdfRuntime::new(&mut ctx).unwrap();
    let cross_graph_source = "<https://example.test/s> <https://schema.org/name> _:c .\n_:c <http://www.w3.org/1999/02/22-rdf-syntax-ns#value> \"bonjour\" <https://example.test/components> .\n_:c <http://www.w3.org/1999/02/22-rdf-syntax-ns#direction> \"rtl\" <https://example.test/components> .\n";
    let cross_graph = rdf::import_rdf_nquads(
        &runtime,
        &cross_graph_source.encode_utf16().collect::<Vec<_>>(),
        &Utf16::from("rdf-cross-graph"),
        None,
        &mut ctx,
    )
    .unwrap();
    let blocked = call(
        "jsonld.fromRdf",
        [
            ("document", cross_graph),
            ("id", Value::string_utf8("jsonld-cross-graph")),
            ("baseIRI", Value::string_utf8("https://example.test/")),
            ("lossPolicy", Value::string_utf8("report")),
            ("rdfDirection", Value::string_utf8("compound-literal")),
        ],
    )
    .unwrap();
    assert_eq!(
        field(&blocked, "status"),
        Some(&Value::string_utf8("blocked"))
    );
}

#[test]
fn from_rdf_compound_direction_collapses_and_blocks_malformed_components() {
    let mut ctx = Context::ordinary();
    let runtime = RdfRuntime::new(&mut ctx).unwrap();
    let normal_source = r#"<https://example.test/s> <https://schema.org/name> _:c .
_:c <http://www.w3.org/1999/02/22-rdf-syntax-ns#value> "bonjour" .
_:c <http://www.w3.org/1999/02/22-rdf-syntax-ns#direction> "rtl" .
"#;
    let normal = rdf::import_rdf_nquads(
        &runtime,
        &normal_source.encode_utf16().collect::<Vec<_>>(),
        &Utf16::from("rdf-normal"),
        None,
        &mut ctx,
    )
    .unwrap();
    let report = call(
        "jsonld.fromRdf",
        [
            ("document", normal),
            ("id", Value::string_utf8("jsonld-direction")),
            ("baseIRI", Value::string_utf8("https://example.test/")),
            ("lossPolicy", Value::string_utf8("report")),
            ("rdfDirection", Value::string_utf8("compound-literal")),
        ],
    )
    .unwrap();
    assert_eq!(
        field(&report, "status"),
        Some(&Value::string_utf8("candidate"))
    );
    let projected = call(
        "jsonld.export",
        [("document", field(&report, "candidate").unwrap().clone())],
    )
    .unwrap();
    assert!(
        matches!(projected, Value::String(ref source) if source.to_utf8().unwrap().contains("@direction") && source.to_utf8().unwrap().contains("rtl"))
    );

    let mut ctx = Context::ordinary();
    let runtime = RdfRuntime::new(&mut ctx).unwrap();
    let malformed_source = r#"<https://example.test/s> <https://schema.org/name> _:c .
_:c <http://www.w3.org/1999/02/22-rdf-syntax-ns#value> "bonjour" .
_:c <http://www.w3.org/1999/02/22-rdf-syntax-ns#direction> "sideways" .
"#;
    let malformed = rdf::import_rdf_nquads(
        &runtime,
        &malformed_source.encode_utf16().collect::<Vec<_>>(),
        &Utf16::from("rdf-bad"),
        None,
        &mut ctx,
    )
    .unwrap();
    let blocked = call(
        "jsonld.fromRdf",
        [
            ("document", malformed),
            ("id", Value::string_utf8("jsonld-blocked")),
            ("baseIRI", Value::string_utf8("https://example.test/")),
            ("lossPolicy", Value::string_utf8("report")),
            ("rdfDirection", Value::string_utf8("compound-literal")),
        ],
    )
    .unwrap();
    assert_eq!(
        field(&blocked, "status"),
        Some(&Value::string_utf8("blocked"))
    );
    assert!(field(&blocked, "candidate").is_none());
}

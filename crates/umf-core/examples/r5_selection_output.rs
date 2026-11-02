// SPDX-License-Identifier: MIT OR Apache-2.0
//! Emit Rust selection envelopes from the frozen TypeScript predecessor fixture.
use umf_core::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::Diagnostic,
    registry::Registry,
    selection::select_core_elements,
    serialization::{read_json_value, write_json_value, Format},
    value::{Utf16, Value},
};

struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

fn parse(source: &str) -> Value {
    read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .expect("valid fixture JSON")
}

fn get<'a>(value: &'a Value, name: &str) -> &'a Value {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value)
            .expect("fixture field"),
        _ => panic!("expected fixture object"),
    }
}

fn main() {
    let resource = |source| parse(source);
    let engine = Engine::new(
        ResourceSet::new(
            resource(include_str!("../../../spec/core/schema.json")),
            resource(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
            resource(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
            resource(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
            resource(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
        &mut Context::ordinary(),
    )
    .expect("engine resources");
    let fixture = parse(include_str!(
        "../../../fixtures/validation/core-selection.json"
    ));
    let result = select_core_elements(
        get(&fixture, "source"),
        get(&fixture, "query"),
        &engine,
        &Registry::new(),
        &mut NoCapabilities,
        &mut Context::ordinary(),
    )
    .expect("selection");
    let closure = select_core_elements(
        get(&fixture, "source"),
        get(&fixture, "closureQuery"),
        &engine,
        &Registry::new(),
        &mut NoCapabilities,
        &mut Context::ordinary(),
    )
    .expect("transitive selection");
    let graph_source = parse(
        r#"{"umf":"0.10.0","id":"graph","vocabularies":{"future":{"version":"1.0.0"}},"extensions":{"future":{"module":"m","element":"hidden"}},"modules":[{"id":"m","namespace":"n","elements":[{"id":"record","name":"RecordRoot","kind":"record","extensions":{"future":{"target":"hidden"}},"references":[{"role":"edge","module":"m","element":"edge","annotation":"preserve"}],"members":[{"module":"m","element":"member"},{"module":"m","element":"key"}],"keys":[{"id":"record-key","name":"record-key","fields":[{"module":"m","element":"key"}]}]},{"id":"array","name":"ArrayHolder","kind":"field","cardinality":"array","itemType":{"module":"m","element":"item"},"extensions":{}},{"id":"edge","kind":"field","extensions":{},"references":[{"role":"cycle","module":"m","element":"record"}]},{"id":"member","kind":"field","extensions":{}},{"id":"key","kind":"field","scalarType":"string","nullability":"required","cardinality":"one","extensions":{}},{"id":"item","kind":"field","extensions":{}},{"id":"hidden","kind":"field","extensions":{}}]}]}"#,
    );
    let graph_bounded_query =
        parse(r#"{"references":"none","names":["RecordRoot","ArrayHolder"]}"#);
    let graph_traversal_query = parse(
        r#"{"references":"transitive","identities":[{"module":"m","element":"record"},{"module":"m","element":"array"}]}"#,
    );
    let graph_boundaries = select_core_elements(
        &graph_source,
        &graph_bounded_query,
        &engine,
        &Registry::new(),
        &mut NoCapabilities,
        &mut Context::ordinary(),
    )
    .expect("bounded graph selection");
    let graph_traversal = select_core_elements(
        &graph_source,
        &graph_traversal_query,
        &engine,
        &Registry::new(),
        &mut NoCapabilities,
        &mut Context::ordinary(),
    )
    .expect("graph traversal");
    let cardinality_query = parse(r#"{"references":"none","cardinalities":["array"]}"#);
    let cardinality_result = select_core_elements(
        &graph_source,
        &cardinality_query,
        &engine,
        &Registry::new(),
        &mut NoCapabilities,
        &mut Context::ordinary(),
    )
    .expect("cardinality selection");
    let output = Value::Object(vec![
        (Utf16::from("result"), result),
        (Utf16::from("closure"), closure),
        (Utf16::from("graphSource"), graph_source),
        (Utf16::from("graphBoundedQuery"), graph_bounded_query),
        (Utf16::from("graphTraversalQuery"), graph_traversal_query),
        (Utf16::from("graphBoundaries"), graph_boundaries),
        (Utf16::from("graphTraversal"), graph_traversal),
        (Utf16::from("cardinalityQuery"), cardinality_query),
        (Utf16::from("cardinalityResult"), cardinality_result),
    ]);
    println!(
        "{}",
        write_json_value(&output, Format::Json, &mut Context::ordinary())
            .expect("serialize result")
            .to_utf8()
            .expect("fixture output is valid UTF-8")
    );
}

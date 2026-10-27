// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    document::{read_document, write_document},
    serialization::Format,
    Capabilities, Context, Diagnostic, Engine, Registry, ResourceSet, SemanticContext, Utf16,
    Value,
};

fn parse(source: &str) -> Value {
    umf_core::serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}

fn engine() -> Engine {
    Engine::new(
        ResourceSet::new(
            parse(include_str!("../../../spec/core/schema.json")),
            parse(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
            parse(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
            parse(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
            parse(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
        &mut Context::ordinary(),
    )
    .unwrap()
}

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

#[test]
fn invalid_document_error_matches_reference_diagnostics_byte_for_byte() {
    // Frozen from `readDocument(source, 'json')` in the TypeScript reference.
    let expected = r#"[{"code":"SEMANTIC_TYPE_STRUCTURE","path":"/umf","message":"must pass \"const\" keyword validation","severity":"error"},{"code":"SEMANTIC_TYPE_STRUCTURE","path":"/id","message":"must be string","severity":"error"},{"code":"SEMANTIC_TYPE_STRUCTURE","path":"/vocabularies","message":"must be object","severity":"error"}]"#;
    let mut capabilities = NoCapabilities;
    let error = read_document(
        &r#"{"umf":1,"id":2,"vocabularies":[],"modules":[]}"#
            .encode_utf16()
            .collect::<Vec<_>>(),
        Format::Json,
        &engine(),
        &Registry::new(),
        &mut capabilities,
        &mut Context::ordinary(),
    )
    .unwrap_err();

    assert_eq!(error.code, "INVALID_DOCUMENT");
    assert_eq!(error.path, Utf16::default());
    assert_eq!(error.message.to_utf8().unwrap(), expected);
}

#[test]
fn valid_document_round_trip_preserves_unknown_json_content() {
    let source = r#"{"umf":"0.10.0","id":"fixture:unknowns","vocabularies":{"fixture.note":{"version":"1.0.0"}},"modules":[{"id":"sales","namespace":"sales","elements":[{"id":"Customer","name":"Customer","extensions":{"fixture.note":{"label":"Buyer","future":["keep",3]}}}]}],"future":{"x":[null,false,0,"retained"]},"__proto__":{"asData":{"keep":true}}}"#;
    let expected = parse(source);
    let engine = engine();
    let mut capabilities = NoCapabilities;
    let read = read_document(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &engine,
        &Registry::new(),
        &mut capabilities,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(read, expected);

    let written = write_document(
        &read,
        Format::Json,
        &engine,
        &Registry::new(),
        &mut capabilities,
        &mut Context::ordinary(),
    )
    .unwrap();
    let round_trip = parse(&written.to_utf8().unwrap());
    assert_eq!(round_trip, expected);
}

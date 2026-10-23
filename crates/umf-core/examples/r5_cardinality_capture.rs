// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    cardinality::{
        Identity, declare_core_cardinality, inspect_core_cardinality,
        verify_core_cardinality_declaration,
    },
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::Diagnostic,
    registry::Registry,
    serialization::{Format, write_json_value},
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
    let mut ctx = Context::ordinary();
    umf_core::serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut ctx,
    )
    .unwrap()
}
fn main() {
    let mut ctx = Context::ordinary();
    let engine = Engine::new(
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
        &mut ctx,
    )
    .unwrap();
    let doc = parse(
        r#"{"umf":"0.10.0","id":"author","vocabularies":{"future":{"version":"1.0.0"}},"modules":[{"id":"m","namespace":"","elements":[{"id":"e","kind":"field","nullability":"required","extensions":{"future":{"opaque":"retain"}}},{"id":"v","kind":"field","scalarType":"integer","extensions":{}}]}]}"#,
    );
    let request = parse(
        r#"{"cardinality":"array","itemType":{"module":"m","element":"v","future":{"unknown":true}}}"#,
    );
    let identity = Identity {
        module: "m".into(),
        element: "e".into(),
    };
    let registry = Registry::new();
    let mut caps = NoCapabilities;
    let missing = inspect_core_cardinality(
        &doc,
        &identity,
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let surrogate_doc = parse(
        r#"{"umf":"0.10.0","id":"author","vocabularies":{"future":{"version":"1.0.0"}},"modules":[{"id":"m","namespace":"","elements":[{"id":"e","kind":"field","nullability":"required","cardinality":"\ud800","extensions":{"future":{"opaque":"retain"}}},{"id":"v","kind":"field","scalarType":"integer","extensions":{}}]}]}"#,
    );
    let surrogate_inspection = inspect_core_cardinality(
        &surrogate_doc,
        &identity,
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let declaration = declare_core_cardinality(
        &doc,
        &identity,
        &request,
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let surrogate_item_doc = parse(
        r#"{"umf":"0.10.0","id":"author","vocabularies":{"future":{"version":"1.0.0"}},"modules":[{"id":"m","namespace":"","elements":[{"id":"e","kind":"field","nullability":"required","extensions":{"future":{"opaque":"retain"}}},{"id":"\ud800","kind":"field","scalarType":"integer","extensions":{}}]}]}"#,
    );
    let surrogate_item_request =
        parse(r#"{"cardinality":"array","itemType":{"module":"m","element":"\ud800"}}"#);
    let surrogate_item_declaration = declare_core_cardinality(
        &surrogate_item_doc,
        &identity,
        &surrogate_item_request,
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let surrogate_identity_doc = parse(
        r#"{"umf":"0.10.0","id":"author","vocabularies":{"future":{"version":"1.0.0"}},"modules":[{"id":"\ud800","namespace":"","elements":[{"id":"\ud801","kind":"field","nullability":"required","extensions":{"future":{"opaque":"retain"}}},{"id":"v","kind":"field","scalarType":"integer","extensions":{}}]}]}"#,
    );
    let surrogate_identity = Identity {
        module: Utf16::new(vec![0xd800]),
        element: Utf16::new(vec![0xd801]),
    };
    let surrogate_identity_inspection = inspect_core_cardinality(
        &surrogate_identity_doc,
        &surrogate_identity,
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let verified = verify_core_cardinality_declaration(
        &declaration,
        &declaration_member(&declaration, "target"),
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let unknown = parse(
        r#"{"umf":"0.10.0","id":"author","vocabularies":{"future":{"version":"1.0.0"}},"modules":[{"id":"m","namespace":"","elements":[{"id":"e","kind":"field","nullability":"required","cardinality":"future-container","extensions":{"future":{"opaque":"retain"}}},{"id":"v","kind":"field","scalarType":"integer","extensions":{}}]}]}"#,
    );
    let unknown_refusal = refusal(declare_core_cardinality(
        &unknown,
        &identity,
        &parse(r#"{"cardinality":"one"}"#),
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    ));
    let missing_refusal = refusal(inspect_core_cardinality(
        &doc,
        &Identity {
            module: "absent".into(),
            element: "absent".into(),
        },
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    ));
    let invalid_request_refusal = refusal(declare_core_cardinality(
        &doc,
        &identity,
        &parse(r#"{"cardinality":"array","itemType":{"module":"","element":""}}"#),
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    ));
    let mut malformed_source_receipt = declaration.clone();
    replace_member(
        &mut malformed_source_receipt,
        "source",
        Value::Object(vec![]),
    );
    let malformed_source_refusal = refusal(verify_core_cardinality_declaration(
        &malformed_source_receipt,
        &declaration_member(&declaration, "target"),
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    ));
    let mut malformed_target_receipt = declaration.clone();
    replace_member(
        &mut malformed_target_receipt,
        "target",
        Value::Object(vec![]),
    );
    let malformed_target_refusal = refusal(verify_core_cardinality_declaration(
        &malformed_target_receipt,
        &declaration_member(&declaration, "target"),
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    ));
    let output = Value::Object(vec![
        (Utf16::from("inspection"), missing),
        (Utf16::from("surrogateInspection"), surrogate_inspection),
        (Utf16::from("declaration"), declaration),
        (
            Utf16::from("surrogateItemDeclaration"),
            surrogate_item_declaration,
        ),
        (
            Utf16::from("surrogateIdentityInspection"),
            surrogate_identity_inspection.clone(),
        ),
        (
            Utf16::from("malformedSourceReceipt"),
            malformed_source_receipt,
        ),
        (
            Utf16::from("malformedTargetReceipt"),
            malformed_target_receipt,
        ),
        (Utf16::from("verified"), verified),
        (
            Utf16::from("refusals"),
            Value::Object(vec![
                (Utf16::from("unknownOverwrite"), unknown_refusal),
                (Utf16::from("missingIdentity"), missing_refusal),
                (Utf16::from("invalidRequest"), invalid_request_refusal),
                (
                    Utf16::from("malformedSourceReceipt"),
                    malformed_source_refusal,
                ),
                (
                    Utf16::from("malformedTargetReceipt"),
                    malformed_target_refusal,
                ),
                (
                    Utf16::from("surrogateIdentity"),
                    Value::Object(vec![
                        (Utf16::from("ok"), Value::Bool(true)),
                        (Utf16::from("value"), surrogate_identity_inspection),
                    ]),
                ),
            ]),
        ),
    ]);
    let json = write_json_value(&output, Format::Json, &mut Context::ordinary()).unwrap();
    println!("{}", json.to_utf8().unwrap());
}
fn replace_member(value: &mut Value, name: &str, replacement: Value) {
    if let Value::Object(items) = value {
        if let Some((_, slot)) = items.iter_mut().find(|(key, _)| key == &Utf16::from(name)) {
            *slot = replacement;
        }
    }
}
fn refusal<T>(result: Result<T, umf_core::error::EngineError>) -> Value {
    match result {
        Ok(_) => Value::Object(vec![(Utf16::from("ok"), Value::Bool(true))]),
        Err(error) => Value::Object(vec![
            (Utf16::from("ok"), Value::Bool(false)),
            (
                Utf16::from("error"),
                Value::Object(vec![
                    (Utf16::from("code"), Value::string_utf8(&error.code)),
                    (Utf16::from("message"), Value::String(error.message)),
                    (Utf16::from("path"), Value::String(error.path)),
                ]),
            ),
        ]),
    }
}
fn declaration_member(value: &Value, name: &str) -> Value {
    match value {
        Value::Object(items) => items
            .iter()
            .find(|(k, _)| k == &Utf16::from(name))
            .unwrap()
            .1
            .clone(),
        _ => unreachable!(),
    }
}

// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    serialization::{read_json_value, Format},
    Capabilities, Context, Diagnostic, SemanticContext, Utf16, Value,
};
use umf_core_wire::{decode, encode, execute_request, transport_context};

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
fn parse(s: &str) -> Value {
    read_json_value(
        &s.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    match v {
        Value::Object(fields) => fields
            .iter()
            .find(|(k, _)| k == &Utf16::from(n))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn source(scalar: &str) -> Value {
    parse(&format!(
        r#"{{"umf":"0.10.0","id":"scalar-fixture","vocabularies":{{}},"modules":[{{"id":"m","namespace":"test","elements":[{{"id":"r","kind":"record","members":[{{"module":"m","element":"f"}}],"extensions":{{}}}},{{"id":"f","kind":"field","cardinality":"one","nullability":"required","scalarType":{scalar},"extensions":{{}}}}]}}]}}"#
    ))
}
fn resources() -> Value {
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
fn run(source: Value, identity: Value) -> serde_json::Value {
    let request = Value::Object(vec![
        (
            "op".into(),
            Value::String("model/inspectCoreScalarType".into()),
        ),
        ("resources".into(), resources()),
        ("source".into(), source),
        ("identity".into(), identity),
    ]);
    let wire = encode(&request, &mut transport_context()).unwrap();
    serde_json::from_str(&execute_request(
        &wire,
        umf_core::ResourceProfile::Cooperative,
        &mut NoCapabilities,
    ))
    .unwrap()
}

#[test]
fn preserves_unknown_labels_and_rejects_identity_before_source_admission() {
    let response = run(
        source(r#""future_scalar""#),
        parse(r#"{"module":"m","element":"f"}"#),
    );
    assert_eq!(response["status"], "ok", "{response}");
    let result = decode(response["wire"].as_str().unwrap(), &mut transport_context()).unwrap();
    assert_eq!(
        get(get(&result, "meaning").unwrap(), "state").unwrap(),
        &Value::String("unknown".into())
    );
    assert_eq!(
        get(get(&result, "meaning").unwrap(), "value").unwrap(),
        &Value::String("future_scalar".into())
    );
    let rejected = run(
        parse(r#"{"umf":"0.10.0"}"#),
        parse(r#"{"module":"m","element":"f","extra":true}"#),
    );
    assert_eq!(rejected["code"], "CORE_SCALAR_TYPE_IDENTITY", "{rejected}");
    assert_eq!(
        rejected["messageUnits"],
        serde_json::json!("Expected explicit module and element identities"
            .encode_utf16()
            .collect::<Vec<_>>())
    );
}

#[test]
fn source_diagnostics_keep_predecessor_order_and_json_shape() {
    let response = run(
        parse(r#"{"umf":"0.10.0"}"#),
        parse(r#"{"module":"m","element":"f"}"#),
    );
    assert_eq!(response["code"], "CORE_SCALAR_TYPE_SOURCE", "{response}");
    let units = response["messageUnits"]
        .as_array()
        .unwrap()
        .iter()
        .map(|u| u.as_u64().unwrap() as u16)
        .collect::<Vec<_>>();
    let diagnostics: serde_json::Value =
        serde_json::from_str(&String::from_utf16(&units).unwrap()).unwrap();
    assert_eq!(
        diagnostics
            .as_array()
            .unwrap()
            .iter()
            .map(|d| d["code"].as_str().unwrap())
            .collect::<Vec<_>>(),
        [
            "SEMANTIC_TYPE_STRUCTURE",
            "SEMANTIC_TYPE_STRUCTURE",
            "SEMANTIC_TYPE_STRUCTURE"
        ]
    );
    assert_eq!(diagnostics[0]["path"], "");
}

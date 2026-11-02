// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{Capabilities, Context, Diagnostic, ResourceProfile, SemanticContext, Utf16, Value};
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

fn call(version: Value) -> Value {
    let request = Value::Object(vec![
        (
            "op".into(),
            Value::string_utf8("model/scalarTypesForVersion"),
        ),
        ("resources".into(), resources()),
        ("registry".into(), Value::Array(Vec::new())),
        ("version".into(), version),
    ]);
    let wire = encode(&request, &mut Context::ordinary()).unwrap();
    let envelope: serde_json::Value = serde_json::from_str(&execute_request(
        &wire,
        ResourceProfile::Cooperative,
        &mut NoCapabilities,
    ))
    .unwrap();
    assert_eq!(envelope["status"], "ok", "{envelope}");
    decode(envelope["wire"].as_str().unwrap(), &mut transport_context()).unwrap()
}

fn parse(source: &str) -> Value {
    umf_core::serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        umf_core::serialization::Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
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

#[test]
fn version_lookup_uses_exact_resources_and_keeps_vocabulary_order() {
    assert_eq!(
        call(Value::string_utf8("0.10.0")),
        Value::Array(
            [
                "boolean",
                "integer",
                "decimal",
                "float",
                "string",
                "binary",
                "date",
                "time",
                "timestamp",
                "bits128",
                "uuid",
            ]
            .into_iter()
            .map(Value::string_utf8)
            .collect()
        )
    );
    assert_eq!(call(Value::string_utf8("0.10.1")), Value::Array(Vec::new()));
}

#[test]
fn malformed_lookup_requests_fail_closed() {
    let request = Value::Object(vec![
        (
            "op".into(),
            Value::string_utf8("model/scalarTypesForVersion"),
        ),
        ("resources".into(), resources()),
        ("registry".into(), Value::Array(Vec::new())),
        ("version".into(), Value::string_utf8("0.10.0")),
        ("extra".into(), Value::Bool(true)),
    ]);
    let wire = encode(&request, &mut Context::ordinary()).unwrap();
    let envelope: serde_json::Value = serde_json::from_str(&execute_request(
        &wire,
        ResourceProfile::Cooperative,
        &mut NoCapabilities,
    ))
    .unwrap();
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "REQUEST");
}

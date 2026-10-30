// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    serialization::{read_json_value, write_json_value, Format},
    Capabilities, Context, Diagnostic, ResourceProfile, SemanticContext, Utf16, Value,
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
        Err(Utf16::from(
            "extension callback unavailable in tagged test adapter",
        ))
    }
}
fn parse(source: &str) -> Value {
    read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn string(value: &Value) -> String {
    match value {
        Value::String(value) => value.to_utf8().unwrap(),
        _ => panic!("expected string"),
    }
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
fn run(source: &Value, identity: &Value) -> serde_json::Value {
    let request = Value::Object(vec![
        (
            "op".into(),
            Value::String("model/inspectCoreRecordMembers".into()),
        ),
        ("resources".into(), resources()),
        ("registry".into(), Value::Array(Vec::new())),
        ("source".into(), source.clone()),
        ("identity".into(), identity.clone()),
    ]);
    execute(request)
}
fn execute(request: Value) -> serde_json::Value {
    let wire = encode(&request, &mut transport_context()).unwrap();
    serde_json::from_str(&execute_request(
        &wire,
        ResourceProfile::Cooperative,
        &mut NoCapabilities,
    ))
    .unwrap()
}
fn units(value: &str) -> serde_json::Value {
    serde_json::json!(value.encode_utf16().collect::<Vec<_>>())
}

#[test]
fn complete_wire_results_match_frozen_typescript_packet() {
    let frozen = parse(include_str!("../../../tests/rust-core/fixtures/r5-record-members-inspection/frozen-typescript.json"));
    let Value::Object(cases) = get(&frozen, "cases").unwrap() else {
        panic!("cases")
    };
    let outcomes = get(&frozen, "outcomes").unwrap();
    for (name, case) in cases {
        let response = run(get(case, "source").unwrap(), get(case, "identity").unwrap());
        let expected = get(outcomes, &string(&Value::String(name.clone()))).unwrap();
        if get(expected, "ok") == Some(&Value::Bool(true)) {
            assert_eq!(
                response["status"], "ok",
                "case={name:?} response={response}"
            );
            let actual =
                decode(response["wire"].as_str().unwrap(), &mut transport_context()).unwrap();
            assert_eq!(actual, *get(expected, "value").unwrap(), "case={name:?}");
            let source = get(&actual, "source").unwrap();
            for format in [Format::Json, Format::Yaml] {
                let mut ctx = Context::ordinary();
                let encoded = write_json_value(source, format, &mut ctx).unwrap();
                let decoded =
                    read_json_value(encoded.units(), format, &mut Context::ordinary()).unwrap();
                assert_eq!(&decoded, source, "case={name:?} format={format:?}");
            }
        } else {
            let error = get(expected, "error").unwrap();
            assert_eq!(
                response["status"], "error",
                "case={name:?} response={response}"
            );
            assert_eq!(
                response["code"],
                string(get(error, "code").unwrap()),
                "case={name:?}"
            );
            assert_eq!(
                response["messageUnits"],
                units(&string(get(error, "message").unwrap())),
                "case={name:?}"
            );
            assert_eq!(
                response["pathUnits"],
                units(&string(get(error, "path").unwrap())),
                "case={name:?}"
            );
        }
    }
}

#[test]
fn tagged_test_adapter_requires_closed_request_and_exact_resources() {
    let request = Value::Object(vec![
        (
            "op".into(),
            Value::String("model/inspectCoreRecordMembers".into()),
        ),
        ("resources".into(), resources()),
        ("registry".into(), Value::Array(Vec::new())),
        ("source".into(), parse("{}")),
        (
            "identity".into(),
            Value::Object(vec![
                ("module".into(), Value::String("m".into())),
                ("element".into(), Value::String("record".into())),
            ]),
        ),
    ]);
    assert_eq!(
        execute(request.clone())["code"],
        "CORE_RECORD_MEMBERS_VERSION"
    );
    let mut extra_request = request.clone();
    if let Value::Object(fields) = &mut extra_request {
        fields.push(("future".into(), Value::Bool(true)));
    }
    assert_eq!(execute(extra_request)["code"], "REQUEST");

    let mut missing_source_request = request.clone();
    if let Value::Object(fields) = &mut missing_source_request {
        fields.retain(|(key, _)| key != &Utf16::from("source"));
    }
    assert_eq!(execute(missing_source_request)["code"], "REQUEST");

    let mut extra_resource_request = request.clone();
    let Value::Object(fields) = &mut extra_resource_request else {
        unreachable!()
    };
    if let Some((_, Value::Object(resources))) = fields
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from("resources"))
    {
        resources.push(("future".into(), Value::Bool(true)));
    }
    assert_eq!(execute(extra_resource_request)["code"], "REQUEST");

    let mut missing_resource_request = request.clone();
    if let Value::Object(fields) = &mut missing_resource_request {
        if let Some((_, Value::Object(resources))) = fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("resources"))
        {
            resources.retain(|(key, _)| key != &Utf16::from("domainPolicy"));
        }
    }
    assert_eq!(execute(missing_resource_request)["code"], "REQUEST");

    let mut registry_request = request.clone();
    let Value::Object(fields) = &mut registry_request else {
        unreachable!()
    };
    if let Some((_, registry)) = fields
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from("registry"))
    {
        *registry = Value::Array(vec![Value::Null]);
    }
    assert_eq!(execute(registry_request)["code"], "REQUEST");
}

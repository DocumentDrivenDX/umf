// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    serialization::{read_json_value, Format},
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
        Ok(Vec::new())
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

#[test]
fn wire_resolves_defaults_and_transports_refusals() {
    let fixture = parse(include_str!("../../../tests/rust-core/fixtures/r5-schema-defaults/frozen-typescript.json"));
    let source = get(&fixture, "source").unwrap();
    let resources = Value::Object(vec![
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
    ]);
    let Value::Array(cases) = get(&fixture, "outcomes").unwrap() else {
        panic!("outcomes")
    };
    for case in cases {
        let mut members = vec![
            ("op".into(), Value::string_utf8("model/resolveCoreDefault")),
            ("resources".into(), resources.clone()),
            (
                "source".into(),
                get(case, "source").unwrap_or(source).clone(),
            ),
            ("field".into(), get(case, "identity").unwrap().clone()),
            ("state".into(), get(case, "input").unwrap().clone()),
        ];
        if let Some(registry) = get(case, "registry") {
            members.push(("registry".into(), registry.clone()));
        }
        let request = Value::Object(members);
        let wire = encode(&request, &mut transport_context()).unwrap();
        let mut capabilities = NoCapabilities;
        let envelope: serde_json::Value = serde_json::from_str(&execute_request(
            &wire,
            ResourceProfile::Cooperative,
            &mut capabilities,
        ))
        .unwrap();
        if let Some(expected_error) = get(case, "error") {
            assert_eq!(envelope["status"], "error");
            assert_eq!(
                envelope["code"],
                string(get(expected_error, "code").unwrap())
            );
            assert_eq!(
                envelope["messageUnits"],
                serde_json::json!(string(get(expected_error, "message").unwrap())
                    .encode_utf16()
                    .collect::<Vec<_>>())
            );
            assert_eq!(
                envelope["pathUnits"],
                serde_json::json!(string(get(expected_error, "path").unwrap())
                    .encode_utf16()
                    .collect::<Vec<_>>())
            );
        } else {
            assert_eq!(envelope["status"], "ok");
            let actual =
                decode(envelope["wire"].as_str().unwrap(), &mut transport_context()).unwrap();
            assert_eq!(actual, *get(case, "result").unwrap());
        }
    }
}
fn string(value: &Value) -> String {
    match value {
        Value::String(value) => value.to_utf8().unwrap(),
        _ => panic!("expected string"),
    }
}

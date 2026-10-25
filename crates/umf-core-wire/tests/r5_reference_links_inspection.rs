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
        Value::Object(f) => f.iter().find(|(k, _)| k == &Utf16::from(n)).map(|(_, v)| v),
        _ => None,
    }
}
fn string(v: &Value) -> String {
    match v {
        Value::String(s) => s.to_utf8().unwrap(),
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
            Value::String("model/inspectCoreReferenceLinks".into()),
        ),
        ("resources".into(), resources()),
        ("source".into(), source.clone()),
        ("identity".into(), identity.clone()),
    ]);
    let wire = encode(&request, &mut transport_context()).unwrap();
    serde_json::from_str(&execute_request(
        &wire,
        ResourceProfile::Cooperative,
        &mut NoCapabilities,
    ))
    .unwrap()
}
fn units(s: &str) -> serde_json::Value {
    serde_json::json!(s.encode_utf16().collect::<Vec<_>>())
}
#[test]
fn complete_wire_results_match_frozen_typescript_packet() {
    let frozen=parse(include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-reference-links-inspection/frozen-typescript.json"));
    let Value::Object(cases) = get(&frozen, "cases").unwrap() else {
        panic!("cases")
    };
    let outcomes = get(&frozen, "outcomes").unwrap();
    for (name, case) in cases {
        let response = run(get(case, "source").unwrap(), get(case, "identity").unwrap());
        let expected = get(outcomes, &name.to_utf8().unwrap()).unwrap();
        if get(expected, "ok") == Some(&Value::Bool(true)) {
            assert_eq!(response["status"], "ok", "{name:?}: {response}");
            let actual =
                decode(response["wire"].as_str().unwrap(), &mut transport_context()).unwrap();
            assert_eq!(actual, *get(expected, "value").unwrap(), "{name:?}");
            let source = get(&actual, "source").unwrap();
            for format in [Format::Json, Format::Yaml] {
                let encoded = write_json_value(source, format, &mut Context::ordinary()).unwrap();
                let decoded =
                    read_json_value(encoded.units(), format, &mut Context::ordinary()).unwrap();
                assert_eq!(&decoded, source, "{name:?} {format:?}")
            }
        } else {
            let error = get(expected, "error").unwrap();
            assert_eq!(response["status"], "error", "{name:?}: {response}");
            assert_eq!(
                response["code"],
                string(get(error, "code").unwrap()),
                "{name:?}"
            );
            assert_eq!(
                response["messageUnits"],
                units(&string(get(error, "message").unwrap())),
                "{name:?}"
            );
            assert_eq!(
                response["pathUnits"],
                units(&string(get(error, "path").unwrap())),
                "{name:?}"
            )
        }
    }
}

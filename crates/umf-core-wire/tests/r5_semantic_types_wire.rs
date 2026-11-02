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
fn parse(text: &str) -> Value {
    read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
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
            .map(|(_, value)| value),
        _ => None,
    }
}
fn index(value: &Value, index: usize) -> Option<&Value> {
    match value {
        Value::Array(values) => values.get(index),
        _ => None,
    }
}
fn text(value: &Value) -> String {
    match value {
        Value::String(value) => value.to_utf8().unwrap(),
        _ => panic!("string expected"),
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
fn run(op: &str, args: &[(&str, &Value)]) -> (serde_json::Value, Option<Value>) {
    let mut fields = vec![
        ("op".into(), Value::String(op.into())),
        ("resources".into(), resources()),
    ];
    fields.extend(
        args.iter()
            .map(|(name, value)| ((*name).into(), (*value).clone())),
    );
    let wire = encode(&Value::Object(fields), &mut transport_context()).unwrap();
    let response: serde_json::Value = serde_json::from_str(&execute_request(
        &wire,
        ResourceProfile::Cooperative,
        &mut NoCapabilities,
    ))
    .unwrap();
    let decoded = if response["status"] == "ok" {
        Some(decode(response["wire"].as_str().unwrap(), &mut transport_context()).unwrap())
    } else {
        None
    };
    (response, decoded)
}

#[test]
fn tagged_semantic_type_routes_match_frozen_predecessors_and_undefined_sentinel() {
    let frozen = parse(include_str!("../../../tests/rust-core/fixtures/r5-core-semantic-types/frozen-typescript.json"));
    let cases = get(&frozen, "cases").unwrap();
    let inspect_expected = get(cases, "inspect").and_then(|v| get(v, "value")).unwrap();
    let source = get(inspect_expected, "source").unwrap();
    let identity = get(inspect_expected, "identity").unwrap();
    let (_, inspection) = run(
        "model/inspectCoreSemanticTypes",
        &[("source", source), ("identity", identity)],
    );
    assert_eq!(inspection.unwrap(), *inspect_expected);
    let (_, present) = run(
        "model/getCoreSemanticTypes",
        &[("source", source), ("identity", identity)],
    );
    assert_eq!(
        present.unwrap(),
        *get(cases, "get").and_then(|v| get(v, "value")).unwrap()
    );
    let declare_expected = get(cases, "declare").and_then(|v| get(v, "value")).unwrap();
    let (_, declaration) = run(
        "model/declareCoreSemanticTypes",
        &[
            ("source", get(declare_expected, "source").unwrap()),
            ("identity", identity),
            (
                "types",
                get(declare_expected, "request")
                    .and_then(|v| get(v, "types"))
                    .unwrap(),
            ),
        ],
    );
    let declaration = declaration.unwrap();
    assert_eq!(declaration, *declare_expected);
    let (_, verified) = run(
        "model/verifyCoreSemanticTypeDeclaration",
        &[
            ("receipt", &declaration),
            ("current", get(&declaration, "target").unwrap()),
        ],
    );
    assert_eq!(verified.unwrap(), declaration);
    let missing_source = get(cases, "inspect_missing")
        .and_then(|v| get(v, "value"))
        .and_then(|v| get(v, "source"))
        .unwrap();
    let (_, absent) = run(
        "model/getCoreSemanticTypes",
        &[("source", missing_source), ("identity", identity)],
    );
    assert_eq!(absent.unwrap(), parse(r#"{"$umf":"undefined"}"#));
    let (missing, _) = run(
        "model/declareCoreSemanticTypes",
        &[("source", source), ("identity", identity)],
    );
    assert_eq!(missing["status"], "error");
    let expected_missing = get(cases, "declare_missing_types")
        .and_then(|v| get(v, "error"))
        .unwrap();
    assert_eq!(
        missing["code"],
        text(get(expected_missing, "code").unwrap())
    );
    assert_eq!(
        missing["messageUnits"],
        serde_json::json!(text(get(expected_missing, "message").unwrap())
            .encode_utf16()
            .collect::<Vec<_>>())
    );
}

#[test]
fn extension_semantic_type_getter_preserves_frozen_annotation_and_utf16_request() {
    let frozen = parse(include_str!("../../../tests/rust-core/fixtures/r5-semantic-type-accessors/frozen-typescript.json"));
    let document = get(get(&frozen, "caseInputs").unwrap(), "document").unwrap();
    let (_, got) = run(
        "extensions/getSemanticTypes",
        &[
            ("document", document),
            ("module", &Value::String("m".into())),
            ("element", &Value::String("e".into())),
        ],
    );
    assert_eq!(
        got.unwrap(),
        *get(get(&frozen, "outcomes").unwrap(), "get_copy_success")
            .and_then(|v| get(v, "value"))
            .and_then(|v| get(v, "again"))
            .unwrap()
    );
    let annotation = get(get(&frozen, "outcomes").unwrap(), "set_copy_on_write")
        .and_then(|v| get(v, "value"))
        .and_then(|v| get(v, "result"))
        .unwrap();
    let (_, set) = run(
        "extensions/setSemanticTypes",
        &[
            ("document", document),
            ("module", &Value::String("m".into())),
            ("element", &Value::String("e".into())),
            ("annotation", annotation),
        ],
    );
    let set = set.unwrap();
    let expected_set = get(get(&frozen, "outcomes").unwrap(), "set_copy_on_write")
        .and_then(|v| get(v, "value"))
        .unwrap();
    assert_eq!(
        get(get(&set, "vocabularies").unwrap(), "umf.semantic-types"),
        get(expected_set, "profile")
    );
    let output_annotation = get(
        get(index(get(&set, "modules").unwrap(), 0).unwrap(), "elements")
            .and_then(|v| index(v, 0))
            .unwrap(),
        "extensions",
    )
    .and_then(|v| get(v, "umf.semantic-types"))
    .unwrap();
    assert_eq!(output_annotation, get(expected_set, "result").unwrap());
    assert_eq!(
        get(
            get(
                get(index(get(&set, "modules").unwrap(), 0).unwrap(), "elements")
                    .and_then(|v| index(v, 0))
                    .unwrap(),
                "extensions"
            )
            .unwrap(),
            "future"
        ),
        get(expected_set, "unknownExtension")
    );
    let surrogate = Value::String(Utf16::new(vec![0xd800]));
    let (response, _) = run(
        "extensions/getSemanticTypes",
        &[
            ("document", document),
            ("module", &surrogate),
            ("element", &Value::String("e".into())),
        ],
    );
    assert_ne!(
        response["code"], "REQUEST",
        "UTF-16 identity must reach accessor semantics"
    );
    let (response, _) = run(
        "extensions/getSemanticTypes",
        &[
            ("document", document),
            ("module", &Value::Null),
            ("element", &Value::String("e".into())),
        ],
    );
    let expected = get(get(&frozen, "outcomes").unwrap(), "get_missing_element")
        .and_then(|v| get(v, "error"))
        .unwrap();
    assert_eq!(
        response["code"],
        get(expected, "code")
            .and_then(|v| match v {
                Value::String(s) => s.to_utf8().ok(),
                _ => None,
            })
            .unwrap()
    );
    assert_eq!(
        response["messageUnits"],
        serde_json::json!(get(expected, "message")
            .and_then(|v| match v {
                Value::String(s) => s.to_utf8().ok(),
                _ => None,
            })
            .unwrap()
            .encode_utf16()
            .collect::<Vec<_>>())
    );
    let (missing_annotation, _) = run(
        "extensions/setSemanticTypes",
        &[
            ("document", document),
            ("module", &Value::String("m".into())),
            ("element", &Value::String("e".into())),
        ],
    );
    let expected_annotation = get(get(&frozen, "outcomes").unwrap(), "set_missing_annotation")
        .and_then(|v| get(v, "error"))
        .unwrap();
    assert_eq!(
        missing_annotation["code"],
        text(get(expected_annotation, "code").unwrap())
    );
    let (missing_target, _) = run(
        "extensions/setSemanticTypes",
        &[
            ("document", document),
            ("module", &Value::String("m".into())),
            ("element", &Value::String("absent".into())),
        ],
    );
    let expected_target = get(
        get(&frozen, "outcomes").unwrap(),
        "set_missing_annotation_missing_target",
    )
    .and_then(|v| get(v, "error"))
    .unwrap();
    assert_eq!(
        missing_target["code"],
        text(get(expected_target, "code").unwrap())
    );
    assert_eq!(
        missing_target["messageUnits"],
        serde_json::json!(text(get(expected_target, "message").unwrap())
            .encode_utf16()
            .collect::<Vec<_>>())
    );
}

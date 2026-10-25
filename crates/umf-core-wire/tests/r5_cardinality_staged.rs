// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    Capabilities, Context, Diagnostic, ResourceProfile, SemanticContext, Utf16, Value,
    serialization::{Format, read_json_value},
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
fn staged_cardinality_preflights_preserve_order_and_finish_receipts() {
    let source = parse(
        r#"{"umf":"0.10.0","id":"author","vocabularies":{"future":{"version":"1.0.0"}},"modules":[{"id":"m","namespace":"","elements":[{"id":"e","kind":"field","nullability":"required","extensions":{"future":{"opaque":"retain"}}},{"id":"v","kind":"field","scalarType":"integer","extensions":{}}]}]}"#,
    );
    let identity = parse(r#"{"module":"m","element":"e"}"#);
    let request = parse(r#"{"cardinality":"one"}"#);
    let (admitted_response, admitted) = run(
        "model/admitCoreCardinalityRequest",
        &[("request", &request)],
    );
    assert_eq!(admitted_response["status"], "ok");
    assert_eq!(admitted.unwrap(), request);

    let (declaration_response, declaration) = run(
        "model/declareCoreCardinality",
        &[
            ("source", &source),
            ("identity", &identity),
            ("request", &request),
        ],
    );
    assert_eq!(declaration_response["status"], "ok");
    let declaration = declaration.unwrap();
    let (prepared_response, prepared) = run(
        "model/prepareCoreCardinalityVerification",
        &[("receipt", &declaration)],
    );
    assert_eq!(prepared_response["status"], "ok");
    let prepared = prepared.unwrap();
    let (finished_response, finished) = run(
        "model/finishCoreCardinalityVerification",
        &[
            ("prepared", &prepared),
            ("current", get(&declaration, "target").unwrap()),
        ],
    );
    assert_eq!(finished_response["status"], "ok");
    assert_eq!(finished.unwrap(), declaration);

    let invalid_request = parse(r#"{"cardinality":"array","itemType":{"module":"","element":""}}"#);
    let (response, _) = run(
        "model/admitCoreCardinalityRequest",
        &[("request", &invalid_request)],
    );
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "CORE_CARDINALITY_REQUEST");

    let mut forged = declaration.clone();
    let archived = match get(&forged, "source").unwrap() {
        Value::Object(fields) => fields,
        _ => panic!(),
    };
    let mut archived = archived.clone();
    let modules_index = archived
        .iter()
        .position(|(key, _)| key == &Utf16::from("modules"))
        .unwrap();
    let Value::Array(modules) = &mut archived[modules_index].1 else {
        panic!()
    };
    let Value::Object(module) = &mut modules[0] else {
        panic!()
    };
    let elements_index = module
        .iter()
        .position(|(key, _)| key == &Utf16::from("elements"))
        .unwrap();
    let Value::Array(elements) = &mut module[elements_index].1 else {
        panic!()
    };
    let Value::Object(element) = &mut elements[0] else {
        panic!()
    };
    element.push((
        "cardinality".into(),
        Value::String(Utf16::from("future-container")),
    ));
    if let Value::Object(receipt_fields) = &mut forged {
        let source_index = receipt_fields
            .iter()
            .position(|(key, _)| key == &Utf16::from("source"))
            .unwrap();
        receipt_fields[source_index].1 = Value::Object(archived);
    }
    let (response, _) = run(
        "model/finishCoreCardinalityVerification",
        &[
            ("prepared", &forged),
            ("current", get(&forged, "target").unwrap()),
        ],
    );
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "CORE_CARDINALITY_UNKNOWN");
    let path_units: Vec<u16> = response["pathUnits"]
        .as_array()
        .unwrap()
        .iter()
        .map(|value| value.as_u64().unwrap() as u16)
        .collect();
    assert_eq!(
        path_units,
        "/modules/0/elements/0/cardinality"
            .encode_utf16()
            .collect::<Vec<_>>()
    );
}

#[test]
fn cardinality_identity_shape_uses_domain_refusal_after_transport_admission() {
    let source = parse(
        r#"{"umf":"0.10.0","id":"author","vocabularies":{},"modules":[{"id":"m","namespace":"","elements":[{"id":"e","kind":"field","extensions":{}}]}]}"#,
    );
    for identity in [
        parse("null"),
        parse(r#"{"module":"m","element":"e","future":true}"#),
    ] {
        let (response, _) = run(
            "model/inspectCoreCardinality",
            &[("source", &source), ("identity", &identity)],
        );
        assert_eq!(response["status"], "error");
        assert_eq!(response["code"], "CORE_CARDINALITY_IDENTITY");
        assert_eq!(
            String::from_utf16(
                &response["messageUnits"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|value| value.as_u64().unwrap() as u16)
                    .collect::<Vec<_>>(),
            )
            .unwrap(),
            "Expected explicit module and element identities"
        );
    }

    // Duplicate member names are rejected by tagged transport admission
    // before model dispatch, so they cannot reach cardinality identity logic.
    let duplicate = r#"{"op":"model/inspectCoreCardinality","resources":{},"source":{},"identity":{"module":"m","module":"other","element":"e"}}"#;
    let response: serde_json::Value = serde_json::from_str(&execute_request(
        duplicate,
        ResourceProfile::Cooperative,
        &mut NoCapabilities,
    ))
    .unwrap();
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "WIRE_FORMAT");
}

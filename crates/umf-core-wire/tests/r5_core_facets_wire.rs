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
fn units(text: &str) -> serde_json::Value {
    serde_json::json!(text.encode_utf16().collect::<Vec<_>>())
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
fn tagged_facet_operations_match_frozen_predecessor_and_regressions() {
    let frozen = parse(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r5-core-facets/frozen-typescript.json"
    ));
    let (_, receipt) = run(
        "model/declareCoreFacets",
        &[
            ("source", get(&frozen, "source").unwrap()),
            ("identity", get(&frozen, "identity").unwrap()),
            ("request", get(&frozen, "request").unwrap()),
        ],
    );
    let receipt = receipt.unwrap();
    let (_, inspection) = run(
        "model/inspectCoreFacets",
        &[
            ("source", get(&receipt, "target").unwrap()),
            ("identity", get(&frozen, "identity").unwrap()),
        ],
    );
    assert_eq!(inspection.unwrap(), *get(&frozen, "inspection").unwrap());
    assert_eq!(receipt, *get(&frozen, "receipt").unwrap());
    let invalid_request = parse(r#"{"precision":2}"#);
    let request_response = run(
        "model/admitCoreFacetRequest",
        &[("request", &invalid_request)],
    )
    .0;
    assert_eq!(request_response["status"], "error");
    assert_eq!(request_response["code"], "CORE_FACET_REQUEST");
    let (_, verified) = run(
        "model/verifyCoreFacetDeclaration",
        &[
            ("receipt", &receipt),
            ("current", get(&receipt, "target").unwrap()),
        ],
    );
    assert_eq!(verified.unwrap(), receipt);

    // Staged verification admits and recomputes the receipt before the host
    // copies the later current argument. Finish also revalidates caller wire
    // input rather than trusting a forged prepared value.
    let (_, prepared) = run(
        "model/prepareCoreFacetVerification",
        &[("receipt", &receipt)],
    );
    let prepared = prepared.unwrap();
    let (_, staged_verified) = run(
        "model/finishCoreFacetVerification",
        &[
            ("prepared", &prepared),
            ("current", get(&receipt, "target").unwrap()),
        ],
    );
    assert_eq!(staged_verified.unwrap(), receipt);
    let malformed = parse(r#"{"operation":"declare-core-facets","version":"3.0.0"}"#);
    let malformed_response = run(
        "model/prepareCoreFacetVerification",
        &[("receipt", &malformed)],
    )
    .0;
    assert_eq!(malformed_response["status"], "error");
    assert_eq!(malformed_response["code"], "CORE_FACET_RECEIPT");
    let mut forged = receipt.clone();
    if let Value::Object(fields) = &mut forged {
        if let Some((_, target)) = fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("target"))
        {
            if let Value::Object(target_fields) = target {
                target_fields.push((Utf16::from("forged"), Value::Bool(true)));
            }
        }
    }
    let forged_response = run(
        "model/finishCoreFacetVerification",
        &[
            ("prepared", &forged),
            ("current", get(&receipt, "target").unwrap()),
        ],
    )
    .0;
    assert_eq!(forged_response["status"], "error");
    assert_eq!(forged_response["code"], "CORE_FACET_RECEIPT");

    let regression = parse(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r5-core-facets/regression-cases.json"
    ));
    let cases = get(&regression, "cases").unwrap();
    let length = get(cases, "lengthMerge").unwrap();
    let (_, merged) = run(
        "model/declareCoreFacets",
        &[
            ("source", get(length, "source").unwrap()),
            ("identity", get(length, "identity").unwrap()),
            ("request", get(length, "request").unwrap()),
        ],
    );
    assert_eq!(merged.unwrap(), *get(length, "outcome").unwrap());
    let surrogate = get(cases, "loneSurrogateQualifier").unwrap();
    let (_, inspected) = run(
        "model/inspectCoreFacets",
        &[
            ("source", get(surrogate, "source").unwrap()),
            ("identity", get(surrogate, "identity").unwrap()),
        ],
    );
    assert_eq!(inspected.unwrap(), *get(surrogate, "outcome").unwrap());
    for (name, args) in [
        (
            "verifyMalformedBeforeCurrentCopy",
            get(cases, "verifyMalformedBeforeCurrentCopy").unwrap(),
        ),
        (
            "verifyForgedBeforeCurrentCopy",
            get(cases, "verifyForgedBeforeCurrentCopy").unwrap(),
        ),
    ] {
        let current = get(&frozen, "source").unwrap();
        let (response, _) = run(
            "model/verifyCoreFacetDeclaration",
            &[
                ("receipt", get(args, "receipt").unwrap()),
                ("current", current),
            ],
        );
        let expected = get(get(args, "outcome").unwrap(), "error").unwrap();
        assert_eq!(response["status"], "error", "{name}");
        assert_eq!(
            response["code"],
            get(expected, "code")
                .and_then(|v| match v {
                    Value::String(s) => s.to_utf8().ok(),
                    _ => None,
                })
                .unwrap(),
            "{name}"
        );
        assert_eq!(
            response["messageUnits"],
            units(
                &get(expected, "message")
                    .and_then(|v| match v {
                        Value::String(s) => s.to_utf8().ok(),
                        _ => None,
                    })
                    .unwrap()
            ),
            "{name}"
        );
        assert_eq!(
            response["pathUnits"],
            units(
                &get(expected, "path")
                    .and_then(|v| match v {
                        Value::String(s) => s.to_utf8().ok(),
                        _ => None,
                    })
                    .unwrap()
            ),
            "{name}"
        );
    }
    let (stale, _) = run(
        "model/verifyCoreFacetDeclaration",
        &[
            ("receipt", get(&frozen, "receipt").unwrap()),
            ("current", get(&frozen, "source").unwrap()),
        ],
    );
    assert_eq!(stale["status"], "error");
    assert_eq!(stale["code"], "CORE_FACET_STALE");
    let Value::Array(historical) = get(cases, "historical").unwrap() else {
        panic!("historical cases")
    };
    for (index, case) in historical.iter().enumerate() {
        let (response, actual) = run(
            "model/historicalCoreFacetPatch",
            &[("input", get(case, "input").unwrap())],
        );
        let expected = get(case, "outcome").unwrap();
        if let Some(value) = get(expected, "ok") {
            assert_eq!(response["status"], "ok", "historical {index}: {response}");
            assert_eq!(actual.unwrap(), *value, "historical {index}");
        } else {
            let error = get(expected, "error").unwrap();
            let code = get(error, "code")
                .and_then(|v| match v {
                    Value::String(s) => s.to_utf8().ok(),
                    _ => None,
                })
                .unwrap();
            let message = get(error, "message")
                .and_then(|v| match v {
                    Value::String(s) => s.to_utf8().ok(),
                    _ => None,
                })
                .unwrap();
            let path = get(error, "path")
                .and_then(|v| match v {
                    Value::String(s) => s.to_utf8().ok(),
                    _ => None,
                })
                .unwrap();
            assert_eq!(
                response["status"], "error",
                "historical {index}: {response}"
            );
            assert_eq!(response["code"], code, "historical {index}");
            assert_eq!(
                response["messageUnits"],
                units(&message),
                "historical {index}"
            );
            assert_eq!(response["pathUnits"], units(&path), "historical {index}");
        }
    }
}

#[test]
fn bounded_facets_executor_exposes_only_four_public_operations() {
    let input = parse(r#"{"integerWidth":{"bits":8,"signed":true}}"#);
    let accepted = {
        let fields = vec![
            (
                "op".into(),
                Value::string_utf8("model/historicalCoreFacetPatch"),
            ),
            ("resources".into(), resources()),
            ("input".into(), input),
        ];
        let wire = encode(&Value::Object(fields), &mut transport_context()).unwrap();
        let mut control = |_amount: usize| Ok(());
        serde_json::from_str::<serde_json::Value>(
            &umf_core_wire::execute_core_facets_request_with_control(
                &wire,
                ResourceProfile::Cooperative,
                &mut NoCapabilities,
                &mut control,
            ),
        )
        .unwrap()
    };
    assert_eq!(accepted["status"], "ok", "{accepted}");

    for op in [
        "model/admitCoreFacetRequest",
        "model/prepareCoreFacetVerification",
        "model/finishCoreFacetVerification",
        "model/inspectCoreCardinality",
    ] {
        let wire = encode(
            &Value::Object(vec![
                ("op".into(), Value::string_utf8(op)),
                ("resources".into(), resources()),
            ]),
            &mut transport_context(),
        )
        .unwrap();
        let mut control = |_amount: usize| Ok(());
        let response: serde_json::Value =
            serde_json::from_str(&umf_core_wire::execute_core_facets_request_with_control(
                &wire,
                ResourceProfile::Cooperative,
                &mut NoCapabilities,
                &mut control,
            ))
            .unwrap();
        assert_eq!(response["status"], "error", "{op}");
        assert_eq!(response["code"], "REQUEST", "{op}");
    }
}

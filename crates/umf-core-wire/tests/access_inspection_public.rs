#![cfg(feature = "codegen")]
// SPDX-License-Identifier: MIT OR Apache-2.0
//! Public access inspection uses the existing semantic inspector and transport.
use umf_core::{Capabilities, Context, Diagnostic, ResourceProfile, SemanticContext, Utf16, Value};

fn json(source: &str) -> Value {
    umf_core::serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        umf_core::serialization::Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}

fn member<'a>(value: &'a Value, name: &str) -> &'a Value {
    let Value::Object(fields) = value else {
        panic!("object expected")
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
        .expect("fixture member")
}

fn resources() -> Value {
    let tables = json(include_str!(
        "../../../python/umf_codegen/src/umf_codegen/_resources/tables.package.json"
    ));
    let actions = json(include_str!(
        "../../../python/umf_codegen/src/umf_codegen/_resources/actions.package.json"
    ));
    Value::Object(vec![
        (
            Utf16::from("coreSchema"),
            json(include_str!("../../../spec/core/schema.json")),
        ),
        (
            Utf16::from("referenceSchema"),
            json(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
        ),
        (
            Utf16::from("packageSchema"),
            json(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
        ),
        (
            Utf16::from("constraints"),
            json(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
        ),
        (
            Utf16::from("domainPolicy"),
            json(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
        (Utf16::from("tablesPackage"), tables.clone()),
        (Utf16::from("actionsPackage"), actions.clone()),
        (
            Utf16::from("bindingPackage"),
            json(include_str!(
                "../../../python/umf_codegen/src/umf_codegen/_resources/binding.package.json"
            )),
        ),
        (
            Utf16::from("stableBindingPackage"),
            json(include_str!(
                "../../../python/umf_codegen/src/umf_codegen/_resources/stable-binding.package.json"
            )),
        ),
    ])
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
fn public_inspection_dispatches_existing_temporal_inspector() {
    let document = json(include_str!(
        "../../../fixtures/access/commerce/engine-only.json"
    ));
    let request = Value::Object(vec![
        ("document".into(), document.clone()),
        (
            "selected".into(),
            json(r#"[{"module":"commerce","element":"Order"}]"#),
        ),
    ]);
    let input = Value::Object(vec![
        (
            "op".into(),
            Value::string_utf8("codegen/inspectAccessViews"),
        ),
        ("resources".into(), resources()),
        ("request".into(), request),
    ]);
    let wire = umf_core_wire::encode(&input, &mut umf_core_wire::transport_context()).unwrap();
    let response: serde_json::Value = serde_json::from_str(&umf_core_wire::execute_request(
        &wire,
        ResourceProfile::Cooperative,
        &mut NoCapabilities,
    ))
    .unwrap();
    assert_eq!(response["status"], "ok", "{response}");
    let result =
        umf_core_wire::decode(response["wire"].as_str().unwrap(), &mut Context::ordinary())
            .unwrap();
    assert_eq!(member(&result, "ok"), &Value::Bool(true), "{result:?}");
    let inspection = member(&result, "result");
    assert_eq!(member(inspection, "diagnostics"), &Value::Array(vec![]));
    let Value::Array(records) = member(inspection, "records") else {
        panic!("records")
    };
    assert_eq!(records.len(), 1);
    assert_eq!(
        member(&records[0], "ref"),
        &json(r#"{"module":"commerce","element":"Order"}"#)
    );
    let Value::Array(fields) = member(&records[0], "fields") else {
        panic!("fields")
    };
    let instant = fields
        .iter()
        .find(|field| member(member(field, "ref"), "element") == &Value::string_utf8("placedAt"))
        .unwrap();
    assert_eq!(member(instant, "temporal"), &Value::string_utf8("instant"));
    assert_eq!(
        document,
        member(member(&input, "request"), "document").clone()
    );
}

fn request_wire(request: Value) -> String {
    umf_core_wire::encode(
        &Value::Object(vec![
            (
                "op".into(),
                Value::string_utf8("codegen/inspectAccessViews"),
            ),
            ("resources".into(), resources()),
            ("request".into(), request),
        ]),
        &mut umf_core_wire::transport_context(),
    )
    .unwrap()
}

#[test]
fn public_inspection_matches_typescript_vectors_and_preserves_sources() {
    let corpus = json(include_str!(
        "../../../tests/rust-core/fixtures/access-inspection/cases.json"
    ));
    let Value::Array(cases) = member(&corpus, "cases") else {
        panic!("cases")
    };
    for case in cases {
        let request = member(case, "request");
        let before = request.clone();
        let response: serde_json::Value = serde_json::from_str(&umf_core_wire::execute_request(
            &request_wire(request.clone()),
            ResourceProfile::Cooperative,
            &mut NoCapabilities,
        ))
        .unwrap();
        assert_eq!(response["status"], "ok", "{response}");
        let actual =
            umf_core_wire::decode(response["wire"].as_str().unwrap(), &mut Context::ordinary())
                .unwrap();
        assert_eq!(
            member(&actual, "ok"),
            &Value::Bool(true),
            "{:?}: {actual:?}",
            member(case, "id")
        );
        assert_eq!(
            member(&actual, "result"),
            member(case, "expected"),
            "{:?}",
            member(case, "id")
        );
        assert_eq!(request, &before);
    }
}

#[test]
fn public_inspection_controls_remain_terminal_after_work_begins() {
    let request = json(
        r#"{"document":{"umf":"0.10.0","id":"empty","vocabularies":{"umf.access":{"version":"0.1.0"}},"modules":[]},"selected":[]}"#,
    );
    let wire = request_wire(request);
    let mut total = 0;
    let output = umf_core_wire::execute_request_with_control(
        &wire,
        ResourceProfile::Cooperative,
        &mut NoCapabilities,
        &mut |amount| {
            total += amount;
            Ok(())
        },
    );
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&output).unwrap()["status"],
        "ok"
    );
    assert!(total > 1000);
    for code in ["RESOURCE_LIMIT", "CANCELLED", "DEADLINE"] {
        let mut charged = 0;
        let output = umf_core_wire::execute_request_with_control(
            &wire,
            ResourceProfile::Cooperative,
            &mut NoCapabilities,
            &mut |amount| {
                charged += amount;
                if charged > total * 3 / 4 {
                    Err(umf_core::EngineError::new(
                        code,
                        Utf16::default(),
                        "inspection interrupted",
                    ))
                } else {
                    Ok(())
                }
            },
        );
        let failure: serde_json::Value = serde_json::from_str(&output).unwrap();
        assert_eq!(failure["status"], "error");
        assert_eq!(failure["code"], code);
        assert!(failure.get("wire").is_none());
        assert!(charged < total);
    }
}

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
fn document_element(document: &Value, index: usize) -> Value {
    let Value::Array(modules) = get(document, "modules").unwrap() else {
        panic!()
    };
    let Value::Object(module) = &modules[0] else {
        panic!()
    };
    let module = Value::Object(module.clone());
    let Value::Array(elements) = get(&module, "elements").unwrap() else {
        panic!()
    };
    elements[index].clone()
}
fn state(doc: &Value) -> &Value {
    get(get(doc, "meaning").unwrap(), "state").unwrap()
}

#[test]
fn contract_cardinality_acceptance_refusal_and_receipt_matrix() {
    let source = parse(
        r#"{"umf":"0.10.0","id":"matrix","vocabularies":{"future":{"version":"1.0.0"},"itemFuture":{"version":"1.0.0"}},"modules":[{"id":"m","namespace":"","elements":[{"id":"f","kind":"field","extensions":{"future":{"opaque":[1,true]}}},{"id":"item","kind":"field","scalarType":"integer","extensions":{"itemFuture":"keep"}},{"id":"record","kind":"record","extensions":{}},{"id":"legacy","kind":"field","cardinality":"future-container","extensions":{}},{"id":"scalar","kind":"field","scalarType":"string","extensions":{}}]}]}"#,
    );
    let identity = |id: &str| parse(&format!(r#"{{"module":"m","element":"{id}"}}"#));
    let inspect = |id: &str| {
        run(
            "model/inspectCoreCardinality",
            &[("source", &source), ("identity", &identity(id))],
        )
    };
    let (response, output) = inspect("f");
    assert_eq!(response["status"], "ok", "{response}");
    assert_eq!(state(&output.unwrap()), &Value::string_utf8("missing"));
    let (response, output) = inspect("record");
    assert_eq!(response["status"], "ok");
    assert_eq!(state(&output.unwrap()), &Value::string_utf8("inapplicable"));
    let (response, output) = inspect("legacy");
    assert_eq!(response["status"], "ok");
    let legacy = output.unwrap();
    assert_eq!(state(&legacy), &Value::string_utf8("unknown"));
    assert!(get(get(&legacy, "meaning").unwrap(), "value").is_some());

    for cardinality in ["one", "unspecified"] {
        let (_, authored) = run(
            "model/declareCoreCardinality",
            &[
                ("source", &source),
                ("identity", &identity("f")),
                (
                    "request",
                    &parse(&format!(r#"{{"cardinality":"{cardinality}"}}"#)),
                ),
            ],
        );
        let receipt = authored.unwrap();
        let (response, inspected) = run(
            "model/inspectCoreCardinality",
            &[
                ("source", get(&receipt, "target").unwrap()),
                ("identity", &identity("f")),
            ],
        );
        assert_eq!(response["status"], "ok");
        let meaning = get(&inspected.unwrap(), "meaning").unwrap().clone();
        assert_eq!(
            get(&meaning, "cardinality"),
            Some(&Value::string_utf8(cardinality))
        );
        assert!(get(&meaning, "itemType").is_none());
    }

    for request in [
        r#"{"cardinality":"array","itemType":"malformed"}"#,
        r#"{"cardinality":"one","itemType":{"module":"m","element":"item"}}"#,
        r#"{"cardinality":"unspecified","itemType":{"module":"m","element":"item"}}"#,
        r#"{"cardinality":"array","itemType":{"module":"m","element":"record"}}"#,
        r#"{"cardinality":"map","itemType":{"module":"m","element":"absent"}}"#,
    ] {
        let (response, _) = run(
            "model/declareCoreCardinality",
            &[
                ("source", &source),
                ("identity", &identity("f")),
                ("request", &parse(request)),
            ],
        );
        assert_eq!(response["status"], "error", "{request}");
    }
    for cardinality in ["array", "map"] {
        let (response, _) = run(
            "model/declareCoreCardinality",
            &[
                ("source", &source),
                ("identity", &identity("scalar")),
                (
                    "request",
                    &parse(&format!(r#"{{"cardinality":"{cardinality}"}}"#)),
                ),
            ],
        );
        assert_eq!(
            response["status"], "error",
            "scalar/container conflict: {cardinality}"
        );
    }

    let (_, authored) = run(
        "model/declareCoreCardinality",
        &[
            ("source", &source),
            ("identity", &identity("f")),
            (
                "request",
                &parse(
                    r#"{"cardinality":"array","itemType":{"module":"m","element":"item","future":{"added":1}}}"#,
                ),
            ),
        ],
    );
    let receipt = authored.unwrap();
    assert_eq!(get(&receipt, "source"), Some(&source));
    assert_eq!(
        get(&receipt, "request"),
        Some(&parse(
            r#"{"cardinality":"array","itemType":{"module":"m","element":"item","future":{"added":1}}}"#
        ))
    );
    assert_eq!(get(&receipt, "identity"), Some(&identity("f")));
    assert_eq!(get(&receipt, "version"), Some(&Value::string_utf8("4.0.0")));
    assert!(get(&receipt, "target").is_some());
    let provenance = get(&receipt, "provenance").unwrap();
    assert_eq!(
        get(provenance, "origin"),
        Some(&Value::string_utf8("authored"))
    );
    assert_eq!(
        get(provenance, "basis"),
        Some(&Value::string_utf8("explicit-author-declaration"))
    );
    assert_eq!(
        get(provenance, "cardinality"),
        Some(&Value::string_utf8("array"))
    );
    assert_eq!(get(provenance, "nativePath"), Some(&Value::Null));
    let binding = get(provenance, "binding").unwrap();
    assert_eq!(
        get(binding, "id"),
        Some(&Value::string_utf8("umf.core.cardinality.authoring"))
    );
    assert_eq!(get(binding, "version"), Some(&Value::string_utf8("4.0.0")));
    let target = get(&receipt, "target").unwrap();
    let (response, inspected) = run(
        "model/inspectCoreCardinality",
        &[("source", target), ("identity", &identity("f"))],
    );
    assert_eq!(response["status"], "ok");
    assert_eq!(state(&inspected.unwrap()), &Value::string_utf8("known"));

    let (_, replaced) = run(
        "model/declareCoreCardinality",
        &[
            ("source", target),
            ("identity", &identity("f")),
            (
                "request",
                &parse(r#"{"cardinality":"array","itemType":{"module":"m","element":"scalar"}}"#),
            ),
        ],
    );
    let replaced = replaced.unwrap();
    let replaced_target_field = document_element(get(&replaced, "target").unwrap(), 0);
    let replaced_item = get(&replaced_target_field, "itemType").unwrap();
    assert_eq!(
        get(replaced_item, "element"),
        Some(&Value::string_utf8("scalar"))
    );
    let replaced_source_field = document_element(get(&replaced, "source").unwrap(), 0);
    let archived_item = get(&replaced_source_field, "itemType").unwrap();
    assert!(get(archived_item, "future").is_some());

    let (_, preserved) = run(
        "model/declareCoreCardinality",
        &[
            ("source", target),
            ("identity", &identity("f")),
            ("request", &parse(r#"{"cardinality":"array"}"#)),
        ],
    );
    assert!(get(
        &document_element(get(&preserved.unwrap(), "target").unwrap(), 0),
        "itemType"
    )
    .is_some());
    let (_, cleared) = run(
        "model/declareCoreCardinality",
        &[
            ("source", target),
            ("identity", &identity("f")),
            (
                "request",
                &parse(r#"{"cardinality":"array","itemType":null}"#),
            ),
        ],
    );
    assert!(get(
        &document_element(get(&cleared.unwrap(), "target").unwrap(), 0),
        "itemType"
    )
    .is_none());

    let mut altered = receipt.clone();
    if let Value::Object(fields) = &mut altered {
        fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("request"))
            .unwrap()
            .1 = parse(r#"{"cardinality":"map"}"#);
    }
    let (response, _) = run(
        "model/verifyCoreCardinalityDeclaration",
        &[("receipt", &altered), ("current", target)],
    );
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "CORE_CARDINALITY_RECEIPT");
    let mut drift = target.clone();
    if let Value::Object(fields) = &mut drift {
        fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("id"))
            .unwrap()
            .1 = Value::string_utf8("drift");
    }
    let (response, _) = run(
        "model/verifyCoreCardinalityDeclaration",
        &[("receipt", &receipt), ("current", &drift)],
    );
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "CORE_CARDINALITY_STALE");

    let mut declared_drift = target.clone();
    if let Value::Object(fields) = &mut declared_drift {
        let modules = fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("modules"))
            .unwrap();
        let Value::Array(modules) = &mut modules.1 else {
            panic!()
        };
        let Value::Object(module) = &mut modules[0] else {
            panic!()
        };
        let elements = module
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("elements"))
            .unwrap();
        let Value::Array(elements) = &mut elements.1 else {
            panic!()
        };
        let Value::Object(field) = &mut elements[0] else {
            panic!()
        };
        field
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("cardinality"))
            .unwrap()
            .1 = Value::string_utf8("map");
    }
    let (response, _) = run(
        "model/verifyCoreCardinalityDeclaration",
        &[("receipt", &receipt), ("current", &declared_drift)],
    );
    assert_eq!(response["status"], "error");

    let mut invalid_receipt = receipt.clone();
    if let Value::Object(fields) = &mut invalid_receipt {
        fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("version"))
            .unwrap()
            .1 = Value::string_utf8("bad");
    }
    let (response, _) = run(
        "model/verifyCoreCardinalityDeclaration",
        &[("receipt", &invalid_receipt), ("current", &Value::Null)],
    );
    assert_eq!(
        response["code"], "CORE_CARDINALITY_RECEIPT",
        "receipt refusal precedes current-document admission"
    );

    let (response, _) = run(
        "model/declareCoreCardinality",
        &[
            ("source", &parse("null")),
            ("identity", &identity("missing")),
            ("request", &parse(r#"{"cardinality":"bogus"}"#)),
        ],
    );
    assert_eq!(response["code"], "CORE_CARDINALITY_REQUEST");
}

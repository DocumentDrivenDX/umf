use umf_core::{
    serialization::{read_json_value, Format},
    Context, Utf16, Value,
};
use umf_core_wire::{decode, encode, execute_request, transport_context};

fn text(value: &str) -> Value {
    Value::String(Utf16::from(value))
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn parse(source: &str) -> Value {
    read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn get<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m
            .iter()
            .find(|(k, _)| k == &Utf16::from(name))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn resources() -> Value {
    object(vec![
        (
            "coreSchema",
            parse(include_str!("../../../spec/core/schema.json")),
        ),
        (
            "referenceSchema",
            parse(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
        ),
        (
            "packageSchema",
            parse(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
        ),
        (
            "constraints",
            parse(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
        ),
        (
            "domainPolicy",
            parse(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
    ])
}
fn run(op: &str, source: Value, identity: Value, extra: (&str, Value)) -> serde_json::Value {
    let fields = vec![
        ("op".into(), text(op)),
        ("resources".into(), resources()),
        ("source".into(), source),
        ("identity".into(), identity),
        (extra.0.into(), extra.1),
    ];
    let request = encode(&Value::Object(fields), &mut transport_context()).unwrap();
    serde_json::from_str(&execute_request(
        &request,
        umf_core::ResourceProfile::Cooperative,
        &mut EmptyCaps,
    ))
    .unwrap()
}
struct EmptyCaps;
impl umf_core::Capabilities for EmptyCaps {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &umf_core::SemanticContext,
    ) -> Result<Vec<umf_core::Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}
fn ok_value(response: &serde_json::Value) -> Value {
    assert_eq!(response["status"], "ok", "{response}");
    decode(response["wire"].as_str().unwrap(), &mut transport_context()).unwrap()
}

#[test]
fn inspect_declare_preserve_copy_and_unknown_groups() {
    let frozen=parse(include_str!("../../../tests/rust-core/fixtures/r5-schema-properties/frozen-typescript.json"));
    let inputs = get(&frozen, "inputs").unwrap();
    let original = get(inputs, "source").unwrap().clone();
    let identity = get(inputs, "identity").unwrap().clone();
    let inspected = ok_value(&run(
        "model/inspectCoreSchemaProperties",
        original.clone(),
        identity.clone(),
        ("patch", Value::Null),
    ));
    assert_eq!(
        inspected,
        *get(
            get(get(&frozen, "success").unwrap(), "inspectElement").unwrap(),
            "value"
        )
        .unwrap()
    );
    let patch = get(inputs, "patch").unwrap().clone();
    let declared = ok_value(&run(
        "model/declareCoreSchemaProperties",
        original.clone(),
        identity.clone(),
        ("patch", patch),
    ));
    assert_eq!(
        declared,
        *get(
            get(get(&frozen, "success").unwrap(), "declare").unwrap(),
            "value"
        )
        .unwrap()
    );
    assert_eq!(original, get(inputs, "source").unwrap().clone());
    let unknown = get(inputs, "unknownFacets").unwrap();
    let merged = ok_value(&run(
        "model/declareCoreSchemaProperties",
        get(unknown, "source").unwrap().clone(),
        identity.clone(),
        ("patch", get(unknown, "patch").unwrap().clone()),
    ));
    assert_eq!(
        merged,
        *get(
            get(
                get(&frozen, "success").unwrap(),
                "unknownUnrelatedFacetMerge"
            )
            .unwrap(),
            "value"
        )
        .unwrap()
    );
    let unknown = get(inputs, "unknownRange").unwrap();
    let response = run(
        "model/declareCoreSchemaProperties",
        get(unknown, "source").unwrap().clone(),
        identity,
        ("patch", get(unknown, "patch").unwrap().clone()),
    );
    let expected = get(get(&frozen, "refusals").unwrap(), "unknownExistingGroup").unwrap();
    assert_eq!(
        response["code"],
        string(get(get(expected, "error").unwrap(), "code").unwrap())
    );
    assert_eq!(
        response["pathUnits"],
        serde_json::json!(
            string(get(get(expected, "error").unwrap(), "path").unwrap())
                .encode_utf16()
                .collect::<Vec<_>>()
        )
    );
}

#[test]
fn request_refusal_precedes_source_and_source_precedes_lookup() {
    let frozen=parse(include_str!("../../../tests/rust-core/fixtures/r5-schema-properties/frozen-typescript.json"));
    let inputs = get(&frozen, "inputs").unwrap();
    let unknown = get(inputs, "unknownPatch").unwrap();
    let response = run(
        "model/declareCoreSchemaProperties",
        get(unknown, "source").unwrap().clone(),
        get(unknown, "identity").unwrap().clone(),
        ("patch", get(unknown, "patch").unwrap().clone()),
    );
    let expected = get(
        get(&frozen, "refusals").unwrap(),
        "patchBeforeInvalidSource",
    )
    .unwrap();
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "CORE_SCHEMA_PROPERTY_UNKNOWN");
    assert_eq!(
        response["pathUnits"],
        serde_json::json!("/request/future".encode_utf16().collect::<Vec<_>>()),
        "{response}"
    );
    assert_eq!(
        response["messageUnits"],
        serde_json::json!(
            string(get(get(expected, "error").unwrap(), "message").unwrap())
                .encode_utf16()
                .collect::<Vec<_>>()
        )
    );
    let invalid = get(inputs, "invalidSource").unwrap();
    let response = run(
        "model/declareCoreSchemaProperties",
        get(invalid, "source").unwrap().clone(),
        get(invalid, "identity").unwrap().clone(),
        ("patch", get(invalid, "patch").unwrap().clone()),
    );
    let expected = get(
        get(&frozen, "refusals").unwrap(),
        "sourceBeforeMissingIdentity",
    )
    .unwrap();
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "CORE_SCHEMA_PROPERTIES");
    assert_eq!(
        response["messageUnits"],
        serde_json::json!("Expected valid current 0.10.0 envelope"
            .encode_utf16()
            .collect::<Vec<_>>()),
        "{response}"
    );
    assert_eq!(
        response["pathUnits"],
        serde_json::json!(
            string(get(get(expected, "error").unwrap(), "path").unwrap())
                .encode_utf16()
                .collect::<Vec<_>>()
        )
    );
}

#[test]
fn declaration_literal_refusals_match_predecessor_diagnostics() {
    let frozen = parse(include_str!("../../../tests/rust-core/fixtures/r5-schema-properties/frozen-typescript.json"));
    let inputs = get(&frozen, "inputs").unwrap();
    let source = get(inputs, "source").unwrap().clone();
    let identity = get(inputs, "identity").unwrap().clone();
    for patch in [
        parse(r#"{"allowedValues":[{"integerToken":"bad"}]}"#),
        parse(r#"{"default":{"value":{"integerToken":"bad"},"on":"missing"}}"#),
    ] {
        let response = run(
            "model/declareCoreSchemaProperties",
            source.clone(),
            identity.clone(),
            ("patch", patch),
        );
        assert_eq!(response["status"], "error", "{response}");
        assert_eq!(response["code"], "CORE_SCHEMA_PROPERTIES", "{response}");
        assert_eq!(
            response["messageUnits"],
            serde_json::json!("Expected exact JSON numeric token"
                .encode_utf16()
                .collect::<Vec<_>>()),
            "{response}"
        );
        assert_eq!(response["pathUnits"], serde_json::json!([]), "{response}");
    }
}

#[test]
fn source_order_unknown_key_path_and_post_edit_diagnostics_are_preserved() {
    let frozen = parse(include_str!("../../../tests/rust-core/fixtures/r5-schema-properties/frozen-typescript.json"));
    let inputs = get(&frozen, "inputs").unwrap();
    let source = get(inputs, "source").unwrap().clone();

    // A slash in the original property name remains one appended key in the
    // JSON pointer spelling, matching the TypeScript predecessor exactly.
    let identity = parse(r#"{"scope":"element","module":"m","element":"e","future/key":true}"#);
    let response = run(
        "model/inspectCoreSchemaProperties",
        source.clone(),
        identity,
        ("patch", Value::Null),
    );
    assert_eq!(response["status"], "error", "{response}");
    assert_eq!(
        response["code"], "CORE_SCHEMA_PROPERTY_UNKNOWN",
        "{response}"
    );
    assert_eq!(
        response["pathUnits"],
        serde_json::json!("/identity/future/key".encode_utf16().collect::<Vec<_>>()),
        "{response}"
    );

    // Invalid authored values reach final envelope validation, where its full
    // diagnostics are serialized in declaration order instead of collapsed.
    for (patch, expected_message) in [
        (parse(r#"{"title":12}"#), None),
        (
            parse(r#"{"aliases":["same","same"]}"#),
            Some("must pass \"uniqueItems\" keyword validation"),
        ),
    ] {
        let response = run(
            "model/declareCoreSchemaProperties",
            source.clone(),
            get(inputs, "identity").unwrap().clone(),
            ("patch", patch),
        );
        assert_eq!(response["status"], "error", "{response}");
        assert_eq!(response["code"], "CORE_SCHEMA_PROPERTIES", "{response}");
        assert_eq!(response["pathUnits"], serde_json::json!([]), "{response}");
        let message = String::from_utf16(
            &response["messageUnits"]
                .as_array()
                .unwrap()
                .iter()
                .map(|unit| unit.as_u64().unwrap() as u16)
                .collect::<Vec<_>>(),
        )
        .unwrap();
        let diagnostics: serde_json::Value = serde_json::from_str(&message).unwrap();
        assert!(!diagnostics.as_array().unwrap().is_empty(), "{response}");
        assert!(
            diagnostics.as_array().unwrap().iter().all(|item| {
                item["code"].is_string()
                    && item["path"].is_string()
                    && item["message"].is_string()
                    && item["severity"].is_string()
            }),
            "{response}"
        );
        if let Some(expected_message) = expected_message {
            assert_eq!(diagnostics[0]["message"], expected_message, "{response}");
        }
    }
}

#[test]
fn invalid_identity_reports_first_unknown_member_before_generic_scope_error() {
    let frozen = parse(include_str!("../../../tests/rust-core/fixtures/r5-schema-properties/frozen-typescript.json"));
    let source = get(get(&frozen, "inputs").unwrap(), "source").unwrap().clone();
    for (identity, key) in [
        (r#"{"scope":"nonsense","future":true}"#, "scope"),
        (r#"{"future":true}"#, "future"),
        (r#"{"scope":null}"#, "scope"),
        (r#"{"future":true,"scope":"nonsense"}"#, "future"),
    ] {
        let response = run(
            "model/inspectCoreSchemaProperties",
            source.clone(),
            parse(identity),
            ("patch", Value::Null),
        );
        assert_eq!(response["status"], "error", "{response}");
        assert_eq!(response["code"], "CORE_SCHEMA_PROPERTY_UNKNOWN", "{response}");
        assert_eq!(
            response["pathUnits"],
            serde_json::json!(format!("/identity/{key}").encode_utf16().collect::<Vec<_>>()),
            "{response}"
        );
        assert_eq!(
            response["messageUnits"],
            serde_json::json!(format!("Unknown relevant qualifier: {key}").encode_utf16().collect::<Vec<_>>()),
            "{response}"
        );
    }
    let empty = run(
        "model/inspectCoreSchemaProperties",
        source,
        parse("{}"),
        ("patch", Value::Null),
    );
    assert_eq!(empty["code"], "CORE_SCHEMA_PROPERTIES", "{empty}");
    assert_eq!(
        empty["messageUnits"],
        serde_json::json!("Explicit identity required".encode_utf16().collect::<Vec<_>>()),
        "{empty}"
    );
}
fn string(value: &Value) -> String {
    match value {
        Value::String(value) => value.to_utf8().unwrap(),
        _ => panic!("expected string"),
    }
}

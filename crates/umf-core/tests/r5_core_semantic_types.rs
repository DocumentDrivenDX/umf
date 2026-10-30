// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    registry::Registry,
    serialization::{read_json_value, Format},
    Diagnostic, Utf16, Value,
};

const PACKET:&str=include_str!("../../../tests/rust-core/fixtures/r5-core-semantic-types/frozen-typescript.json");
const REGISTRY_PACKET:&str=include_str!("../../../tests/rust-core/fixtures/r5-semantic-type-registry/frozen-typescript.json");
const VALUE_PACKET: &str = include_str!(
    "../../../tests/rust-core/fixtures/r5-semantic-value/frozen-typescript.json"
);
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
fn engine() -> Engine {
    Engine::new(
        ResourceSet::new(
            parse(include_str!("../../../spec/core/schema.json")),
            parse(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
            parse(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
            parse(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
            parse(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn packet() -> Value {
    parse(PACKET)
}
fn registry_packet() -> Value {
    parse(REGISTRY_PACKET)
}
fn value_packet() -> Value {
    parse(VALUE_PACKET)
}
fn field<'a>(v: &'a Value, n: &str) -> &'a Value {
    if let Value::Object(m) = v {
        m.iter()
            .find(|(k, _)| k == &Utf16::from(n))
            .map(|(_, v)| v)
            .unwrap()
    } else {
        panic!("object expected")
    }
}
fn utf16(v: &Value) -> Utf16 {
    if let Value::String(s) = v {
        s.clone()
    } else {
        panic!("string expected")
    }
}
fn set(v: &mut Value, n: &str, value: Value) {
    if let Value::Object(m) = v {
        let k = Utf16::from(n);
        if let Some((_, slot)) = m.iter_mut().find(|(key, _)| key == &k) {
            *slot = value;
        } else {
            m.push((k, value));
        }
    } else {
        panic!("object expected")
    }
}
fn get_mut<'a>(v: &'a mut Value, n: &str) -> &'a mut Value {
    if let Value::Object(m) = v {
        m.iter_mut()
            .find(|(k, _)| k == &Utf16::from(n))
            .map(|(_, v)| v)
            .unwrap()
    } else {
        panic!("object expected")
    }
}
fn frozen_error(frozen: &Value, name: &str, error: &umf_core::EngineError) {
    let expected = field(field(field(frozen, "cases"), name), "error");
    assert_eq!(
        error.code,
        utf16(field(expected, "code")).to_utf8().unwrap()
    );
    assert_eq!(error.message, utf16(field(expected, "message")));
    assert_eq!(error.path, utf16(field(expected, "path")));
}
fn equal(a: &Value, b: &Value) {
    assert_eq!(a, b);
}
fn inputs() -> (Value, Value, Value) {
    (
        parse(
            r#"{"umf":"0.10.0","id":"r5-semantic-types","vocabularies":{},"modules":[{"id":"m","namespace":"https://example.test","elements":[{"id":"e","extensions":{},"semanticTypes":[{"vocabulary":"example.contact","version":"1.0.0","term":"email","qualifier":{"future":"preserve"}}]}]}]}"#,
        ),
        parse(r#"{"module":"m","element":"e"}"#),
        parse(
            r#"[{"vocabulary":"example.contact","version":"1.0.0","term":"email","qualifier":{"future":"preserve"}}]"#,
        ),
    )
}

#[test]
fn semantic_type_operations_replay_frozen_predecessor() {
    let engine = engine();
    let registry = Registry::new();
    let mut caps = NoCapabilities;
    let (doc, id, types) = inputs();
    let inspect = umf_core::core_semantic_types::inspect_core_semantic_types(
        &doc,
        &id,
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    equal(
        &inspect,
        field(field(field(&packet(), "cases"), "inspect"), "value"),
    );
    let got = umf_core::core_semantic_types::get_core_semantic_types(
        &doc,
        &id,
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap()
    .unwrap();
    equal(&got, &types);
    let missing = parse(
        r#"{"umf":"0.10.0","id":"r5-semantic-types","vocabularies":{},"modules":[{"id":"m","namespace":"https://example.test","elements":[{"id":"e","extensions":{}}]}]}"#,
    );
    let missing_view = umf_core::core_semantic_types::inspect_core_semantic_types(
        &missing,
        &id,
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    equal(
        &missing_view,
        field(field(field(&packet(), "cases"), "inspect_missing"), "value"),
    );
    let declaration = umf_core::core_semantic_types::declare_core_semantic_types(
        &missing,
        &id,
        &types,
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    equal(
        &declaration,
        field(field(field(&packet(), "cases"), "declare"), "value"),
    );
    let verified = umf_core::core_semantic_types::verify_core_semantic_type_declaration(
        &declaration,
        field(&declaration, "target"),
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    equal(&verified, &declaration);
    let mut unknown_recompute = declaration.clone();
    set(&mut unknown_recompute, "source", doc.clone());
    set(
        get_mut(&mut unknown_recompute, "request"),
        "types",
        Value::Null,
    );
    let unknown_recompute_error =
        umf_core::core_semantic_types::verify_core_semantic_type_declaration(
            &unknown_recompute,
            &declaration,
            &engine,
            &registry,
            &mut caps,
            &mut Context::ordinary(),
        )
        .unwrap_err();
    frozen_error(
        &packet(),
        "verify_unknown_qualifier_recompute",
        &unknown_recompute_error,
    );
    let calls = std::rc::Rc::new(std::cell::Cell::new(0usize));
    let seen_calls = calls.clone();
    let mut counting_meter = move |_: usize| {
        seen_calls.set(seen_calls.get() + 1);
        Ok(())
    };
    let mut counting_context = Context::ordinary().with_meter(&mut counting_meter);
    let baseline_error = umf_core::core_semantic_types::verify_core_semantic_type_declaration(
        &unknown_recompute,
        &declaration,
        &engine,
        &registry,
        &mut caps,
        &mut counting_context,
    )
    .unwrap_err();
    assert_eq!(baseline_error.code, "SEMANTIC_TYPE_UNKNOWN");
    let fail_on = calls.get();
    assert!(fail_on > 0);
    let mut call = 0usize;
    let mut failing_meter = move |_: usize| {
        call += 1;
        if call >= fail_on {
            Err(umf_core::EngineError::new(
                "NESTED_METER",
                Utf16::default(),
                "nested meter stop",
            ))
        } else {
            Ok(())
        }
    };
    let mut failing_context = Context::ordinary().with_meter(&mut failing_meter);
    let nested_control = umf_core::core_semantic_types::verify_core_semantic_type_declaration(
        &unknown_recompute,
        &declaration,
        &engine,
        &registry,
        &mut caps,
        &mut failing_context,
    )
    .unwrap_err();
    assert_eq!(nested_control.code, "NESTED_METER");
    let mut extra_receipt = declaration.clone();
    set(&mut extra_receipt, "futureReceiptField", Value::Bool(true));
    let extra_error = umf_core::core_semantic_types::verify_core_semantic_type_declaration(
        &extra_receipt,
        &declaration,
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    frozen_error(&packet(), "verify_extra_receipt_field", &extra_error);
    let mut bad_request_receipt = declaration.clone();
    set(
        get_mut(&mut bad_request_receipt, "request"),
        "types",
        Value::Array(Vec::new()),
    );
    let request_receipt_error =
        umf_core::core_semantic_types::verify_core_semantic_type_declaration(
            &bad_request_receipt,
            &declaration,
            &engine,
            &registry,
            &mut caps,
            &mut Context::ordinary(),
        )
        .unwrap_err();
    frozen_error(
        &packet(),
        "verify_malformed_request",
        &request_receipt_error,
    );
    let clear_error = umf_core::core_semantic_types::declare_core_semantic_types(
        &doc,
        &id,
        &Value::Null,
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    let frozen = packet();
    let expected_clear_error = field(field(field(&frozen, "cases"), "clear"), "error");
    assert_eq!(
        clear_error.code,
        utf16(field(expected_clear_error, "code"))
            .to_utf8()
            .unwrap()
    );
    assert_eq!(
        clear_error.message,
        utf16(field(expected_clear_error, "message"))
    );
    assert_eq!(clear_error.path, utf16(field(expected_clear_error, "path")));
    let bad_identity = parse(r#"{"module":"","element":"e"}"#);
    let bad_identity_error = umf_core::core_semantic_types::inspect_core_semantic_types(
        &parse(r#"{"umf":"bad"}"#),
        &bad_identity,
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    frozen_error(
        &frozen,
        "invalid_identity_precedes_document",
        &bad_identity_error,
    );
    let bad_types = parse(r#"[{"vocabulary":"","version":"1","term":"x"}]"#);
    let bad_request_error = umf_core::core_semantic_types::declare_core_semantic_types(
        &parse(r#"{"umf":"bad"}"#),
        &id,
        &bad_types,
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    frozen_error(
        &frozen,
        "invalid_reference_precedes_document",
        &bad_request_error,
    );
    let mut old_core = missing.clone();
    set(&mut old_core, "umf", Value::string_utf8("0.9.0"));
    let old_inspect_error = umf_core::core_semantic_types::inspect_core_semantic_types(
        &old_core,
        &id,
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    frozen_error(&frozen, "old_version_inspect_refusal", &old_inspect_error);
    let old_get_error = umf_core::core_semantic_types::get_core_semantic_types(
        &old_core,
        &id,
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    frozen_error(&frozen, "old_version_get_refusal", &old_get_error);
    let old_declare_error = umf_core::core_semantic_types::declare_core_semantic_types(
        &old_core,
        &id,
        &types,
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    frozen_error(&frozen, "old_version_declare_refusal", &old_declare_error);
}

#[test]
fn staged_verify_rejects_receipt_before_admitting_current() {
    let engine = engine();
    let mut setup = Context::ordinary();
    let registry = engine.registry(&mut setup).unwrap();
    let mut caps = NoCapabilities;
    let touched = std::cell::Cell::new(false);
    let error = umf_core::core_semantic_types::verify_core_semantic_type_declaration_with_current(
        &Value::Null,
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
        |_| {
            touched.set(true);
            Ok(Value::Null)
        },
    )
    .unwrap_err();
    assert_eq!(error.code, "SEMANTIC_TYPE_RECEIPT");
    assert!(!touched.get(), "current admission must follow receipt validation");
}

#[test]
fn semantic_type_operations_honor_invocation_work_and_cancellation_controls() {
    let engine = engine();
    let registry = Registry::new();
    let mut caps = NoCapabilities;
    let (doc, id, _) = inputs();
    let mut meter = |_: usize| {
        Err(umf_core::EngineError::new(
            "METER_STOP",
            Utf16::default(),
            "meter stop",
        ))
    };
    let mut metered = Context::ordinary().with_meter(&mut meter);
    let work_error = umf_core::core_semantic_types::inspect_core_semantic_types(
        &doc,
        &id,
        &engine,
        &registry,
        &mut caps,
        &mut metered,
    )
    .unwrap_err();
    assert_eq!(work_error.code, "METER_STOP");
    let mut cancel = || true;
    let mut cancelled = Context::ordinary().with_cancellation(&mut cancel);
    let cancel_error = umf_core::core_semantic_types::inspect_core_semantic_types(
        &doc,
        &id,
        &engine,
        &registry,
        &mut caps,
        &mut cancelled,
    )
    .unwrap_err();
    assert_eq!(cancel_error.code, "CANCELLED");
    assert!(cancel_error.is_control_failure());
}

#[test]
fn semantic_type_registry_matches_frozen_data_only_predecessor() {
    use umf_core::core_semantic_types::SemanticTypeRegistry;
    let frozen = registry_packet();
    let cases = field(&frozen, "outcomes");
    let reference = parse(r#"{"vocabulary":"example.contact","version":"1.0.0","term":"email"}"#);
    let mut registry = SemanticTypeRegistry::default();
    let mut definition = parse(r#"{"nested":{"label":"original"}}"#);
    registry
        .register(&reference, &definition, &mut Context::ordinary())
        .unwrap();
    set(
        get_mut(&mut definition, "nested"),
        "label",
        Value::string_utf8("caller mutation"),
    );
    let first = registry
        .lookup(&reference, &mut Context::ordinary())
        .unwrap()
        .unwrap();
    equal(&first, &parse(r#"{"nested":{"label":"original"}}"#));
    let mut changed_copy = first;
    set(
        get_mut(&mut changed_copy, "nested"),
        "label",
        Value::string_utf8("lookup mutation"),
    );
    equal(
        &registry
            .lookup(&reference, &mut Context::ordinary())
            .unwrap()
            .unwrap(),
        &parse(r#"{"nested":{"label":"original"}}"#),
    );

    let second_version =
        parse(r#"{"vocabulary":"example.contact","version":"2.0.0","term":"email"}"#);
    registry
        .register(
            &second_version,
            &parse(r#"{"owner":"b"}"#),
            &mut Context::ordinary(),
        )
        .unwrap();
    equal(
        &registry
            .lookup(&reference, &mut Context::ordinary())
            .unwrap()
            .unwrap(),
        &parse(r#"{"nested":{"label":"original"}}"#),
    );
    equal(
        &registry
            .lookup(&second_version, &mut Context::ordinary())
            .unwrap()
            .unwrap(),
        &parse(r#"{"owner":"b"}"#),
    );

    let mut error_registry = SemanticTypeRegistry::default();
    let malformed_ref = parse(r#"{"vocabulary":"","version":"1.0.0","term":"email"}"#);
    let err = error_registry
        .register(&malformed_ref, &parse("{}"), &mut Context::ordinary())
        .unwrap_err();
    assert_eq!(err.code, "SEMANTIC_TYPE_STRUCTURE");
    let expected = field(field(cases, "malformed_reference"), "error");
    assert_eq!(err.code, utf16(field(expected, "code")).to_utf8().unwrap());
    assert_eq!(err.message, utf16(field(expected, "message")));
    let array_definition = parse("[]");
    let err = error_registry
        .register(&reference, &array_definition, &mut Context::ordinary())
        .unwrap_err();
    let expected = field(field(cases, "malformed_definition"), "error");
    assert_eq!(err.code, utf16(field(expected, "code")).to_utf8().unwrap());
    assert_eq!(err.message, utf16(field(expected, "message")));
    let extra_ref =
        parse(r#"{"vocabulary":"example.contact","version":"1.0.0","term":"email","future":true}"#);
    let err = error_registry
        .register(&extra_ref, &parse("{}"), &mut Context::ordinary())
        .unwrap_err();
    let expected = field(field(cases, "unknown_registration_qualifier"), "error");
    assert_eq!(err.code, utf16(field(expected, "code")).to_utf8().unwrap());
    assert_eq!(err.message, utf16(field(expected, "message")));
    let err = registry
        .register(&reference, &parse("{}"), &mut Context::ordinary())
        .unwrap_err();
    let expected = field(field(cases, "duplicate_exact_triple"), "error");
    assert_eq!(err.code, utf16(field(expected, "code")).to_utf8().unwrap());
    assert_eq!(err.message, utf16(field(expected, "message")));
    let unknown_qualifier_lookup = parse(
        r#"{"vocabulary":"example.contact","version":"1.0.0","term":"email","future":{"opaque":true}}"#,
    );
    equal(
        &registry
            .lookup(&unknown_qualifier_lookup, &mut Context::ordinary())
            .unwrap()
            .unwrap(),
        &parse(r#"{"nested":{"label":"original"}}"#),
    );
    let utf16_definition = field(field(&frozen, "caseInputs"), "utf16");
    let utf16_ref = parse(r#"{"vocabulary":"example.contact","version":"1.0.0","term":"utf16"}"#);
    let mut utf16_registry = SemanticTypeRegistry::default();
    utf16_registry
        .register(&utf16_ref, utf16_definition, &mut Context::ordinary())
        .unwrap();
    equal(
        &utf16_registry
            .lookup(&utf16_ref, &mut Context::ordinary())
            .unwrap()
            .unwrap(),
        utf16_definition,
    );
}

#[test]
fn semantic_type_registry_uses_shared_meter_cancellation_and_deadline() {
    use umf_core::core_semantic_types::SemanticTypeRegistry;
    let reference = parse(r#"{"vocabulary":"example.contact","version":"1.0.0","term":"email"}"#);
    let definition = parse(r#"{"nested":{"label":"value"}}"#);
    let mut registry = SemanticTypeRegistry::default();
    let mut meter = |_: usize| {
        Err(umf_core::EngineError::new(
            "METER_STOP",
            Utf16::default(),
            "meter stop",
        ))
    };
    let error = registry
        .register(
            &reference,
            &definition,
            &mut Context::ordinary().with_meter(&mut meter),
        )
        .unwrap_err();
    assert_eq!(error.code, "METER_STOP");

    let mut cancel = || true;
    let error = registry
        .register(
            &reference,
            &definition,
            &mut Context::ordinary().with_cancellation(&mut cancel),
        )
        .unwrap_err();
    assert_eq!(error.code, "CANCELLED");
    assert!(error.is_control_failure());

    let mut clock = || Some(2);
    let error = registry
        .register(
            &reference,
            &definition,
            &mut Context::ordinary().with_clock(&mut clock, 1),
        )
        .unwrap_err();
    assert_eq!(error.code, "DEADLINE");
    assert!(error.is_control_failure());
}

#[derive(Default)]
struct TestSemanticValidators {
    responses: std::collections::HashMap<u64, Result<Value, umf_core::CapabilityError>>,
    calls: Vec<(u64, Value, Value)>,
}
impl umf_core::core_semantic_types::SemanticTypeValidator for TestSemanticValidators {
    fn validate(
        &mut self,
        token: u64,
        value: &Value,
        definition: &Value,
        _: &mut Context<'_>,
    ) -> Result<Value, umf_core::CapabilityError> {
        self.calls.push((token, value.clone(), definition.clone()));
        self.responses.remove(&token).unwrap_or_else(|| {
            Err(umf_core::CapabilityError::Host(Utf16::from(
                "trusted validator token is missing",
            )))
        })
    }
}

fn check_response(status: &str, complete: bool, issues: &[&str]) -> Value {
    parse(&format!(
        "{{\"status\":\"{status}\",\"complete\":{complete},\"issues\":[{}]}}",
        issues
            .iter()
            .map(|issue| serde_json::to_string(issue).unwrap())
            .collect::<Vec<_>>()
            .join(",")
    ))
}

#[test]
fn semantic_value_check_replays_frozen_typescript_registry_outcomes() {
    use umf_core::core_semantic_types::{validate_semantic_type_value, SemanticTypeRegistry};
    let packet = value_packet();
    let expected = field(field(&packet, "cases"), "direct");
    let refs = [
        ("valid", 1),
        ("invalid", 2),
        ("throws", 3),
        ("throws-empty", 4),
        ("malformed", 5),
        ("extra", 6),
        ("unknown-complete", 7),
        ("isolation", 8),
        ("throws-utf16", 9),
    ];
    let mut registry = SemanticTypeRegistry::default();
    for (term, token) in refs {
        registry
            .register_with_validator(
                &parse(&format!(
                    r#"{{"vocabulary":"example.contact","version":"1.0.0","term":"{term}"}}"#
                )),
                &if term == "isolation" {
                    parse(r#"{"nested":{"name":"before"}}"#)
                } else {
                    parse(&format!(r#"{{"definitionToken":{token}}}"#))
                },
                token,
                &mut Context::ordinary(),
            )
            .unwrap();
    }
    registry
        .register(
            &parse(r#"{"vocabulary":"example.contact","version":"1.0.0","term":"no-validator"}"#),
            &parse("{}"),
            &mut Context::ordinary(),
        )
        .unwrap();
    let mut validators = TestSemanticValidators::default();
    for (token, response) in [
        (1, check_response("valid", true, &[])),
        (2, check_response("invalid", true, &["bad"])),
        (
            6,
            parse(r#"{"status":"valid","complete":true,"issues":[],"future":true}"#),
        ),
        (7, check_response("unknown", true, &["uncertain"])),
        (8, check_response("valid", true, &[])),
    ] {
        validators.responses.insert(token, Ok(response));
    }
    validators.responses.insert(
        3,
        Err(umf_core::CapabilityError::Host(Utf16::from(
            "validator broke",
        ))),
    );
    validators.responses.insert(
        5,
        Err(umf_core::CapabilityError::Host(Utf16::from(
            "Value is not JSON-compatible",
        ))),
    );
    validators
        .responses
        .insert(4, Err(umf_core::CapabilityError::Host(Utf16::default())));
    validators.responses.insert(
        9,
        Err(umf_core::CapabilityError::Host(Utf16::new(vec![
            b'b' as u16,
            b'a' as u16,
            b'd' as u16,
            b' ' as u16,
            0xd800,
        ]))),
    );
    let mut direct_values = vec![
        (
            "valid",
            parse("null"),
            parse(r#"{"vocabulary":"example.contact","version":"1.0.0","term":"valid"}"#),
        ),
        (
            "invalid",
            parse(r#""x""#),
            parse(r#"{"vocabulary":"example.contact","version":"1.0.0","term":"invalid"}"#),
        ),
        (
            "unknown_missing_term",
            parse("null"),
            parse(r#"{"vocabulary":"example.contact","version":"1.0.0","term":"absent"}"#),
        ),
        (
            "unknown_missing_validator",
            parse("null"),
            parse(r#"{"vocabulary":"example.contact","version":"1.0.0","term":"no-validator"}"#),
        ),
        (
            "unknown_qualifier",
            parse("null"),
            parse(
                r#"{"vocabulary":"example.contact","version":"1.0.0","term":"valid","future":{"kept":true}}"#,
            ),
        ),
        (
            "throw_error",
            parse(r#""x""#),
            parse(r#"{"vocabulary":"example.contact","version":"1.0.0","term":"throws"}"#),
        ),
        (
            "throw_empty_error",
            parse(r#""x""#),
            parse(r#"{"vocabulary":"example.contact","version":"1.0.0","term":"throws-empty"}"#),
        ),
        (
            "throw_utf16_error",
            parse(r#""x""#),
            parse(r#"{"vocabulary":"example.contact","version":"1.0.0","term":"throws-utf16"}"#),
        ),
        (
            "malformed_non_json_return",
            parse(r#""x""#),
            parse(r#"{"vocabulary":"example.contact","version":"1.0.0","term":"malformed"}"#),
        ),
        (
            "malformed_extra_field",
            parse(r#""x""#),
            parse(r#"{"vocabulary":"example.contact","version":"1.0.0","term":"extra"}"#),
        ),
        (
            "malformed_unknown_complete",
            parse(r#""x""#),
            parse(
                r#"{"vocabulary":"example.contact","version":"1.0.0","term":"unknown-complete"}"#,
            ),
        ),
        (
            "input_definition_isolation",
            parse(r#"{"nested":{"name":"value"}}"#),
            parse(r#"{"vocabulary":"example.contact","version":"1.0.0","term":"isolation"}"#),
        ),
    ];
    for (name, value, reference) in direct_values.drain(..) {
        let result = validate_semantic_type_value(
            &reference,
            &value,
            &registry,
            &mut validators,
            &mut Context::ordinary(),
        )
        .unwrap();
        equal(&result, field(field(expected, name), "value"));
    }
    assert_eq!(
        validators.calls.first().map(|call| call.1.clone()),
        Some(Value::Null),
        "null reaches validator unchanged"
    );
    assert_eq!(
        validators
            .calls
            .iter()
            .map(|call| call.0)
            .collect::<Vec<_>>(),
        vec![1, 2, 3, 4, 9, 5, 6, 7, 8],
        "only explicit exact-token checks invoke validators"
    );
    equal(
        &registry
            .lookup(
                &parse(r#"{"vocabulary":"example.contact","version":"1.0.0","term":"isolation"}"#),
                &mut Context::ordinary(),
            )
            .unwrap()
            .unwrap(),
        field(expected, "lookup_after_callback"),
    );
}

#[test]
fn semantic_core_value_aggregate_replays_frozen_order_and_precedence() {
    use umf_core::core_semantic_types::{validate_core_semantic_type_value, SemanticTypeRegistry};
    let packet = value_packet();
    let expected = field(field(&packet, "cases"), "aggregate");
    let order = field(field(expected, "order_and_invalid_dominates"), "value");
    let source = field(order, "source");
    let identity = field(order, "identity");
    let mut registry = SemanticTypeRegistry::default();
    for (term, token) in [("one", 1), ("two", 2), ("three", 3)] {
        registry
            .register_with_validator(
                &parse(&format!(
                    r#"{{"vocabulary":"example.contact","version":"1.0.0","term":"{term}"}}"#
                )),
                &parse("{}"),
                token,
                &mut Context::ordinary(),
            )
            .unwrap();
    }
    let mut validators = TestSemanticValidators::default();
    validators.responses.extend([
        (1, Ok(check_response("valid", true, &["one-valid"]))),
        (2, Ok(check_response("invalid", true, &["two-invalid"]))),
        (3, Ok(check_response("unknown", false, &["three-unknown"]))),
    ]);
    let engine = engine();
    let document_registry = Registry::new();
    let mut caps = NoCapabilities;
    let actual = validate_core_semantic_type_value(
        source,
        identity,
        &parse("null"),
        &registry,
        &mut validators,
        &engine,
        &document_registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    equal(
        &actual,
        field(field(expected, "order_and_invalid_dominates"), "value"),
    );
    assert_eq!(
        validators
            .calls
            .iter()
            .map(|call| call.0)
            .collect::<Vec<_>>(),
        vec![1, 2, 3],
        "declared references are invoked in array order"
    );
}

#[test]
fn semantic_core_value_aggregate_covers_absence_unknown_and_validation_precedence() {
    use umf_core::core_semantic_types::{validate_core_semantic_type_value, SemanticTypeRegistry};
    let packet = value_packet();
    let expected = field(field(&packet, "cases"), "aggregate");
    let engine = engine();
    let document_registry = Registry::new();
    let mut caps = NoCapabilities;
    let identity = field(
        field(field(expected, "absent_declaration"), "value"),
        "identity",
    );
    let missing_source = field(
        field(field(expected, "absent_declaration"), "value"),
        "source",
    );
    let empty_registry = SemanticTypeRegistry::default();
    let mut no_callbacks = TestSemanticValidators::default();
    let absent = validate_core_semantic_type_value(
        missing_source,
        identity,
        &parse("null"),
        &empty_registry,
        &mut no_callbacks,
        &engine,
        &document_registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    equal(
        &absent,
        field(field(expected, "absent_declaration"), "value"),
    );

    let unknown_case = field(field(expected, "unknown_dominates_valid"), "value");
    let unknown_source = field(unknown_case, "source");
    let mut one_registry = SemanticTypeRegistry::default();
    one_registry
        .register_with_validator(
            &parse(r#"{"vocabulary":"example.contact","version":"1.0.0","term":"one"}"#),
            &parse("{}"),
            1,
            &mut Context::ordinary(),
        )
        .unwrap();
    let mut one_validator = TestSemanticValidators::default();
    one_validator
        .responses
        .insert(1, Ok(check_response("valid", true, &[])));
    let unknown = validate_core_semantic_type_value(
        unknown_source,
        field(unknown_case, "identity"),
        &parse(r#""x""#),
        &one_registry,
        &mut one_validator,
        &engine,
        &document_registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    equal(&unknown, unknown_case);

    let malformed = make_doc(Some(Vec::new()));
    let mut never_called = TestSemanticValidators::default();
    let refusal = validate_core_semantic_type_value(
        &malformed,
        &parse(r#"{"module":"m","element":"e"}"#),
        &parse("null"),
        &one_registry,
        &mut never_called,
        &engine,
        &document_registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    let expected_error = field(
        field(expected, "document_refusal_precedes_callback"),
        "error",
    );
    assert_eq!(
        refusal.code,
        utf16(field(expected_error, "code")).to_utf8().unwrap()
    );
    assert_eq!(refusal.message, utf16(field(expected_error, "message")));
    assert_eq!(refusal.path, utf16(field(expected_error, "path")));
    assert!(never_called.calls.is_empty());
}

#[test]
fn semantic_validator_context_failures_propagate_as_operation_errors() {
    use std::cell::Cell;
    use umf_core::core_semantic_types::{
        validate_semantic_type_value, SemanticTypeRegistry, SemanticTypeValidator,
    };
    let reference =
        parse(r#"{"vocabulary":"example.contact","version":"1.0.0","term":"controlled"}"#);
    let mut registry = SemanticTypeRegistry::default();
    registry
        .register_with_validator(&reference, &parse("{}"), 1, &mut Context::ordinary())
        .unwrap();

    struct MeterFailure<'a>(&'a Cell<bool>);
    impl SemanticTypeValidator for MeterFailure<'_> {
        fn validate(
            &mut self,
            _: u64,
            _: &Value,
            _: &Value,
            ctx: &mut Context<'_>,
        ) -> Result<Value, umf_core::CapabilityError> {
            self.0.set(true);
            ctx.charge_work(1, Utf16::default())
                .map_err(umf_core::CapabilityError::Engine)?;
            Ok(check_response("valid", true, &[]))
        }
    }
    let fail_meter = Cell::new(false);
    let mut meter = |_: usize| {
        if fail_meter.get() {
            Err(umf_core::EngineError::new(
                "METER_STOP",
                Utf16::default(),
                "meter stop",
            ))
        } else {
            Ok(())
        }
    };
    let error = validate_semantic_type_value(
        &reference,
        &parse("null"),
        &registry,
        &mut MeterFailure(&fail_meter),
        &mut Context::ordinary().with_meter(&mut meter),
    )
    .unwrap_err();
    assert_eq!(error.code, "METER_STOP");
    assert!(error.is_control_failure());

    struct CancelFailure<'a>(&'a Cell<bool>);
    impl SemanticTypeValidator for CancelFailure<'_> {
        fn validate(
            &mut self,
            _: u64,
            _: &Value,
            _: &Value,
            ctx: &mut Context<'_>,
        ) -> Result<Value, umf_core::CapabilityError> {
            self.0.set(true);
            ctx.check_cancelled(Utf16::default())
                .map_err(umf_core::CapabilityError::Engine)?;
            Ok(check_response("valid", true, &[]))
        }
    }
    let cancelled = Cell::new(false);
    let mut cancel = || cancelled.get();
    let error = validate_semantic_type_value(
        &reference,
        &parse("null"),
        &registry,
        &mut CancelFailure(&cancelled),
        &mut Context::ordinary().with_cancellation(&mut cancel),
    )
    .unwrap_err();
    assert_eq!(error.code, "CANCELLED");
    assert!(error.is_control_failure());

    struct DeadlineFailure<'a>(&'a Cell<u64>);
    impl SemanticTypeValidator for DeadlineFailure<'_> {
        fn validate(
            &mut self,
            _: u64,
            _: &Value,
            _: &Value,
            ctx: &mut Context<'_>,
        ) -> Result<Value, umf_core::CapabilityError> {
            self.0.set(2);
            ctx.check_deadline(Utf16::default())
                .map_err(umf_core::CapabilityError::Engine)?;
            Ok(check_response("valid", true, &[]))
        }
    }
    let now = Cell::new(0);
    let mut clock = || Some(now.get());
    let error = validate_semantic_type_value(
        &reference,
        &parse("null"),
        &registry,
        &mut DeadlineFailure(&now),
        &mut Context::ordinary().with_clock(&mut clock, 1),
    )
    .unwrap_err();
    assert_eq!(error.code, "DEADLINE");
    assert!(error.is_control_failure());
}

#[test]
fn semantic_validator_large_failure_message_is_charged_before_result_construction() {
    use std::cell::Cell;
    use umf_core::core_semantic_types::{validate_semantic_type_value, SemanticTypeRegistry};
    let reference =
        parse(r#"{"vocabulary":"example.contact","version":"1.0.0","term":"large-error"}"#);
    let mut registry = SemanticTypeRegistry::default();
    registry
        .register_with_validator(&reference, &parse("{}"), 1, &mut Context::ordinary())
        .unwrap();

    struct LargeFailure<'a>(&'a Cell<bool>);
    impl umf_core::core_semantic_types::SemanticTypeValidator for LargeFailure<'_> {
        fn validate(
            &mut self,
            _: u64,
            _: &Value,
            _: &Value,
            _: &mut Context<'_>,
        ) -> Result<Value, umf_core::CapabilityError> {
            self.0.set(true);
            Err(umf_core::CapabilityError::Host(Utf16::new(vec![
                120;
                100_000
            ])))
        }
    }

    let called = Cell::new(false);
    let mut charged = 0usize;
    let mut meter = |amount: usize| {
        charged = charged.saturating_add(amount);
        if amount > 50_000 {
            Err(umf_core::EngineError::new(
                "LARGE_MESSAGE_METER",
                Utf16::default(),
                "large validator error charge rejected",
            ))
        } else {
            Ok(())
        }
    };
    let error = validate_semantic_type_value(
        &reference,
        &parse("null"),
        &registry,
        &mut LargeFailure(&called),
        &mut Context::ordinary().with_meter(&mut meter),
    )
    .unwrap_err();
    assert!(called.get());
    assert!(charged > 0);
    assert_eq!(error.code, "LARGE_MESSAGE_METER");
}

#[test]
fn semantic_validator_large_issue_copy_is_metered_before_cloning() {
    use std::cell::Cell;
    use umf_core::core_semantic_types::{validate_semantic_type_value, SemanticTypeRegistry};
    let reference =
        parse(r#"{"vocabulary":"example.contact","version":"1.0.0","term":"large-issue"}"#);
    let mut registry = SemanticTypeRegistry::default();
    registry
        .register_with_validator(&reference, &parse("{}"), 1, &mut Context::ordinary())
        .unwrap();

    struct LargeIssue;
    impl umf_core::core_semantic_types::SemanticTypeValidator for LargeIssue {
        fn validate(
            &mut self,
            _: u64,
            _: &Value,
            _: &Value,
            _: &mut Context<'_>,
        ) -> Result<Value, umf_core::CapabilityError> {
            Ok(json_object(vec![
                ("status", json_string("invalid")),
                ("complete", Value::Bool(true)),
                (
                    "issues",
                    Value::Array(vec![Value::String(Utf16::new(vec![120; 100_000]))]),
                ),
            ]))
        }
    }

    let issue_charges = Cell::new(0usize);
    let mut meter = |amount: usize| {
        if amount == 100_000 {
            let seen = issue_charges.get() + 1;
            issue_charges.set(seen);
            if seen == 2 {
                return Err(umf_core::EngineError::new(
                    "LARGE_ISSUE_METER",
                    Utf16::default(),
                    "large validator issue copy rejected",
                ));
            }
        }
        Ok(())
    };
    let error = validate_semantic_type_value(
        &reference,
        &parse("null"),
        &registry,
        &mut LargeIssue,
        &mut Context::ordinary().with_meter(&mut meter),
    )
    .unwrap_err();
    assert_eq!(error.code, "LARGE_ISSUE_METER");
    assert_eq!(issue_charges.get(), 2);
}

fn make_doc(references: Option<Vec<Value>>) -> Value {
    let mut element = json_object(vec![
        ("id", json_string("e")),
        ("kind", json_string("field")),
        ("scalarType", json_string("string")),
        ("extensions", Value::Object(Vec::new())),
    ]);
    if let Some(references) = references {
        set(&mut element, "semanticTypes", Value::Array(references));
    }
    json_object(vec![
        ("umf", json_string("0.10.0")),
        ("id", json_string("semantic-value-freeze")),
        ("vocabularies", Value::Object(Vec::new())),
        (
            "modules",
            Value::Array(vec![json_object(vec![
                ("id", json_string("m")),
                ("namespace", json_string("https://example.test")),
                ("elements", Value::Array(vec![element])),
            ])]),
        ),
    ])
}

fn json_string(value: &str) -> Value {
    Value::string_utf8(value)
}

fn json_object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (Utf16::from(name), value))
            .collect(),
    )
}

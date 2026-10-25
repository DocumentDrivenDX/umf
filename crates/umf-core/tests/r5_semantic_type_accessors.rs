// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    context::Context,
    error::{Diagnostic, Severity},
    semantic_type_accessors::{
        get_semantic_types, set_semantic_types, validate_semantic_types_document,
    },
    serialization::{read_json_value, Format},
    Engine, ResourceSet, Utf16, Value,
};

const PACKET: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-semantic-type-accessors/frozen-typescript.json");

fn parse(source: &str) -> Value {
    read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
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
fn field<'a>(value: &'a Value, name: &str) -> &'a Value {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value)
            .unwrap(),
        _ => panic!("object expected"),
    }
}
fn field_mut<'a>(value: &'a mut Value, name: &str) -> &'a mut Value {
    match value {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value)
            .unwrap(),
        _ => panic!("object expected"),
    }
}
fn string(value: &Value) -> String {
    match value {
        Value::String(value) => value.to_utf8().unwrap(),
        _ => panic!("string expected"),
    }
}
fn packet() -> Value {
    parse(PACKET)
}
fn case(name: &str) -> Value {
    field(field(&packet(), "caseInputs"), name).clone()
}
fn outcome(name: &str) -> Value {
    field(field(&packet(), "outcomes"), name).clone()
}
fn expected_value(name: &str) -> Value {
    field(&outcome(name), "value").clone()
}
fn assert_error(error: &umf_core::EngineError, case_name: &str) {
    let result = outcome(case_name);
    let expected_error = field(&result, "error");
    let expected = field(expected_error, "code");
    assert_eq!(error.code, string(expected));
    assert_eq!(error.message, field(expected_error, "message").as_text());
    assert_eq!(error.path, field(expected_error, "path").as_text());
}

trait AsText {
    fn as_text(&self) -> Utf16;
}
impl AsText for Value {
    fn as_text(&self) -> Utf16 {
        match self {
            Value::String(value) => value.clone(),
            _ => panic!("string expected"),
        }
    }
}

fn diagnostic_value(diagnostic: &Diagnostic) -> Value {
    Value::Object(vec![
        (Utf16::from("code"), Value::String(diagnostic.code.clone())),
        (Utf16::from("path"), Value::String(diagnostic.path.clone())),
        (
            Utf16::from("message"),
            Value::String(diagnostic.message.clone()),
        ),
        (
            Utf16::from("severity"),
            Value::string_utf8(match diagnostic.severity {
                Severity::Error => "error",
                Severity::Warning => "warning",
            }),
        ),
    ])
}
fn validation_value(valid: bool, complete: bool, diagnostics: &[Diagnostic]) -> Value {
    Value::Object(vec![
        (Utf16::from("valid"), Value::Bool(valid)),
        (Utf16::from("complete"), Value::Bool(complete)),
        (
            Utf16::from("diagnostics"),
            Value::Array(diagnostics.iter().map(diagnostic_value).collect()),
        ),
    ])
}
fn remove_member(value: &mut Value, name: &str) {
    if let Value::Object(fields) = value {
        fields.retain(|(key, _)| key != &Utf16::from(name));
    }
}
fn mutate_term(annotation: &mut Value, term: &str) {
    let types = match annotation {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(name, _)| name == &Utf16::from("types"))
            .map(|(_, value)| value)
            .unwrap(),
        _ => panic!("object expected"),
    };
    let first = match types {
        Value::Array(values) => &mut values[0],
        _ => panic!("array expected"),
    };
    if let Value::Object(fields) = first {
        fields
            .iter_mut()
            .find(|(name, _)| name == &Utf16::from("term"))
            .map(|(_, value)| *value = Value::string_utf8(term))
            .unwrap();
    }
}

#[test]
fn retained_extension_get_and_set_replay_frozen_predecessor() {
    let engine = engine();
    let source = case("document");
    let get = get_semantic_types(&source, "m", "e", &engine, &mut Context::ordinary()).unwrap();
    assert_eq!(
        get,
        field(&expected_value("get_copy_success"), "again").clone()
    );
    let mut returned = get;
    if let Value::Object(ref mut annotation) = returned {
        if let Some((_, Value::Array(types))) = annotation
            .iter_mut()
            .find(|(name, _)| name == &Utf16::from("types"))
        {
            if let Value::Object(reference) = &mut types[0] {
                if let Some((_, Value::String(term))) = reference
                    .iter_mut()
                    .find(|(name, _)| name == &Utf16::from("term"))
                {
                    *term = Utf16::from("caller mutation");
                }
            }
        }
    }
    assert_eq!(
        get_semantic_types(&source, "m", "e", &engine, &mut Context::ordinary()).unwrap(),
        field(&expected_value("get_copy_success"), "again").clone()
    );

    let set_outcome = expected_value("set_copy_on_write");
    let mut annotation = parse(
        r#"{"types":[{"vocabulary":"example.contact","version":"1.0.0","term":"phone"}],"future":{"kept":true}}"#,
    );
    let actual = set_semantic_types(
        &source,
        "m",
        "e",
        &annotation,
        &engine,
        &mut Context::ordinary(),
    )
    .unwrap();
    mutate_term(&mut annotation, "outside mutation");
    assert_eq!(source, field(&set_outcome, "source").clone());
    assert_eq!(
        get_semantic_types(&actual, "m", "e", &engine, &mut Context::ordinary()).unwrap(),
        field(&set_outcome, "result").clone()
    );
    assert_eq!(
        get_semantic_types(&source, "m", "e", &engine, &mut Context::ordinary()).unwrap(),
        field(&expected_value("get_copy_success"), "again").clone()
    );

    let mut no_profile = source.clone();
    if let Value::Object(fields) = &mut no_profile {
        let vocabularies = fields
            .iter_mut()
            .find(|(name, _)| name == &Utf16::from("vocabularies"))
            .map(|(_, value)| value)
            .unwrap();
        remove_member(vocabularies, "umf.semantic-types");
    }
    let created = set_semantic_types(
        &no_profile,
        "m",
        "e",
        &parse(r#"{"types":[{"vocabulary":"example.contact","version":"1.0.0","term":"email"}]}"#),
        &engine,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(
        field(&expected_value("set_adds_profile"), "profile").clone(),
        field(field(&created, "vocabularies"), "umf.semantic-types").clone()
    );
}

#[test]
fn retained_extension_accessors_preserve_error_precedence() {
    let engine = engine();
    let source = case("document");
    let mut wrong_profile = source.clone();
    let vocabularies = match wrong_profile {
        Value::Object(ref mut root) => root
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("vocabularies"))
            .map(|(_, value)| value)
            .unwrap(),
        _ => unreachable!(),
    };
    let profile = match vocabularies {
        Value::Object(values) => values
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("umf.semantic-types"))
            .map(|(_, value)| value)
            .unwrap(),
        _ => unreachable!(),
    };
    if let Value::Object(values) = profile {
        values[0].1 = Value::string_utf8("2.0.0");
    }
    let get_error = get_semantic_types(&wrong_profile, "m", "e", &engine, &mut Context::ordinary())
        .unwrap_err();
    assert_error(&get_error, "get_wrong_profile");

    let mut missing_profile_doc = source.clone();
    if let Value::Object(fields) = &mut missing_profile_doc {
        let vocabularies = fields
            .iter_mut()
            .find(|(name, _)| name == &Utf16::from("vocabularies"))
            .map(|(_, value)| value)
            .unwrap();
        remove_member(vocabularies, "umf.semantic-types");
    }
    let error = get_semantic_types(
        &missing_profile_doc,
        "m",
        "e",
        &engine,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_error(&error, "get_missing_profile");

    let mut missing_annotation_doc = source.clone();
    if let Value::Object(fields) = &mut missing_annotation_doc {
        let modules = fields
            .iter_mut()
            .find(|(name, _)| name == &Utf16::from("modules"))
            .map(|(_, value)| value)
            .unwrap();
        if let Value::Array(modules) = modules {
            let elements = match &mut modules[0] {
                Value::Object(fields) => fields
                    .iter_mut()
                    .find(|(name, _)| name == &Utf16::from("elements"))
                    .map(|(_, value)| value)
                    .unwrap(),
                _ => unreachable!(),
            };
            if let Value::Array(elements) = elements {
                let extensions = match &mut elements[0] {
                    Value::Object(fields) => fields
                        .iter_mut()
                        .find(|(name, _)| name == &Utf16::from("extensions"))
                        .map(|(_, value)| value)
                        .unwrap(),
                    _ => unreachable!(),
                };
                remove_member(extensions, "umf.semantic-types");
            }
        }
    }
    let error = get_semantic_types(
        &missing_annotation_doc,
        "m",
        "e",
        &engine,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_error(&error, "get_missing_annotation");

    let invalid = parse(r#"{"types":[]}"#);
    let mut invalid_source = source.clone();
    if let Value::Array(modules) = field_mut(&mut invalid_source, "modules") {
        if let Value::Array(elements) = field_mut(&mut modules[0], "elements") {
            *field_mut(
                field_mut(&mut elements[0], "extensions"),
                "umf.semantic-types",
            ) = invalid.clone();
        }
    }
    let get_error =
        get_semantic_types(&invalid_source, "m", "e", &engine, &mut Context::ordinary())
            .unwrap_err();
    assert_error(&get_error, "get_invalid_payload");
    let set_error = set_semantic_types(
        &source,
        "m",
        "e",
        &invalid,
        &engine,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_error(&set_error, "set_invalid_annotation");
    let precedence = set_semantic_types(
        &wrong_profile,
        "m",
        "absent",
        &parse(r#"{"types":[{"vocabulary":"example.contact","version":"1.0.0","term":"email"}]}"#),
        &engine,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_error(&precedence, "set_wrong_profile_precedes_missing_element");
    let missing =
        get_semantic_types(&source, "m", "absent", &engine, &mut Context::ordinary()).unwrap_err();
    assert_error(&missing, "get_missing_element");
    let missing_set = set_semantic_types(
        &source,
        "m",
        "absent",
        &parse(r#"{"types":[{"vocabulary":"example.contact","version":"1.0.0","term":"email"}]}"#),
        &engine,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_error(&missing_set, "set_missing_element");
}

#[test]
fn retained_extension_unknown_content_and_warning_order_match_typescript() {
    let engine = engine();
    let source = case("document");
    let validation = validate_semantic_types_document(
        &case("warningDocument"),
        &engine,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(validation.valid);
    assert_eq!(
        validation_value(true, validation.complete, &validation.diagnostics),
        expected_value("diagnostics_warning_order")
    );

    let annotation = parse(
        r#"{"types":[{"vocabulary":"example.contact","version":"1.0.0","term":"email","future":{"x":1}}],"opaque":{"x":2}}"#,
    );
    let authored = set_semantic_types(
        &source,
        "m",
        "e",
        &annotation,
        &engine,
        &mut Context::ordinary(),
    )
    .unwrap();
    let result =
        get_semantic_types(&authored, "m", "e", &engine, &mut Context::ordinary()).unwrap();
    assert_eq!(
        result,
        field(&expected_value("set_unknown_content"), "annotation").clone()
    );
    let validation =
        validate_semantic_types_document(&authored, &engine, &mut Context::ordinary()).unwrap();
    let diagnostics = Value::Array(
        validation
            .diagnostics
            .iter()
            .map(diagnostic_value)
            .collect(),
    );
    assert_eq!(
        diagnostics,
        field(&expected_value("set_unknown_content"), "diagnostics").clone()
    );
}

#[test]
fn staged_set_admits_annotation_after_profile_and_target_checks() {
    let engine = engine();
    let mut document = case("document");
    let touched = std::cell::Cell::new(false);
    let error = umf_core::semantic_type_accessors::set_semantic_types_units_optional_with_annotation(
        &document,
        &Utf16::from("missing-module"),
        &Utf16::from("missing-element"),
        &engine,
        &mut Context::ordinary(),
        |_| {
            touched.set(true);
            Ok(Some(Value::Null))
        },
    )
    .unwrap_err();
    assert_eq!(error.code, "SEMANTIC_TYPE_PROFILE");
    assert!(!touched.get(), "annotation admission must follow target lookup");
    document = parse(r#"{"umf":"0.10.0","id":"semantic-accessors","vocabularies":{"umf.semantic-types":{"version":"2.0.0"}},"modules":[{"id":"m","namespace":"https://example.test","elements":[{"id":"e","extensions":{}}]}]}"#);
    let touched_wrong_profile = std::cell::Cell::new(false);
    let error = umf_core::semantic_type_accessors::set_semantic_types_units_optional_with_annotation(
        &document,
        &Utf16::from("missing-module"),
        &Utf16::from("missing-element"),
        &engine,
        &mut Context::ordinary(),
        |_| {
            touched_wrong_profile.set(true);
            Ok(Some(Value::Null))
        },
    )
    .unwrap_err();
    assert_eq!(error.code, "SEMANTIC_TYPE_PROFILE");
    assert_eq!(error.message, Utf16::from("Cannot overwrite a different semantic type profile"));
    assert!(!touched_wrong_profile.get());
}

#[test]
fn retained_extension_validation_observes_shared_context_controls() {
    use std::cell::Cell;
    let engine = engine();
    let source = case("document");
    let mut meter = |_: usize| {
        Err(umf_core::EngineError::new(
            "ACCESSOR_METER",
            Utf16::default(),
            "stop",
        ))
    };
    let error = get_semantic_types(
        &source,
        "m",
        "e",
        &engine,
        &mut Context::ordinary().with_meter(&mut meter),
    )
    .unwrap_err();
    assert_eq!(error.code, "ACCESSOR_METER");

    let cancelled = Cell::new(true);
    let mut cancellation = || cancelled.get();
    let error = set_semantic_types(
        &source,
        "m",
        "e",
        &parse(r#"{"types":[{"vocabulary":"x","version":"1","term":"t"}]}"#),
        &engine,
        &mut Context::ordinary().with_cancellation(&mut cancellation),
    )
    .unwrap_err();
    assert_eq!(error.code, "CANCELLED");

    let now = Cell::new(2u64);
    let mut clock = || Some(now.get());
    let error = get_semantic_types(
        &source,
        "m",
        "e",
        &engine,
        &mut Context::ordinary().with_clock(&mut clock, 1),
    )
    .unwrap_err();
    assert_eq!(error.code, "DEADLINE");
    assert!(error.is_control_failure());
}

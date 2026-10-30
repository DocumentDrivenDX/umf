// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    edit_extension::edit_extension,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    Context, Diagnostic, EngineError, Registry, Utf16, Value,
};

fn parse(source: &str) -> Value {
    umf_core::serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        umf_core::serialization::Format::Json,
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
fn source() -> Value {
    get(&fixture(), "source").unwrap().clone()
}
fn fixture() -> Value {
    parse(include_str!(
        "../../../tests/rust-core/fixtures/r5/edit-extension/frozen.json"
    ))
}
struct Callback {
    calls: usize,
    labels: Vec<String>,
}
impl Capabilities for Callback {
    fn validate_extension(
        &mut self,
        _: u64,
        payload: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        self.calls += 1;
        if let Some(Value::String(label)) = get(payload, "label") {
            self.labels.push(label.to_utf8().unwrap());
        }
        Ok(Vec::new())
    }
}
fn registry(engine: &Engine) -> Registry {
    let mut registry = Registry::new();
    let resources = engine
        .schema_resources_with_context(&mut Context::catalog())
        .unwrap();
    registry
        .register_extension(
            &Utf16::from("urn:test:note"),
            &Utf16::from("1.0.0"),
            &[Utf16::from("element")],
            &parse(r#"{"type":"object","required":["label"],"properties":{"label":{"type":"string"}},"additionalProperties":true}"#),
            true,
            Some(9),
            engine.package_schema(),
            &resources,
            &mut Context::ordinary(),
        )
        .unwrap();
    registry
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
fn string_array(value: &Value) -> Vec<String> {
    match value {
        Value::Array(items) => items
            .iter()
            .map(|item| match item {
                Value::String(text) => text.to_utf8().unwrap(),
                _ => panic!("expected string"),
            })
            .collect(),
        _ => panic!("expected array"),
    }
}

#[test]
fn updater_runs_once_on_isolated_payload_and_commits_a_valid_candidate() {
    let e = engine();
    let r = registry(&e);
    let frozen = fixture();
    let original = source();
    let mut capabilities = Callback {
        calls: 0,
        labels: Vec::new(),
    };
    let mut updates = 0;
    let result = edit_extension(
        &original,
        &r,
        &"m".into(),
        &"e".into(),
        &"urn:test:note".into(),
        &e,
        &mut capabilities,
        &mut Context::ordinary(),
        |mut payload| {
            updates += 1;
            if let Value::Object(fields) = &mut payload {
                fields.push(("edited".into(), Value::Bool(true)));
            }
            Ok(payload)
        },
    )
    .unwrap();
    assert_eq!(updates, 1);
    assert_eq!(capabilities.calls, 4);
    assert_eq!(
        capabilities.labels,
        string_array(get(&frozen, "validationTrace").unwrap())
    );
    assert_eq!(result, *get(&frozen, "success").unwrap());
    if let Ok(path) = std::env::var("UMF_R5_EDIT_CAPTURE") {
        let emitted = umf_core::serialization::stringify_compact(&result)
            .unwrap()
            .to_utf8()
            .unwrap();
        std::fs::write(path, emitted).unwrap();
    }
    assert_eq!(original, source());
    let modules = match get(&result, "modules").unwrap() {
        Value::Array(v) => v,
        _ => panic!(),
    };
    let elements = match get(&modules[0], "elements").unwrap() {
        Value::Array(v) => v,
        _ => panic!(),
    };
    let extensions = get(&elements[0], "extensions").unwrap();
    assert_eq!(
        get(get(extensions, "urn:test:note").unwrap(), "edited"),
        Some(&Value::Bool(true))
    );
    assert!(get(get(extensions, "urn:test:note").unwrap(), "opaque").is_some());
    let other = match get(&modules[1], "elements").unwrap() {
        Value::Array(v) => v,
        _ => panic!(),
    };
    assert_eq!(
        get(
            get(get(&other[0], "extensions").unwrap(), "urn:test:note").unwrap(),
            "label"
        ),
        Some(&Value::string_utf8("Contact"))
    );
}

#[test]
fn invalid_candidate_is_rejected_after_exactly_one_updater_call() {
    let e = engine();
    let r = registry(&e);
    let frozen = fixture();
    let mut capabilities = Callback {
        calls: 0,
        labels: Vec::new(),
    };
    let mut updates = 0;
    let error = edit_extension(
        &source(),
        &r,
        &"m".into(),
        &"e".into(),
        &"urn:test:note".into(),
        &e,
        &mut capabilities,
        &mut Context::ordinary(),
        |mut payload| {
            updates += 1;
            if let Value::Object(fields) = &mut payload {
                let (_, label) = fields
                    .iter_mut()
                    .find(|(key, _)| key == &Utf16::from("label"))
                    .unwrap();
                *label = Value::Bool(true);
            }
            Ok(payload)
        },
    )
    .unwrap_err();
    assert_eq!(error.code, "INVALID_EDIT");
    assert_eq!(
        error.message.to_utf8().unwrap(),
        get(get(&frozen, "invalidEdit").unwrap(), "message")
            .and_then(|v| if let Value::String(s) = v {
                s.to_utf8().ok()
            } else {
                None
            })
            .unwrap()
    );
    assert_eq!(updates, 1);
    assert_eq!(capabilities.calls, 3);
    assert_eq!(
        capabilities.labels,
        string_array(get(&frozen, "invalidEditValidationTrace").unwrap())
    );
}

#[test]
fn lone_surrogate_module_and_element_ids_match_frozen_typescript() {
    let e = engine();
    let r = registry(&e);
    let frozen = fixture();
    let document = get(&frozen, "surrogateSource").unwrap();
    let mut callback = Callback {
        calls: 0,
        labels: Vec::new(),
    };
    let result = edit_extension(
        document,
        &r,
        &Utf16::new(vec![0xd800]),
        &Utf16::new(vec![0xd800]),
        &"urn:test:note".into(),
        &e,
        &mut callback,
        &mut Context::ordinary(),
        |mut payload| {
            if let Value::Object(fields) = &mut payload {
                fields.push(("surrogate".into(), Value::Bool(true)));
            }
            Ok(payload)
        },
    )
    .unwrap();
    assert_eq!(result, *get(&frozen, "surrogateSuccess").unwrap());
}

#[test]
fn invalid_or_incomplete_source_refuses_before_updater_and_controls_stay_distinct() {
    let e = engine();
    let r = registry(&e);
    let invalid = parse(
        r#"{"umf":"0.10.0","id":"bad","vocabularies":{"urn:test:note":{"version":"1.0.0"}},"unknownFuture":{"retain":true},"modules":[]}"#,
    );
    let mut callback = Callback {
        calls: 0,
        labels: Vec::new(),
    };
    let mut updates = 0;
    let error = edit_extension(
        &invalid,
        &r,
        &"m".into(),
        &"e".into(),
        &"urn:test:note".into(),
        &e,
        &mut callback,
        &mut Context::ordinary(),
        |p| {
            updates += 1;
            Ok(p)
        },
    )
    .unwrap_err();
    assert_eq!(error.code, "UNSAFE_EDIT");
    assert_eq!(
        error.message.to_utf8().unwrap(),
        get(get(&fixture(), "unsafeRefusal").unwrap(), "message")
            .and_then(|v| if let Value::String(s) = v {
                s.to_utf8().ok()
            } else {
                None
            })
            .unwrap()
    );
    assert_eq!(updates, 0);
    let mut missing_callback = Callback {
        calls: 0,
        labels: Vec::new(),
    };
    let missing = edit_extension(
        &source(),
        &r,
        &"missing".into(),
        &"e".into(),
        &"urn:test:note".into(),
        &e,
        &mut missing_callback,
        &mut Context::ordinary(),
        |p| Ok(p),
    )
    .unwrap_err();
    let frozen = fixture();
    let frozen_missing = get(&frozen, "missingRefusal").unwrap();
    assert_eq!(missing.code, "MISSING_ELEMENT");
    assert_eq!(
        missing.message.to_utf8().unwrap(),
        get(frozen_missing, "message")
            .and_then(|v| if let Value::String(s) = v {
                s.to_utf8().ok()
            } else {
                None
            })
            .unwrap()
    );
    let mut callbacks = Callback {
        calls: 0,
        labels: Vec::new(),
    };
    let mut meter = |_| Err(EngineError::new("LIMIT", Utf16::default(), "meter stopped"));
    let mut ctx = Context::ordinary().with_meter(&mut meter);
    let error = edit_extension(
        &source(),
        &r,
        &"m".into(),
        &"e".into(),
        &"urn:test:note".into(),
        &e,
        &mut callbacks,
        &mut ctx,
        |p| Ok(p),
    )
    .unwrap_err();
    assert!(error.is_control_failure());
}

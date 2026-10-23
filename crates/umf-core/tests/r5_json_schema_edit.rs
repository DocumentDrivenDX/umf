// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    Context, Diagnostic, Severity, Utf16, Value,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    json_schema_adapter as js,
    registry::Registry,
    serialization::{self, Format},
};

fn parse(source: &str) -> Value {
    serialization::read_json_value(
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
fn document() -> Value {
    parse(
        r#"{"umf":"0.10.0","id":"r5-baseline","vocabularies":{"umf.json-schema":{"version":"0.1.0"}},"modules":[{"id":"schema","namespace":"https://example.test/edit","elements":[{"id":"schema","extensions":{"umf.json-schema":{"dialect":"https://json-schema.org/draft/2020-12/schema","baseUri":"https://example.test/edit","root":{"kind":"object","members":{"properties":{"kind":"object","members":{"n":{"kind":"object","members":{"type":{"kind":"string","value":"integer"}}}}}}},"resources":{}}}}]}]}"#,
    )
}
fn field(value: &Value, name: &str) -> Value {
    let Value::Object(fields) = value else {
        panic!("expected object")
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .unwrap()
        .1
        .clone()
}
fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().collect()
}
fn find_key_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    if let Value::Array(items) = value {
        for child in items {
            if let Some(found) = find_key_mut(child, name) {
                return Some(found);
            }
        }
        return None;
    }
    let Value::Object(fields) = value else {
        return None;
    };
    for (key, child) in fields.iter_mut() {
        if key == &Utf16::from(name) {
            return Some(child);
        }
        if let Some(found) = find_key_mut(child, name) {
            return Some(found);
        }
    }
    None
}
fn append_unknown_field(value: &mut Value, name: &str) {
    let Value::Object(fields) = value else {
        panic!("expected object")
    };
    fields.push((Utf16::from(name), Value::Bool(true)));
}
fn add_native_keyword(source: &mut Value, name: &str, tagged_value: Value) {
    let root = find_key_mut(source, "root").unwrap();
    let members = find_key_mut(root, "members").unwrap();
    let Value::Object(fields) = members else {
        panic!("expected native object members")
    };
    fields.push((Utf16::from(name), tagged_value));
}
#[derive(Default)]
struct SchemaOracle {
    unrelated_calls: usize,
}
impl Capabilities for SchemaOracle {
    fn validate_extension(
        &mut self,
        token: u64,
        payload: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        if token == 72 {
            self.unrelated_calls += 1;
            return Ok(Vec::new());
        }
        fn has_invalid_type(value: &Value) -> bool {
            match value {
                Value::String(text) => text == &Utf16::from("nonsense"),
                Value::Array(values) => values.iter().any(has_invalid_type),
                Value::Object(fields) => fields.iter().any(|(_, value)| has_invalid_type(value)),
                _ => false,
            }
        }
        if has_invalid_type(payload) {
            Ok(vec![Diagnostic {
                code: Utf16::from("JSON_SCHEMA_META"),
                path: Utf16::default(),
                message: Utf16::from("invalid type enum"),
                severity: Severity::Error,
                python_source_path: false,
                python_text_origin: None,
            }])
        } else {
            Ok(Vec::new())
        }
    }
}
fn registry(engine: &Engine) -> Registry {
    let mut registry = Registry::new();
    let resources = engine
        .schema_resources_with_context(&mut Context::catalog())
        .unwrap();
    registry
        .register_extension(
            &Utf16::from("umf.json-schema"),
            &Utf16::from("0.1.0"),
            &[Utf16::from("element")],
            &field(
                &parse(include_str!(
                    "../../../spec/extensions/json-schema/package.json"
                )),
                "schema",
            ),
            true,
            Some(71),
            engine.package_schema(),
            &resources,
            &mut Context::ordinary(),
        )
        .unwrap();
    registry
        .register_extension(
            &Utf16::from("urn:test:shared-dialect"),
            &Utf16::from("1.0.0"),
            &[Utf16::from("element")],
            &field(
                &parse(include_str!(
                    "../../../spec/extensions/json-schema/package.json"
                )),
                "schema",
            ),
            true,
            Some(72),
            engine.package_schema(),
            &resources,
            &mut Context::ordinary(),
        )
        .unwrap();
    registry
}

#[test]
fn edit_matches_frozen_success_and_refusal_with_atomic_source() {
    let source = document();
    let before = source.clone();
    let engine = engine();
    let registry = registry(&engine);
    let mut oracle = SchemaOracle::default();
    let edited = js::edit_node(
        &source,
        &Utf16::from("/properties/n"),
        &wide(r#"{"type":"integer","minimum":2}"#),
        &registry,
        &engine,
        &mut oracle,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(source, before);
    let payload = js::payload_from_document(&edited, &mut Context::ordinary()).unwrap();
    assert_eq!(
        js::export_root(&payload, &mut Context::ordinary())
            .unwrap()
            .to_utf8()
            .unwrap(),
        "{\"properties\":{\"n\":{\"type\":\"integer\",\"minimum\":2}}}\n"
    );

    let missing = js::edit_node(
        &source,
        &Utf16::from("/missing"),
        &wide("true"),
        &registry,
        &engine,
        &mut oracle,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_eq!(missing.code, "JSON_SCHEMA_POINTER");
    let invalid = js::edit_node(
        &source,
        &Utf16::from("/properties/n"),
        &wide(r#"{"type":"nonsense"}"#),
        &registry,
        &engine,
        &mut oracle,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_eq!(invalid.code, "INVALID_EDIT");
    let syntax = js::edit_node(
        &source,
        &Utf16::from("/properties/n/type"),
        &wide("{"),
        &registry,
        &engine,
        &mut oracle,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_eq!(syntax.code, "JSON_SCHEMA_SYNTAX");
    let mut cancelled = || true;
    let error = js::edit_node(
        &source,
        &Utf16::from("/properties/n"),
        &wide("true"),
        &registry,
        &engine,
        &mut oracle,
        &mut Context::ordinary().with_cancellation(&mut cancelled),
    )
    .unwrap_err();
    assert_eq!(error.code, "CANCELLED");
    assert_eq!(source, before);
}

#[test]
fn edit_inspection_omits_only_the_generic_profile_warning() {
    let payload = js::payload_from_document(&document(), &mut Context::ordinary()).unwrap();
    let ordinary = umf_core::json_schema_inspect::inspect_payload(
        &payload,
        &Utf16::default(),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(
        ordinary
            .iter()
            .any(|item| item.code == Utf16::from("JSON_SCHEMA_VALIDATOR_LIMIT"))
    );
    let edit = umf_core::json_schema_inspect::inspect_payload_for_edit(
        &payload,
        &Utf16::default(),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(edit.is_empty());
}

#[test]
fn unknown_representation_anywhere_blocks_edit_atomically() {
    let engine = engine();
    let registry = registry(&engine);
    for location in ["target", "untouched_root", "resource", "payload"] {
        let mut source = document();
        match location {
            "target" => append_unknown_field(
                find_key_mut(&mut source, "n").unwrap(),
                "futureRepresentation",
            ),
            "untouched_root" => append_unknown_field(
                find_key_mut(&mut source, "root").unwrap(),
                "futureRepresentation",
            ),
            "resource" => {
                let mut resource = parse(r#"{"kind":"object","members":{}}"#);
                append_unknown_field(&mut resource, "futureRepresentation");
                let Value::Object(resources) = find_key_mut(&mut source, "resources").unwrap()
                else {
                    panic!("expected resources object")
                };
                resources.push((Utf16::from("https://example.test/extra"), resource));
            }
            "payload" => append_unknown_field(
                find_key_mut(&mut source, "umf.json-schema").unwrap(),
                "futurePayload",
            ),
            _ => unreachable!(),
        }
        let before = source.clone();
        let mut oracle = SchemaOracle::default();
        let error = js::edit_node(
            &source,
            &Utf16::from("/properties/n"),
            &wide(r#"{"type":"integer","minimum":2}"#),
            &registry,
            &engine,
            &mut oracle,
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "UNSAFE_EDIT", "location={location}");
        assert_eq!(source, before, "location={location}");
    }
}

#[test]
fn source_semantic_limits_block_edit_even_with_permissive_capability() {
    let engine = engine();
    let registry = registry(&engine);
    let cases = [
        ("futureKeyword", r#"{"kind":"boolean","value":true}"#),
        (
            "$schema",
            r#"{"kind":"string","value":"https://json-schema.org/draft/2019-09/schema"}"#,
        ),
        (
            "$vocabulary",
            r#"{"kind":"object","members":{"https://example.test/vocab":{"kind":"boolean","value":true}}}"#,
        ),
        ("minimum", r#"{"kind":"number","value":"9007199254740993"}"#),
        (
            "unevaluatedProperties",
            r#"{"kind":"boolean","value":true}"#,
        ),
        ("type", r#"{"kind":"string","value":"nonsense"}"#),
    ];
    for (keyword, value) in cases {
        let mut source = document();
        add_native_keyword(&mut source, keyword, parse(value));
        let before = source.clone();
        let mut oracle = SchemaOracle::default();
        let error = js::edit_node(
            &source,
            &Utf16::from("/properties/n"),
            &wide(r#"{"type":"integer","minimum":2}"#),
            &registry,
            &engine,
            &mut oracle,
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "UNSAFE_EDIT", "keyword={keyword}");
        assert_eq!(source, before, "keyword={keyword}");
    }
}

#[test]
fn candidate_semantic_limits_fail_edit_atomically() {
    let engine = engine();
    let registry = registry(&engine);
    let replacements = [
        r#"{"type":"integer","futureKeyword":true}"#,
        r#"{"$schema":"https://json-schema.org/draft/2019-09/schema"}"#,
        r#"{"$vocabulary":{"https://example.test/vocab":true}}"#,
        r#"{"type":"number","minimum":9007199254740993}"#,
        r#"{"unevaluatedProperties":true}"#,
        r#"{"type":"nonsense"}"#,
    ];
    for replacement in replacements {
        let source = document();
        let before = source.clone();
        let mut permissive = SchemaOracle::default();
        let error = js::edit_node(
            &source,
            &Utf16::from("/properties/n"),
            &wide(replacement),
            &registry,
            &engine,
            &mut permissive,
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "INVALID_EDIT", "replacement={replacement}");
        assert_eq!(source, before, "replacement={replacement}");
    }
}

#[test]
fn unrelated_extension_with_same_dialect_keeps_its_capability_callback() {
    let engine = engine();
    let registry = registry(&engine);
    let mut source = document();
    let Value::Object(vocabularies) = find_key_mut(&mut source, "vocabularies").unwrap() else {
        panic!("expected vocabulary declarations")
    };
    vocabularies.push((
        Utf16::from("urn:test:shared-dialect"),
        parse(r#"{"version":"1.0.0"}"#),
    ));
    let mut other_payload = field(
        find_key_mut(&mut source, "extensions").unwrap(),
        "umf.json-schema",
    );
    add_native_keyword(
        &mut other_payload,
        "futureKeyword",
        parse(r#"{"kind":"boolean","value":true}"#),
    );
    let Value::Object(extensions) = find_key_mut(&mut source, "extensions").unwrap() else {
        panic!("expected extensions object")
    };
    extensions.push((Utf16::from("urn:test:shared-dialect"), other_payload));
    let before = source.clone();
    let mut oracle = SchemaOracle::default();
    let edited = js::edit_node(
        &source,
        &Utf16::from("/properties/n"),
        &wide(r#"{"type":"integer","minimum":2}"#),
        &registry,
        &engine,
        &mut oracle,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(source, before);
    assert_eq!(oracle.unrelated_calls, 2);
    assert!(find_key_mut(&mut edited.clone(), "urn:test:shared-dialect").is_some());
}

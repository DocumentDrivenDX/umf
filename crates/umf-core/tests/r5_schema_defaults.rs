// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    serialization::{read_json_value, Format},
    Context, Engine, ResourceSet, Utf16, Value,
};

fn parse(source: &str) -> Value {
    read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
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
            .map(|(_, v)| v),
        _ => None,
    }
}
fn get_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    match value {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn string(value: &Value) -> &Utf16 {
    match value {
        Value::String(value) => value,
        _ => panic!("expected string"),
    }
}
fn engine() -> Engine {
    let parse_resource = |source| parse(source);
    Engine::new(
        ResourceSet::new(
            parse_resource(include_str!("../../../spec/core/schema.json")),
            parse_resource(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
            parse_resource(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
            parse_resource(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
            parse_resource(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
        &mut Context::ordinary(),
    )
    .unwrap()
}

#[test]
fn frozen_typescript_resolve_core_default_outcomes_match() {
    let frozen = parse(include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-schema-defaults/frozen-typescript.json"));
    let source = get(&frozen, "source").unwrap();
    let cases = match get(&frozen, "outcomes").unwrap() {
        Value::Array(values) => values,
        _ => panic!("expected cases"),
    };
    let engine = engine();
    for case in cases {
        let id = string(get(case, "id").unwrap()).to_utf8().unwrap();
        let case_source = get(case, "source").unwrap_or(source);
        let source_before = case_source.clone();
        let result = engine.resolve_core_default_public(
            case_source,
            get(case, "identity").unwrap(),
            get(case, "input").unwrap(),
            &mut Context::ordinary(),
        );
        assert_eq!(case_source, &source_before, "source changed in {id}");
        if let Some(expected_error) = get(case, "error") {
            let actual = result.unwrap_err();
            let expected_message = string(get(expected_error, "message").unwrap());
            let expected_code = string(get(expected_error, "code").unwrap())
                .to_utf8()
                .unwrap();
            let expected_path = string(get(expected_error, "path").unwrap());
            assert_eq!(actual.code, expected_code, "{id}");
            assert_eq!(&actual.path, expected_path, "{id}");
            assert_eq!(&actual.message, expected_message, "{id}");
        } else {
            assert_eq!(result.unwrap(), *get(case, "result").unwrap(), "{id}");
        }
    }
}

#[test]
fn large_unknown_default_qualifier_is_metered_before_refusal_output() {
    let frozen = parse(include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-schema-defaults/frozen-typescript.json"));
    let mut source = get(&frozen, "source").unwrap().clone();
    let Value::Array(modules) = get_mut(&mut source, "modules").unwrap() else {
        panic!("expected modules")
    };
    let Value::Array(elements) = get_mut(&mut modules[0], "elements").unwrap() else {
        panic!("expected elements")
    };
    let default_value = get_mut(&mut elements[0], "default").unwrap();
    let Value::Object(default_fields) = default_value else {
        panic!("expected default")
    };
    let key = Utf16::new(vec![b'x' as u16; 1_000_000]);
    default_fields.push((key, Value::Null));

    let engine = engine();
    let mut charged = 0usize;
    let mut meter = |amount: usize| {
        charged += amount;
        Ok(())
    };
    let result = engine.resolve_core_default_public(
        &source,
        &parse(r#"{"module":"m","element":"quantity"}"#),
        &parse(r#"{"state":"missing"}"#),
        &mut Context::ordinary().with_meter(&mut meter),
    );
    let error = result.unwrap_err();
    assert_eq!(error.code, "CORE_SCHEMA_PROPERTY_UNKNOWN");
    assert!(charged >= 2_000_000, "charged only {charged} units");
}
